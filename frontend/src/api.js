import { S } from './state.js';

export const API_BASE = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:8787' : window.location.origin;

async function api(m, p, b) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
    const o = { method: m, headers };
    if (b) o.body = JSON.stringify(b);
    const r = await fetch(API_BASE + p, o);
    if (r.status === 401 && p !== '/api/v1/auth/login') { 
        if (window.doLogout) window.doLogout(); 
        throw new Error('Unauthorized'); 
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details ? data.details.map(i => i.message).join(', ') : 'API Error'));
    // ponytail: auto-unwrap enveloped arrays from backend (e.g. { ok: true, risks: [...] })
    if (data && data.ok === true) {
        for (const key in data) {
            if (key !== 'ok' && Array.isArray(data[key])) {
                return data[key];
            }
        }
    }
    return data;
}

export { api };
window.api = api;
