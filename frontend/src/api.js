import { S } from './state.js';

export const API_BASE = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:8787' : window.location.origin;

async function api(m, p, b) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
    // AbortSignal.timeout é nativo: sem ele, um backend travado deixava a UI
    // esperando para sempre, sem erro e sem feedback.
    const o = { method: m, headers, signal: AbortSignal.timeout(30000) };
    if (b) o.body = JSON.stringify(b);
    let r;
    try {
        r = await fetch(API_BASE + p, o);
    } catch (e) {
        if (e.name === 'TimeoutError') throw new Error(`Tempo esgotado ao chamar ${p} (30s)`);
        if (e.name === 'AbortError') throw new Error(`Requisição cancelada (${p})`);
        throw new Error(`Falha de rede ao chamar ${p}`);
    }
    if (r.status === 401 && p !== '/api/v1/auth/login') { 
        if (window.doLogout) window.doLogout(); 
        throw new Error('Unauthorized'); 
    }
    const contentType = r.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
        data = await r.json();
    } else {
        const text = await r.text();
        throw new Error(`Resposta HTTP ${r.status} não é JSON (${p})`);
    }
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
