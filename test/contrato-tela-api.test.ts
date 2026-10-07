import { describe, it, expect } from 'vitest';
import app from '../src/index';

/**
 * Contrato tela↔API (fatia de jornada, P1). Toda chamada do frontend a /api/v1 precisa casar
 * com uma rota registrada no app. Os testes de frontend dublam `api()`/`fetch` com o formato
 * que a TELA espera, então rota inexistente ou caminho errado passava neles e só aparecia como
 * 404 em produção (o questionário de autoatendimento chamava /public/assessment, a rota é
 * /assessments/public). Lado da tela: o fonte, via `?raw` (o workerd não tem node:fs). Lado do
 * servidor: `app.routes`, como em test/trilha-exclusao.test.ts.
 */
const FONTES = import.meta.glob(
  ['../frontend/src/**/*.js', '../frontend/public/*.{js,html}', '../frontend/login.html', '!../frontend/public/marked.min.js'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

type Chamada = { onde: string; metodo: string | null; caminho: string };

// Literal que começa em /api/v1: template (com `${...}` dentro, inclusive `${API_BASE}` na
// frente) ou string entre aspas simples/duplas.
const LITERAL = /`(?:\$\{API_BASE\})?(\/api\/v1(?:[^`$]|\$(?!\{)|\$\{[^}]*\})*)`|(['"])(\/api\/v1[^'"\n]*)\2/g;

/** Extrai as chamadas de um fonte: `${x}` e `'.../' + x` viram `:p`; query string sai. */
export function chamadasDoFonte(arquivo: string, src: string): Chamada[] {
  const out: Chamada[] = [];
  for (const m of src.matchAll(LITERAL)) {
    const inicio = m.index ?? 0;
    const metodo = /api\(\s*'([A-Z]+)'\s*,\s*$/.exec(src.slice(Math.max(0, inicio - 40), inicio))?.[1] ?? null;
    let caminho: string;
    if (m[1] !== undefined) {
      const cru = m[1];
      // `${x}` logo depois de `/` é segmento; em outro lugar (`readiness-check${q}`) é sufixo/query.
      caminho = cru.replace(/\$\{[^}]*\}/g, (_x: string, pos: number) => (cru[pos - 1] === '/' ? ':p' : ''));
    } else {
      caminho = m[3];
    }
    // Concatenação: '/a/' + id + '/b' → /a/:p/b. Expressão depois de literal sem `/` final é
    // sufixo (ex.: '/api/v1/funil' + consulta) e não vira segmento.
    let resto = src.slice(inicio + m[0].length, inicio + m[0].length + 120);
    for (;;) {
      const expr = /^\s*\+\s*(?![`'"])[\w$.]+(?:\([^)]*\))?/.exec(resto);
      if (!expr) break;
      if (caminho.endsWith('/')) caminho += ':p';
      resto = resto.slice(expr[0].length);
      const lit = /^\s*\+\s*(['"])([^'"]*)\1/.exec(resto);
      if (!lit) break;
      caminho += lit[2];
      resto = resto.slice(lit[0].length);
    }
    caminho = caminho.split('?')[0];
    if (caminho.endsWith('/')) caminho += ':p';
    out.push({ onde: `${arquivo}:${src.slice(0, inicio).split('\n').length}`, metodo, caminho });
  }
  return out;
}

// `ALL` é middleware (`app.use`), não rota; `/*` é o catch-all de assets, que casaria tudo.
const ROTAS = app.routes
  .filter((r) => r.method !== 'ALL' && r.path !== '/*')
  .map((r) => ({ metodo: r.method, segmentos: r.path.replace(/(.)\/$/, '$1').split('/') }));

/** `:p` do frontend só casa com parâmetro da rota, nunca com segmento literal (ação dinâmica vai para TOLERADAS). */
function casa(metodo: string | null, caminho: string): boolean {
  const seg = caminho.split('/');
  return ROTAS.some((r) =>
    (metodo === null || r.metodo === metodo)
    && r.segmentos.length === seg.length
    && r.segmentos.every((s, i) => s.startsWith(':') || s === seg[i]));
}

const chave = (c: { metodo: string | null; caminho: string }) => `${c.metodo ?? '*'} ${c.caminho}`;

/**
 * Chamadas que não casam sozinhas, cada uma com o motivo. `expande` lista os caminhos reais que
 * o trecho dinâmico produz no fonte (cada um tem de casar uma rota). Entrada sem chamada
 * correspondente reprova: tolerância velha não fica para trás.
 */
const TOLERADAS: { chave: string; motivo: string; expande: string[] }[] = [
  { chave: 'POST /api/v1/servicos/:p/:p', motivo: 'catalogo.js mudarSituacao(id, acao)', expande: ['POST /api/v1/servicos/:p/arquivar', 'POST /api/v1/servicos/:p/reativar'] },
  { chave: 'POST /api/v1/pedidos/:p/:p', motivo: 'meus-pedidos.js enviarDecisao(id, acao)', expande: ['POST /api/v1/pedidos/:p/aprovar', 'POST /api/v1/pedidos/:p/recusar'] },
  { chave: '* /api/v1/public/pedidos/:p', motivo: 'public/politicas.js postLink(acao)', expande: ['POST /api/v1/public/pedidos/ver', 'POST /api/v1/public/pedidos/codigo', 'POST /api/v1/public/pedidos/ciencia'] },
  { chave: '* /api/v1/public/propostas/:p', motivo: "public/proposta.js: const API = '/api/v1/public/propostas/'; chamar(acao)", expande: ['POST /api/v1/public/propostas/ver', 'POST /api/v1/public/propostas/aceitar', 'POST /api/v1/public/propostas/ajuste', 'POST /api/v1/public/propostas/recusar'] },
  { chave: '* /api/v1/projects/:p/export/:p', motivo: 'monitor.js exportCSV(type)', expande: ['GET /api/v1/projects/:p/export/risks', 'GET /api/v1/projects/:p/export/vendors', 'GET /api/v1/projects/:p/export/training', 'GET /api/v1/projects/:p/export/assets'] },
  { chave: '* /api/v1/auth/mfa/:p', motivo: 'api.js: prefixo de startsWith que isenta o 401 do MFA; não é chamada', expande: ['POST /api/v1/auth/mfa/verify'] },
  // Temporárias: rota inexistente, chamada que sai no P2 (modal de política).
  { chave: 'GET /api/v1/projects/:p/controls/:p/policy', motivo: 'modal de política; removida no P2', expande: [] },
  { chave: '* /api/v1/projects/:p/controls/:p/policy/report', motivo: 'Imprimir PDF da política; removida no P2', expande: [] },
  // Temporárias deste plano: cada tarefa que corrige a chamada apaga a entrada.
  { chave: '* /api/v1/public/assessment/:p', motivo: 'caminho errado do autoatendimento; corrigida na Task 4', expande: [] },
  { chave: '* /api/v1/public/assessment/:p/answers', motivo: 'caminho errado do autoatendimento; corrigida na Task 4', expande: [] },
  { chave: 'GET /api/v1/projects/:p/chat/history', motivo: 'histórico do chat sem rota; corrigida na Task 5', expande: [] },
  { chave: 'DELETE /api/v1/projects/:p/chat/history', motivo: 'limpar histórico sem rota; corrigida na Task 5', expande: [] },
];

const CHAMADAS = Object.entries(FONTES).flatMap(([arq, src]) => chamadasDoFonte(arq.replace(/^\.\.\//, ''), src));

describe('contrato tela↔API', () => {
  it('o teste não olha o vazio: há chamadas e rotas, e caminho inventado não casa', () => {
    expect(CHAMADAS.length).toBeGreaterThan(250);
    expect(ROTAS.length).toBeGreaterThan(100);
    expect(casa('GET', '/api/v1/nao-existe')).toBe(false);
    expect(casa('GET', '/api/v1/projects/:p/risks')).toBe(true);
    expect(casa('POST', '/api/v1/servicos/:p/:p')).toBe(false);
  });

  it('normaliza as formas de caminho que o frontend usa', () => {
    const src = [
      "api('GET', `/api/v1/projects/${p.id}/readiness-check${comIA ? '?ai=1' : ''}`)",
      "api('POST', '/api/v1/leads/' + lead.id + '/enrich-cnpj', { cnpj })",
      "fetch(API_BASE + '/api/v1/public/x/' + encodeURIComponent(t))",
      'fetch(`${API_BASE}/api/v1/projects/${id}/evidence/${e}/download`)',
      "api('GET', '/api/v1/funil' + consulta)",
      'window.open(`/api/v1/projects/${p}/ropa/report?token=${S.token}`)',
    ].join('\n');
    expect(chamadasDoFonte('f.js', src).map(chave)).toEqual([
      'GET /api/v1/projects/:p/readiness-check',
      'POST /api/v1/leads/:p/enrich-cnpj',
      '* /api/v1/public/x/:p',
      '* /api/v1/projects/:p/evidence/:p/download',
      'GET /api/v1/funil',
      '* /api/v1/projects/:p/ropa/report',
    ]);
  });

  it('nenhuma chamada monta o caminho fora de um literal /api/v1 (senão escaparia deste teste)', () => {
    // Cada uma destas recebe literais /api/v1 que o extrator já pega na origem.
    const PERMITIDAS = [
      'frontend/public/proposta.js: fetch(API + acao',
      'frontend/src/api.js: fetch(API_BASE + p',
      'frontend/src/views/propostas.js: api(\'GET\', caminho',
      'frontend/src/views/propostas.js: fetch(API_BASE + caminho',
    ];
    const DINAMICA = /\b(?:api\(\s*'[A-Z]+'\s*,|fetch\()\s*(?!\s)(?!(?:API_BASE\s*\+\s*)?['"`](?:\$\{API_BASE\})?\/api\/v1)[^,)\n]*/g;
    const achadas = Object.entries(FONTES)
      .flatMap(([arq, src]) => [...src.matchAll(DINAMICA)].map((m) => `${arq.replace(/^\.\.\//, '')}: ${m[0].trim()}`))
      .sort();
    expect(achadas).toEqual(PERMITIDAS);
  });

  it('toda chamada do frontend tem rota (ou tolerância com motivo)', () => {
    const toleradas = new Set(TOLERADAS.map((t) => t.chave));
    const orfas = CHAMADAS.filter((c) => !casa(c.metodo, c.caminho) && !toleradas.has(chave(c)));
    expect(orfas.map((c) => `${chave(c)} @ ${c.onde}`), 'chamada sem rota no backend').toEqual([]);
  });

  it('toda tolerância ainda tem chamada, e cada expansão casa uma rota', () => {
    for (const t of TOLERADAS) {
      expect(CHAMADAS.some((c) => chave(c) === t.chave && !casa(c.metodo, c.caminho)), `tolerância velha: ${t.chave}`).toBe(true);
      for (const e of t.expande) {
        const [metodo, caminho] = e.split(' ');
        expect(casa(metodo, caminho), `expansão sem rota: ${e}`).toBe(true);
      }
    }
  });
});
