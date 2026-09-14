import { S } from './state.js';

export const API_BASE = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:8787' : window.location.origin;

// `extras` carrega cabeçalho por chamada — hoje só o X-Operacao, que agrupa as
// linhas da trilha de uma ação em lote. Fica opcional para não tocar nas ~200
// chamadas existentes.
async function api(m, p, b, extras) {
    const headers = { 'Content-Type': 'application/json', ...(extras || {}) };
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
    // 401 nas rotas de MFA é resposta ESPERADA a erro do usuário: senha errada
    // em /setup e /disable, código errado em /activate e /verify. Deslogar aqui
    // punia quem errou um dígito — no /verify chegava a destruir a sessão e
    // jogar o usuário de volta ao login. Estas rotas tratam o próprio erro e
    // precisam da mensagem real do servidor, não de "Unauthorized".
    const autoatendimentoMfa = p.startsWith('/api/v1/auth/mfa/');

    // O corpo é lido UMA vez. A checagem de 401 precisa dele (para separar
    // sessão expirada de sessão inválida) e o erro logo abaixo também; ler duas
    // vezes exigiria `clone()`, que nem todo Response de teste implementa.
    const contentType = r.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
        data = await r.json();
    } else {
        await r.text();
        throw new Error(`Resposta HTTP ${r.status} não é JSON (${p})`);
    }

    if (r.status === 401 && p !== '/api/v1/auth/login' && !autoatendimentoMfa) {
        // Sessão expirada NÃO é o mesmo que sessão inválida. Expirou por
        // inatividade: o usuário continua sendo quem era e pode ter edição
        // aberta na tela — derrubar tudo perde o trabalho dele. Reautentica no
        // lugar, preservando o rascunho (ver pedirReautenticacao em globals.js).
        if (data?.expired === 'inactivity' && window.pedirReautenticacao) {
            window.pedirReautenticacao();
            throw new Error('Sessão expirada por inatividade');
        }
        if (window.doLogout) window.doLogout();
        throw new Error('Unauthorized');
    }
    if (!r.ok) {
        const err = new Error(data.error || (data.details ? data.details.map(i => i.message).join(', ') : 'API Error'));
        // O corpo inteiro fica pendurado no erro. O login precisa dos campos que
        // acompanham a mensagem (`challengeRequired`, `attemptsRemaining`,
        // `locked`) e antes eles se perdiam: só a string sobrevivia ao throw.
        err.status = r.status;
        err.body = data;
        throw err;
    }
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
