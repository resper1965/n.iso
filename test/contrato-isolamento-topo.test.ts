import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';
import indexSrc from '../src/index.ts?raw';

/**
 * Contrato de isolamento das rotas de TOPO (`/api/v1/<coisa>/:id`).
 *
 * `test/idor-tenant.test.ts` prova o isolamento de uma LISTA de recursos. O
 * problema da lista é que ela não cresce sozinha: rota nova nasce descoberta, e
 * a omissão é silenciosa. Este teste ataca isso por outro lado — ele DESCOBRE
 * as rotas lendo o código-fonte, então uma rota nova entra no teste no mesmo
 * commit em que é escrita, sem ninguém lembrar de nada.
 *
 * A asserção é de COMPORTAMENTO, não de sintaxe, e a razão é concreta. Um teste
 * que só procurasse `requireResourceAccess` no corpo do handler teria aprovado
 * `PUT /api/v1/assets/:id`, onde a chamada existia — só que FORA do `try`, de
 * modo que a recusa virava 500 em vez de 403. A guarda ser convenção manual não
 * falha só por ausência; falha também por colocação. Só a resposta real
 * distingue as duas coisas.
 *
 * São DUAS varreduras, e a segunda existe porque a primeira não bastava.
 *
 * 1. **Id inexistente.** Pega colocação errada de guarda: `PUT /api/v1/assets/:id`
 *    chamava `requireResourceAccess` FORA do `try`, e a recusa virava 500 em vez
 *    de 403. Mas NÃO pega guarda ausente — foi verificado por mutação: removida
 *    a chamada de um handler de `evidence.ts`, esta varredura seguiu VERDE,
 *    porque rota sem guarda responde 404 a id inexistente igual à guardada.
 *
 * 2. **Recurso REAL do outro tenant.** Fecha aquela lacuna. Com uma linha do
 *    `proj-b` de fato no banco, a rota guardada recusa e a rota sem guarda
 *    ENTREGA — 200 com dado alheio, que nenhum outro estado imita. A mesma
 *    mutação em `evidence.ts` agora derruba o teste; é o critério de saída do
 *    item 1.6 do `enterprise-grade-plan.md`.
 *
 * Rotas sob `/api/v1/projects/:projectId/*` ficam de fora: ali quem responde é
 * o `projectAccessMiddleware`, e há teste próprio.
 */

const arquivos = import.meta.glob('../src/routes/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Exceções — cada uma com o motivo, não só o caminho.
 *
 * Entrada aqui é decisão consciente que aparece no diff do PR. Acrescentar uma
 * é barato de propósito; o que o teste impede é a rota nova passar sem que
 * ninguém tenha decidido nada sobre ela.
 */
const EXCECOES: Record<string, string> = {
  // O escopo desta rota não é o projeto, é o DONO da notificação, e o handler
  // responde 200 mesmo quando não altera nada — o filtro está no `WHERE ... AND
  // (user_id = ? OR user_id IS NULL)`. Aqui o status não prova coisa alguma; o
  // que prova é a linha, e isso está afirmado em `idor-tenant.test.ts`.
  'PUT /api/v1/notifications/:id/read':
    'escopo por dono, não por projeto; a asserção real é sobre a linha, em idor-tenant.test.ts',
};

/** Senha do usuário de teste; algumas rotas a exigem no corpo para assinar. */
const SENHA_DO_USUARIO = 'password123';

type Rota = { metodo: string; caminho: string; origem: string };

/** Descobre as rotas de topo com parâmetro, compondo mount + caminho declarado. */
function rotasDeTopo(): Rota[] {
  // `app.route('<mount>', <var>)` no composition root.
  const mount: Record<string, string> = {};
  for (const m of indexSrc.matchAll(/app\.route\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g)) {
    mount[m[2]] = m[1];
  }

  // De qual arquivo veio cada router (nomeado ou default). Guardamos os DOIS
  // caminhos derivados do mesmo nome de módulo: a chave do glob (que é relativa
  // a este arquivo) e o caminho do repositório (que vai na mensagem de falha).
  // Derivar um do outro por `replace('../', '')` recortaria só a primeira
  // ocorrência e é frágil à toa — o nome do módulo já está em mãos aqui.
  const arquivoDe: Record<string, { chave: string; origem: string }> = {};
  for (const m of indexSrc.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'\.\/routes\/([\w-]+)'/g)) {
    const modulo = m[3];
    const par = { chave: `../src/routes/${modulo}.ts`, origem: `src/routes/${modulo}.ts` };
    if (m[1]) for (const v of m[1].split(',')) arquivoDe[v.trim()] = par;
    else arquivoDe[m[2]] = par;
  }

  const rotas: Rota[] = [];
  for (const [routerVar, { chave, origem }] of Object.entries(arquivoDe)) {
    if (!(routerVar in mount)) continue; // importado mas não montado
    const src = arquivos[chave];
    if (!src) continue;
    src.split('\n').forEach((linha, i) => {
      const m = linha.match(/^\s*(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'/);
      if (!m || m[1] !== routerVar) return;
      const caminho = (mount[routerVar] + m[3]).replace(/\/$/, '') || '/';
      if (!/:\w/.test(caminho)) return;                          // sem parâmetro: nada a forjar
      if (/^\/api\/v1\/projects\/:\w+\//.test(caminho)) return;   // coberto pelo middleware
      rotas.push({
        metodo: m[2].toUpperCase(),
        caminho,
        origem: `${origem}:${i + 1}`,
      });
    });
  }
  return rotas;
}

/** Troca cada `:param` por um valor que não existe no banco. */
function forjarCaminho(caminho: string): string {
  return caminho.replace(/:(\w+)/g, (_todo, nome: string) =>
    nome.toLowerCase().includes('token') ? 'token-forjado-inexistente' : 'id-forjado-inexistente'
  );
}

describe('Contrato de isolamento das rotas de topo', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword(SENHA_DO_USUARIO);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'adm@a.com', senha, 'Admin do A', 'org_admin', 'proj-a'),
    ]);
    const sessao = await sessionFor({
      id: 'u-a', email: 'adm@a.com', role: 'org_admin', client_project_id: 'proj-a',
    });
    headers = { ...sessao, 'Content-Type': 'application/json' };
  });

  it('descobre as rotas de verdade (senão o teste passaria vazio)', () => {
    // Um parser que deixa de casar não FALHA — ele varre zero rota e o teste
    // fica verde sem ter testado nada. Este piso é o que impede isso; o número
    // é o levantamento de 2026-09 (77 rotas), com folga para remoção legítima.
    const rotas = rotasDeTopo();
    expect(rotas.length, 'o parser de rotas parou de casar — conferir os padrões').toBeGreaterThanOrEqual(70);
  });

  it('toda exceção declarada corresponde a uma rota que ainda existe', () => {
    // Exceção órfã é pior que exceção: dá a impressão de que alguém decidiu
    // algo sobre uma rota que já não está lá, e esconde que a lista envelheceu.
    const existentes = new Set(rotasDeTopo().map(r => `${r.metodo} ${r.caminho}`));
    for (const chave of Object.keys(EXCECOES)) {
      expect(existentes.has(chave), `exceção órfã: "${chave}" não corresponde a nenhuma rota`).toBe(true);
    }
  });

  it('id inexistente nunca responde sucesso nem erro de servidor', async () => {
    const rotas = rotasDeTopo().filter(r => !(`${r.metodo} ${r.caminho}` in EXCECOES));
    const falhas: string[] = [];

    for (const r of rotas) {
      const res = await pedir(worker, forjarCaminho(r.caminho), {
        method: r.metodo,
        headers,
        body: r.metodo === 'GET' ? undefined : '{}',
      });

      // 4xx é o resultado esperado, qualquer que seja: 403 (guarda de tenant ou
      // de papel), 404 (não existe), 400 (corpo vazio recusado). O que não pode
      // acontecer é sucesso — a rota entregou algo sem checar — nem 5xx, que
      // transforma recusa de rotina em erro de servidor e polui a taxa de 5xx.
      if (res.status < 400 || res.status >= 500) {
        falhas.push(`${res.status} ${r.metodo} ${r.caminho}  (${r.origem})`);
      }
    }

    expect(falhas, `rotas de topo sem guarda efetiva:\n  ${falhas.join('\n  ')}`).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  VARREDURA 2 — recurso REAL do outro tenant
// ═════════════════════════════════════════════════════════════════════════════

const ID_ALHEIO = 'recurso-do-outro-tenant';
const PROJ_ALHEIO = 'proj-b';

/**
 * Rotas que respondem 2xx de propósito, mesmo apontando para a linha alheia.
 *
 * Separada de `EXCECOES` porque o motivo é outro: lá a rota é dispensada da
 * varredura; aqui ela é varrida e o 2xx é o resultado CERTO. Misturar as duas
 * listas esconderia a diferença entre "não sabemos" e "sabemos que pode".
 */
const CATALOGO_GLOBAL: Record<string, string> = {
  // `policy_templates` não tem coluna `project_id` (ver `schema.sql`): é
  // catálogo de modelo de política, o mesmo para todos os clientes, e a rota
  // irmã `GET /api/v1/policy-templates` já lista tudo para qualquer sessão.
  // Não há dado de tenant a vazar aqui.
  'GET /api/v1/policy-templates/:id': 'catálogo global, sem coluna project_id',
};

/**
 * Corpos mínimos para rotas que VALIDAM antes de autorizar.
 *
 * Sem isto o handler devolve 400 no `validateBody` e a requisição nunca chega à
 * guarda — a rota entraria na varredura sem exercitar nada, e o teste ficaria
 * verde por engano. A varredura recusa 400 justamente para forçar uma entrada
 * aqui quando aparecer rota nova nessa forma.
 */
const CORPOS: Record<string, unknown> = {
  // `handleControlApprove` exige `password` no corpo (assinatura eletrônica) e
  // valida ANTES de chamar `requireResourceAccess`. A senha vai correta de
  // propósito: o que precisa recusar o pedido é a guarda de tenant, não a senha.
  'POST /api/v1/controls/:id/approve': { password: SENHA_DO_USUARIO },
  'PUT /api/v1/controls/:id/approve': { password: SENHA_DO_USUARIO },
};

/**
 * Semeia UMA linha por tabela, pertencente ao outro tenant, com id fixo.
 *
 * Derivada do banco, não escrita à mão: para cada tabela com coluna `id`,
 * insere `id` = o id alheio, `project_id` = o projeto alheio quando a coluna
 * existe, e um valor qualquer nas demais colunas NOT NULL sem default. Tabela
 * nova entra sozinha — mesma razão de a descoberta de rotas ler o fonte.
 */
async function semearTenantAlheio(id: string, projeto: string): Promise<void> {
  const { results: tabelas } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
  ).all<{ name: string }>();

  const falhas: string[] = [];
  for (const { name } of tabelas) {
    if (name === 'projects') continue; // o projeto alheio é semeado à parte
    const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${name}")`).all<any>();
    if (!(cols as any[]).some((c) => c.name === 'id')) continue;

    const usadas: string[] = [];
    const valores: unknown[] = [];
    for (const c of cols as any[]) {
      if (c.name === 'id') { usadas.push('id'); valores.push(id); continue; }
      if (c.name === 'project_id') { usadas.push('project_id'); valores.push(projeto); continue; }
      if (c.notnull && c.dflt_value === null) {
        usadas.push(c.name);
        valores.push(/INT|REAL|NUM/i.test(c.type ?? '') ? 0 : 'x');
      }
    }
    try {
      await env.DB.prepare(
        `INSERT INTO "${name}" (${usadas.map((u) => `"${u}"`).join(',')}) VALUES (${usadas.map(() => '?').join(',')})`
      ).bind(...valores).run();
    } catch (e: any) {
      falhas.push(`${name}: ${e?.message ?? e}`);
    }
  }

  // Tabela que não semeia devolve a rota correspondente ao caso "id
  // inexistente" — em silêncio, e sem provar guarda. Falhar aqui é o aviso.
  expect(falhas, `não foi possível semear o tenant alheio:\n  ${falhas.join('\n  ')}`).toEqual([]);
}

/** Como `forjarCaminho`, mas apontando para o recurso REAL do outro tenant. */
function forjarCaminhoAlheio(caminho: string): string {
  // O "recurso" desta rota é o próprio projeto; o id alheio é o projeto alheio.
  if (caminho === '/api/v1/projects/:id') return `/api/v1/projects/${PROJ_ALHEIO}`;
  return caminho.replace(/:(\w+)/g, (_todo, nome: string) => {
    // Token de auditor é público por desenho — quem tem o token entra. Usar um
    // token VÁLIDO alheio testaria o desenho, não a guarda; segue inexistente.
    if (nome.toLowerCase().includes('token')) return 'token-forjado-inexistente';
    if (nome === 'num') return '1';
    return ID_ALHEIO;
  });
}

describe('Contrato de isolamento — recurso REAL do outro tenant', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword(SENHA_DO_USUARIO);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(PROJ_ALHEIO, 'Cliente B', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'adm@a.com', senha, 'Admin do A', 'org_admin', 'proj-a'),
    ]);
    await semearTenantAlheio(ID_ALHEIO, PROJ_ALHEIO);
    const sessao = await sessionFor({
      id: 'u-a', email: 'adm@a.com', role: 'org_admin', client_project_id: 'proj-a',
    });
    headers = { ...sessao, 'Content-Type': 'application/json' };
  });

  it('nenhuma rota entrega recurso de outro tenant', async () => {
    const rotas = rotasDeTopo().filter(
      (r) => !(`${r.metodo} ${r.caminho}` in EXCECOES) && !(`${r.metodo} ${r.caminho}` in CATALOGO_GLOBAL)
    );
    const entregou: string[] = [];
    const naoChegou: string[] = [];

    for (const r of rotas) {
      const chave = `${r.metodo} ${r.caminho}`;
      const corpo = chave in CORPOS ? JSON.stringify(CORPOS[chave]) : '{}';
      const res = await pedir(worker, forjarCaminhoAlheio(r.caminho), {
        method: r.metodo,
        headers,
        body: r.metodo === 'GET' ? undefined : corpo,
      });

      // 2xx com a linha do proj-b existindo é entrega de dado alheio, e 5xx
      // continua sendo recusa transformada em erro de servidor.
      if (res.status < 400 || res.status >= 500) {
        entregou.push(`${res.status} ${chave}  (${r.origem})`);
      } else if (res.status === 400) {
        // 400 = o corpo foi recusado antes da autorização. A rota foi varrida
        // sem exercitar guarda nenhuma; falhar aqui força uma entrada em
        // `CORPOS` em vez de deixar a lacuna passar por verde.
        naoChegou.push(`${chave}  (${r.origem})`);
      }
    }

    expect(entregou, `rotas que entregaram recurso do outro tenant:\n  ${entregou.join('\n  ')}`).toEqual([]);
    expect(
      naoChegou,
      `rotas que pararam no 400 e nunca chegaram à guarda — acrescente o corpo mínimo em CORPOS:\n  ${naoChegou.join('\n  ')}`
    ).toEqual([]);
  });

  it('toda rota do catálogo global ainda existe', () => {
    const existentes = new Set(rotasDeTopo().map((r) => `${r.metodo} ${r.caminho}`));
    for (const chave of Object.keys(CATALOGO_GLOBAL)) {
      expect(existentes.has(chave), `entrada órfã em CATALOGO_GLOBAL: "${chave}"`).toBe(true);
    }
  });

  it('o recurso alheio existe de fato (senão a varredura 2 vira a varredura 1)', async () => {
    // Sem esta asserção, um erro na semeadura faria a varredura inteira testar
    // id inexistente de novo — verde, e sem provar nada além do que a 1 prova.
    const linha = await env.DB.prepare('SELECT project_id FROM evidence WHERE id = ?').bind(ID_ALHEIO).first<any>();
    expect(linha, 'a semeadura do tenant alheio não gravou').not.toBeNull();
    expect(linha.project_id).toBe(PROJ_ALHEIO);
  });
});
