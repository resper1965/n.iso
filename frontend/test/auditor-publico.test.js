// Página pública do auditor externo (public/auditor.html + auditor.js + auditor.css). O que importa:
// (1) o token sai do fragmento, some da barra e só viaja no CORPO; nunca em URL nem no console;
// (2) a SoA sai na ordem do Anexo A, com a exclusão justificada e a evidência de cada controle;
// (3) baixar manda o id no corpo e salva com o nome do arquivo; a prova junta as páginas;
// (4) nada inline no HTML (CSP script-src 'self'); toda classe pa-* tem regra; tokens do app.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lido = (glob) => Object.values(glob)[0];
const HTML = lido(import.meta.glob('../public/auditor.html', { query: '?raw', import: 'default', eager: true }));
const JS = lido(import.meta.glob('../public/auditor.js', { query: '?raw', import: 'default', eager: true }));
const CSS = lido(import.meta.glob('../public/auditor.css', { query: '?raw', import: 'default', eager: true }));
const APP_CSS = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));

const TOKEN = 'b'.repeat(64);
const EV = (id, nome, avaliacao) => ({ id, file_name: nome, file_type: 'x', file_size: 10, file_hash: id.repeat(32).slice(0, 64), evaluation_status: avaliacao, created_at: '2026-10-01 10:00:00' });
const VER = {
    projeto: { client_name: 'Cliente Alfa', project_name: 'SGSI Alfa', scope: 'Operação de TI da sede', standards: 'ISO 27001:2022', org_role: 'Controller' },
    expira_em: '2026-11-06 12:00:00',
    controles: [
        { id: 'c10', standard: 'ISO 27001:2022', title: 'A.5.10 — Uso aceitável', status: 'Implemented', maturity: 3, aplicavel: true, justificativa_exclusao: null, evidencias: [] },
        { id: 'c2', standard: 'ISO 27001:2022', title: 'A.5.2 — Papéis', status: 'Partial', maturity: 2, aplicavel: true, justificativa_exclusao: null, evidencias: [EV('e1', 'matriz <b>RACI</b>.xlsx', 'conforming')] },
        { id: 'c7', standard: 'ISO 27001:2022', title: 'A.7.4 — Monitoramento físico', status: 'Not Applicable', maturity: 0, aplicavel: false, justificativa_exclusao: 'Sem instalação física própria: escritório em cowork.', evidencias: [] },
    ],
    evidencias_sem_controle: [EV('e9', 'ata.pdf', 'pending')],
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 20));
const $ = (id) => document.getElementById(id);

let fetchMock;
let consoles;
function servidor(rotas) {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
        const r = rotas[String(url).replace(/^https?:\/\/[^/]+/, '')];
        if (r === undefined) return json({ error: 'sem rota' }, 500);
        return typeof r === 'function' ? r(o) : r;
    });
}
const corpos = (fim) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(fim)).map(([, o]) => JSON.parse(o.body));

async function abre(hash = '#' + TOKEN) {
    document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
    history.replaceState(null, '', '/auditor' + hash);
    window.auditorPublico.iniciar();
    await espera();
}

beforeEach(async () => {
    try { sessionStorage.clear(); } catch { /* sem storage */ }
    await import('../public/auditor.js');
    consoles = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});

afterEach(() => {
    // o token nunca vai para o console, para a URL de alguma chamada nem fica na barra
    for (const c of consoles) expect(JSON.stringify(c.mock.calls)).not.toContain(TOKEN);
    for (const [u] of fetchMock?.mock.calls || []) expect(String(u)).not.toContain(TOKEN);
    expect(location.href).not.toContain(TOKEN);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('HTML da página', () => {
    it('sem script, handler nem estilo inline; script e CSS próprios; fora de busca e sem Referer', () => {
        expect(HTML).not.toMatch(/\son[a-z]+\s*=/i);
        const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
        expect(scripts).toHaveLength(1);
        expect(scripts[0][1]).toContain('src="/auditor.js"');
        expect(scripts[0][2].trim()).toBe('');
        expect(HTML).not.toMatch(/<style\b/i);
        expect(HTML).not.toMatch(/\sstyle=/i);
        expect(HTML).toContain('href="/auditor.css"');
        expect(HTML).toContain('<meta name="robots" content="noindex, nofollow">');
        expect(HTML).toContain('<meta name="referrer" content="no-referrer">');
    });
});

describe('abrir o link', () => {
    it('o token sai do fragmento, some da barra e só vai no corpo', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER) });
        await abre();
        expect(corpos('/ver')).toEqual([{ token: TOKEN }]);
        expect($('pa-conteudo').hidden).toBe(false);
        expect($('pa-org').textContent).toBe('SGSI Alfa');
        expect($('pa-cliente').textContent).toBe('Cliente Alfa');
        expect($('pa-escopo').textContent).toBe('Operação de TI da sede');
        expect($('pa-meta').textContent).toContain('06/11/2026');
    });

    it('F5: o token fica na sessão da aba', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER) });
        await abre();
        await abre('');
        expect(corpos('/ver')).toEqual([{ token: TOKEN }, { token: TOKEN }]);
    });

    it('sem token no endereço: pede o link completo e não chama a API', async () => {
        servidor({});
        await abre('');
        expect($('pa-estado-titulo').textContent).toBe('Link inválido ou expirado');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('404: link inválido ou expirado, sem mostrar conteúdo', async () => {
        servidor({ '/api/v1/public/auditor/ver': json({ error: 'Link inválido ou expirado' }, 404) });
        await abre();
        expect($('pa-estado-titulo').textContent).toBe('Link inválido ou expirado');
        expect($('pa-conteudo').hidden).toBe(true);
    });
});

describe('SoA', () => {
    it('ordem do Anexo A, exclusão justificada, evidência por controle e as sem controle à parte', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER) });
        await abre();
        expect([...document.querySelectorAll('.pa-cod')].map((t) => t.textContent)).toEqual(['A.5.2', 'A.5.10', 'A.7.4']);
        const linhas = [...document.querySelectorAll('.pa-tabela tbody tr')];
        expect(linhas[2].textContent).toContain('Não aplicável');
        expect(linhas[2].textContent).toContain('Sem instalação física própria: escritório em cowork.');
        expect(linhas[0].textContent).toContain('matriz <b>RACI</b>.xlsx');
        expect(document.querySelector('.pa-tabela b')).toBeNull();
        expect(linhas[0].textContent).toContain('Conforme');
        expect(linhas[0].textContent).toContain(VER.controles[1].evidencias[0].file_hash);
        expect(linhas[1].textContent).toContain('Nenhuma evidência ligada');
        expect($('pa-sem-controle').hidden).toBe(false);
        expect($('pa-sem-controle-lista').textContent).toContain('ata.pdf');
        expect($('pa-sem-controle-lista').textContent).toContain('Pendente de revisão');
    });
});

describe('baixar', () => {
    it('evidência: id no corpo, arquivo salvo com o nome original', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/evidencia': () => new Response('conteudo', { status: 200 }) });
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }));
        const nomes = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { nomes.push(this.download); });
        await abre();
        document.querySelector('button[data-baixar="e1"]').click();
        await espera();
        expect(corpos('/evidencia')).toEqual([{ token: TOKEN, evidence_id: 'e1' }]);
        expect(nomes).toEqual(['matriz <b>RACI</b>.xlsx']);
    });

    it('evidência que não abre mais (link revogado ou arquivo sumiu): aviso na página', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/evidencia': json({ error: 'Link inválido ou expirado' }, 404) });
        await abre();
        document.querySelector('button[data-baixar="e9"]').click();
        await espera();
        expect($('pa-aviso').textContent).toContain('não encontrado ou o link expirou');
    });

    it('prova dos pedidos: junta as páginas num arquivo JSON', async () => {
        servidor({
            '/api/v1/public/auditor/ver': json(VER),
            '/api/v1/public/auditor/pedidos': (o) => {
                const { pagina } = JSON.parse(o.body);
                return json(pagina === 1 ? { total: 2, pagina: 1, truncado: true, pedidos: [{ id: 'p1' }] } : { total: 2, pagina: 2, truncado: false, pedidos: [{ id: 'p2' }] });
            },
        });
        let partes;
        const BlobOriginal = Blob;
        vi.stubGlobal('Blob', class extends BlobOriginal { constructor(p, o) { super(p, o); partes = p; } });
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }));
        const nomes = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { nomes.push(this.download); });
        await abre();
        $('pa-prova').click();
        await espera();
        expect(corpos('/pedidos')).toEqual([{ token: TOKEN, pagina: 1 }, { token: TOKEN, pagina: 2 }]);
        expect(JSON.parse(partes[0]).pedidos.map((p) => p.id)).toEqual(['p1', 'p2']);
        expect(nomes).toEqual(['prova-dos-pedidos.json']);
    });
});

describe('nota do auditor', () => {
    const NOTAS = { notas: [
        { id: 'n2', control_title: 'A.5.2 — Papéis', note_type: 'question', content: 'Pergunta <b>respondida</b>', response: 'Segue em <i>anexo</i>', responded_at: '2026-10-03 10:00:00', created_at: '2026-10-02 10:00:00' },
        { id: 'n3', control_title: null, note_type: 'question', content: 'Pergunta aberta', response: null, responded_at: null, created_at: '2026-10-04 10:00:00' },
    ] };

    it('lista as perguntas com a resposta (ou "Aguardando resposta"), tudo como texto', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/notas': json(NOTAS) });
        await abre();
        expect(corpos('/notas')).toEqual([{ token: TOKEN }]);
        const itens = [...document.querySelectorAll('#pa-nota-lista li')];
        expect(itens).toHaveLength(2);
        expect(itens[0].textContent).toContain('Pergunta <b>respondida</b>');
        expect(itens[0].textContent).toContain('Segue em <i>anexo</i>');
        expect(itens[0].textContent).toContain('02/10/2026');
        expect(itens[1].textContent).toContain('Aguardando resposta');
        expect(document.querySelector('#pa-nota-lista b, #pa-nota-lista i')).toBeNull();
    });

    it('depois de enviar, a lista é recarregada', async () => {
        let n = 0;
        servidor({
            '/api/v1/public/auditor/ver': json(VER),
            '/api/v1/public/auditor/notas': () => json(n++ ? NOTAS : { notas: [] }),
            '/api/v1/public/auditor/notas/criar': json({ ok: true, id: 'n9' }),
        });
        await abre();
        expect(document.querySelectorAll('#pa-nota-lista li')).toHaveLength(0);
        $('pa-nota-texto').value = 'Outra pergunta';
        $('pa-nota-enviar').click();
        await espera();
        expect(corpos('/notas')).toHaveLength(2);
        expect(document.querySelectorAll('#pa-nota-lista li')).toHaveLength(2);
    });

    it('pergunta vai com o token no corpo e o campo limpa; vazio não chama', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/notas': json({ notas: [] }), '/api/v1/public/auditor/notas/criar': json({ ok: true, id: 'n1' }) });
        await abre();
        $('pa-nota-enviar').click();
        await espera();
        expect(corpos('/notas/criar')).toEqual([]);
        $('pa-nota-texto').value = 'Onde está a matriz RACI assinada?';
        $('pa-nota-enviar').click();
        await espera();
        expect(corpos('/notas/criar')).toEqual([{ token: TOKEN, content: 'Onde está a matriz RACI assinada?' }]);
        expect($('pa-nota-texto').value).toBe('');
        expect($('pa-nota-msg').textContent).toContain('registrada');
    });

    it('falha ao registrar: o texto fica e o aviso aparece', async () => {
        servidor({ '/api/v1/public/auditor/ver': json(VER), '/api/v1/public/auditor/notas/criar': json({ error: 'x' }, 500) });
        await abre();
        $('pa-nota-texto').value = 'Pergunta';
        $('pa-nota-enviar').click();
        await espera();
        expect($('pa-nota-texto').value).toBe('Pergunta');
        expect($('pa-nota-msg').textContent).toContain('Não foi possível');
    });
});

describe('auditor.css', () => {
    const semComentario = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
    const tokens = (bruto, texto = semComentario(bruto)) => Object.fromEntries([...texto.slice(texto.indexOf(':root'), texto.indexOf('}', texto.indexOf(':root'))).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

    it('toda classe pa-* do HTML e do script tem regra', () => {
        const usadas = new Set([...HTML.matchAll(/class="([^"]*)"/g), ...JS.matchAll(/class="([^"]*)"/g)]
            .flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('pa-')));
        expect(usadas.size).toBeGreaterThan(20);
        const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(CSS));
        expect(sem, 'classes sem regra no CSS').toEqual([]);
    });

    it('os tokens são os do :root de style.css', () => {
        const daqui = tokens(CSS);
        const dele = tokens(APP_CSS);
        expect(Object.keys(daqui).length).toBeGreaterThan(8);
        expect(Object.entries(daqui).filter(([k, v]) => dele[k] !== v)).toEqual([]);
    });

    it('sem itálico e sem accent como fundo', () => {
        expect(CSS).not.toMatch(/font-style:\s*italic/);
        expect(CSS).not.toMatch(/background(-color)?:\s*var\(--accent\)/);
    });
});
