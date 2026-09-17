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

/**
 * Descobre as rotas de topo, compondo mount + caminho declarado.
 *
 * `semParametro` inverte o filtro de parâmetro e devolve o outro lado da porta:
 * as rotas de LISTAGEM (`GET /api/v1/projects`, `GET /api/v1/users`). Elas eram
 * invisíveis às duas varreduras — não há id a forjar numa rota sem parâmetro —,
 * e eram justamente onde estavam os dois piores buracos do branch: `SELECT *`
 * sem `WHERE` nenhum. O que se afirma sobre elas não é status, é o CORPO: uma
 * listagem escopada não menciona o tenant alheio.
 */
function rotasDeTopo(opcoes: { semParametro?: boolean } = {}): Rota[] {
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
      const temParametro = /:\w/.test(caminho);
      if (opcoes.semParametro) {
        // Só GET: varrer POST/PUT/DELETE sem parâmetro CRIARIA linha em vez de
        // ler uma, e a asserção aqui é sobre o que a resposta devolve.
        if (temParametro || m[2].toLowerCase() !== 'get') return;
      } else {
        if (!temParametro) return;                                // nada a forjar
      }
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
    // De propósito SEM `cliente_id`/`conta_id`: esta sessão nunca alcança o
    // ramo de comparação de tenant de `requireProjectAccess` (`cliente_id` do
    // ator falsy encerra aquele `if` antes de chegar à igualdade). Isso é
    // aceitável PORQUE a varredura abaixo é NEGATIVA — nunca afirma "meu
    // acesso ao próprio projeto funciona", só "id inexistente não responde
    // 2xx/5xx". Rota sem guarda nenhuma entregaria sucesso com QUALQUER ator,
    // órfão ou não, então este ator ainda pega esse defeito.
    //
    // A lacuna que isso ACEITA: uma mutação especificamente NA COMPARAÇÃO de
    // igualdade de `cliente_id` dentro de `requireProjectAccess` (ex.: trocar
    // `&&` por `||`, ou inverter o `===`) não seria pega aqui, porque o ramo
    // inteiro já está inalcançável para um ator sem escopo, com ou sem a
    // mutação. Essa comparação específica é coberta em outro lugar
    // (`idor-tenant.test.ts`, `idor-tenant-project-scoped.test.ts`), com
    // clientes reais e distintos dos dois lados.
    //
    // Dar cadeia real a este ator exigiria entender `semearTenantAlheio` (mais
    // abaixo neste arquivo) a fundo: ela semeia uma linha em TODA tabela do
    // schema via `sqlite_master`/`PRAGMA foreign_key_list`, inclusive em
    // `contas`/`clientes`, com heurística própria para achar e preencher FK —
    // mudar o formato de `projects`/`users` aqui arrisca quebrar essa
    // semeadura genérica para um ganho estreito. Decisão registrada na Task 10
    // (varredura de `sessionFor` com `client_project_id` sem `cliente_id`).
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
  // `cnpjSchema` recusa corpo vazio ANTES de `linhaDoFunilDaConta`, e um CNPJ
  // válido leva o pedido até a guarda de conta — que responde 404 sem chegar a
  // consultar a Receita (o `fetch` externo vem depois dela). Só a varredura 3
  // chegava a este 400: nas outras, `somenteMsp` recusa o ator antes.
  'POST /api/v1/leads/:id/enrich-cnpj': { cnpj: '11222333000181' },
};

/**
 * Semeia UMA linha por tabela, pertencente ao outro tenant, com id fixo.
 *
 * Derivada do banco, não escrita à mão: para cada tabela com coluna `id`,
 * insere `id` = o id alheio, `project_id` = o projeto alheio quando a coluna
 * existe, e um valor qualquer nas demais colunas NOT NULL sem default. Tabela
 * nova entra sozinha — mesma razão de a descoberta de rotas ler o fonte.
 */
/** Colunas com CHECK de enum: `'x'` não passa, e o PRAGMA não expõe o CHECK. */
const VALOR_FIXO: Record<string, Record<string, unknown>> = {
  legal_documents: { classification: 'comum' },
  contas: { tipo: 'msp' },
};

async function semearTenantAlheio(id: string, projeto: string): Promise<void> {
  const { results: tabelas } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
  ).all<{ name: string }>();

  const falhas: string[] = [];
  for (const { name } of tabelas) {
    if (name === 'projects') continue; // o projeto alheio é semeado à parte
    const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${name}")`).all<any>();
    if (!(cols as any[]).some((c) => c.name === 'id')) continue;
    // Chave estrangeira NOT NULL recebe o id alheio (ou o projeto alheio): a
    // linha referenciada já foi semeada nesta mesma passada, porque as tabelas
    // saem do sqlite_master na ordem em que foram criadas.
    const { results: fks } = await env.DB.prepare(`PRAGMA foreign_key_list("${name}")`).all<any>();
    const alvoFk = new Map((fks as any[]).map((f) => [f.from as string, f.table as string]));

    const usadas: string[] = [];
    const valores: unknown[] = [];
    for (const c of cols as any[]) {
      if (c.name === 'id') { usadas.push('id'); valores.push(id); continue; }
      if (c.name === 'project_id') { usadas.push('project_id'); valores.push(projeto); continue; }
      if (c.notnull && c.dflt_value === null) {
        usadas.push(c.name);
        const fixo = VALOR_FIXO[name]?.[c.name];
        if (fixo !== undefined) valores.push(fixo);
        else if (alvoFk.has(c.name)) valores.push(alvoFk.get(c.name) === 'projects' ? projeto : id);
        else valores.push(/INT|REAL|NUM/i.test(c.type ?? '') ? 0 : 'x');
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
    // De propósito SEM `cliente_id`/`conta_id`, mesma decisão do describe
    // acima ("Contrato de isolamento das rotas de topo"): a varredura 2
    // também é NEGATIVA — só afirma "nenhuma rota entrega o recurso REAL do
    // outro tenant" —, e rota sem guarda entregaria o dado alheio (2xx) para
    // QUALQUER ator, órfão ou não. A lacuna aceita é a mesma: uma mutação
    // especificamente na comparação de igualdade de `cliente_id` dentro de
    // `requireProjectAccess` não seria pega por este ator, porque o ramo de
    // cliente já está inalcançável sem `cliente_id` — essa comparação
    // específica é coberta com clientes reais em `idor-tenant.test.ts`. Dar
    // cadeia real aqui esbarraria em `semearTenantAlheio` acima, que semeia
    // TODA tabela do schema (inclusive `contas`/`clientes`) por heurística de
    // FK — risco desproporcional ao ganho. Decisão da Task 10.
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

// ═════════════════════════════════════════════════════════════════════════════
//  VARREDURA 3 — o ator é STAFF DE OUTRA CONSULTORIA
// ═════════════════════════════════════════════════════════════════════════════

/**
 * As duas varreduras acima usam SEMPRE `org_admin` com `client_project_id`, e é
 * por isso que ficaram verdes por dez tarefas sobre dois buracos abertos.
 *
 * Toda guarda que é allowlist de papel-CLIENTE (`org_admin`/`org_user`/`client`
 * comparados com `client_project_id`) recusa aquele ator pelo RAMO DE CLIENTE —
 * então o ramo de STAFF, que é o outro lado do mesmo `if`, nunca era exercitado.
 * `GET /api/v1/projects/:id` e `PUT /api/v1/projects/:id` respondiam 403 ao
 * `org_admin` e 200 ao `consultor` de outra conta, com o mesmo código. A
 * varredura não distinguia as duas coisas porque só conhecia um ator.
 *
 * Aqui o ator é `consultor` da conta B — staff legítimo de uma consultoria que
 * não é dona de nada do que se pede. Ele passa por `ehStaffDeConta`, por
 * `somenteStaff` e por `somenteMsp`, e mesmo assim não pode alcançar linha
 * alguma: é essa combinação que nenhum ator anterior tinha.
 *
 * `PROJ_ALHEIO` ganha cliente e conta REAIS aqui (a varredura 2 o deixa sem
 * cadeia de propósito, ver o comentário de lá). Sem isso, um projeto sem
 * `cliente_id` é recusado a qualquer staff por AUSÊNCIA de escopo, e a igualdade
 * `clientes.conta_id = user.conta_id` — que é o que a camada MSP existe para
 * checar — nunca seria exercitada.
 */
const CONTA_DONA = 'conta-dona-do-alheio';
const CONTA_OUTRA = 'conta-da-outra-consultoria';

/**
 * Rotas que a varredura 3 não pode julgar PELO STATUS — cada uma com o motivo.
 *
 * Duas formas, e nenhuma é vazamento:
 *
 * 1. **Escrita escopada que responde 2xx sem tocar a linha.** O `WHERE` traz
 *    `AND conta_id = ?`, então zero linha casa — mas o handler devolve
 *    `{ok:true}` de qualquer jeito. O status aqui não prova nada, nem no sentido
 *    bom nem no ruim; o que prova é a linha SOBREVIVER, e isso está afirmado com
 *    linha real em `camada-msp-funil-dados.test.ts` (lead) e em
 *    `camada-msp-vazamentos-finais.test.ts` (lead, assessment e proposta).
 *    Nenhuma delas aparece nas varreduras 1 e 2 porque `somenteMsp` recusa o ator
 *    `org_admin` antes do handler — só staff de conta `msp` chega até aqui.
 *
 * 2. **Parâmetro que não é id de linha.** `:cnpj` é um número da Receita, não uma
 *    chave desta base: não existe "CNPJ de outro tenant" a entregar, e a guarda
 *    que a rota precisa (`somenteMsp`, para não virar proxy de consulta) ela já
 *    tem.
 *
 * Lista SEPARADA de `CATALOGO_GLOBAL` de propósito: lá o 2xx devolve DADO que
 * pode ser devolvido; aqui o 2xx não devolve dado de tenant nenhum.
 */
const FORA_DA_VARREDURA_3: Record<string, string> = {
  'DELETE /api/v1/leads/:id': 'escrita escopada por conta_id, responde 200 sem apagar; a linha sobrevive',
  'DELETE /api/v1/proposals/:id': 'idem',
  'PUT /api/v1/leads/:id/status': 'idem',
  'PUT /api/v1/assessments/:id': 'idem',
  'PUT /api/v1/assessments/:id/pricing': 'idem',
  'GET /api/v1/leads/consulta-cnpj/:cnpj': ':cnpj não é id de linha desta base — proxy de consulta, guardado por somenteMsp',
};

/**
 * Listagens sem parâmetro cujo corpo cita o id semeado de forma LEGÍTIMA.
 *
 * `semearTenantAlheio` grava uma linha com o id alheio em toda tabela que tem
 * coluna `id` — inclusive nas que não têm tenant. Sem esta lista, a varredura de
 * listagem acusaria catálogo global e notificação de broadcast.
 */
const LISTAGEM_SEM_TENANT: Record<string, string> = {
  'GET /api/v1/policy-templates': 'catálogo global, `policy_templates` não tem project_id (mesma razão da entrada em CATALOGO_GLOBAL)',
  'GET /api/v1/marketplace/templates': 'mesma tabela `policy_templates`, mesmo catálogo global',
  'GET /api/v1/notifications': 'a semeadura deixa `user_id` NULL, e NULL é broadcast por desenho — o escopo é o DONO, não o projeto',
};

describe('Contrato de isolamento — o ator é staff de OUTRA consultoria', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO contas (id, tipo, nome, status) VALUES (?, 'msp', 'Dona', 'Active')`).bind(CONTA_DONA),
      env.DB.prepare(`INSERT OR IGNORE INTO contas (id, tipo, nome, status) VALUES (?, 'msp', 'Outra', 'Active')`).bind(CONTA_OUTRA),
    ]);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO clientes (id, conta_id, nome, status) VALUES ('cli-dona', ?, 'Cliente B', 'Active')`).bind(CONTA_DONA),
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(PROJ_ALHEIO, 'Cliente B', 'ISO 27001', 'controller', 'Active'),
    ]);
    await env.DB.prepare('UPDATE projects SET cliente_id = ? WHERE id = ?').bind('cli-dona', PROJ_ALHEIO).run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, conta_id) VALUES ('u-outra', 'consultor@outra.com', 'h', 'Consultor da outra', 'consultor', ?)`
    ).bind(CONTA_OUTRA).run();
    // A semeadura genérica só corre se a varredura 2 não tiver corrido antes
    // neste mesmo arquivo; `INSERT OR IGNORE` acima já cobre o caso de ter.
    const jaSemeado = await env.DB.prepare('SELECT 1 FROM evidence WHERE id = ?').bind(ID_ALHEIO).first();
    if (!jaSemeado) await semearTenantAlheio(ID_ALHEIO, PROJ_ALHEIO);

    const sessao = await sessionFor({
      id: 'u-outra', email: 'consultor@outra.com', role: 'consultor', conta_id: CONTA_OUTRA, cliente_id: null,
    });
    headers = { ...sessao, 'Content-Type': 'application/json' };
  });

  it('o projeto alheio tem cadeia conta→cliente de verdade (senão o ramo de staff não é exercitado)', async () => {
    const linha = await env.DB.prepare(
      'SELECT cl.conta_id FROM projects p JOIN clientes cl ON cl.id = p.cliente_id WHERE p.id = ?'
    ).bind(PROJ_ALHEIO).first<any>();
    expect(linha?.conta_id, 'projeto alheio sem conta: a recusa viria por ausência de escopo, não pela comparação').toBe(CONTA_DONA);
  });

  it('nenhuma rota entrega recurso de outro tenant a staff de outra consultoria', async () => {
    const rotas = rotasDeTopo().filter((r) => {
      const chave = `${r.metodo} ${r.caminho}`;
      return !(chave in EXCECOES) && !(chave in CATALOGO_GLOBAL) && !(chave in FORA_DA_VARREDURA_3);
    });
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
      if (res.status < 400 || res.status >= 500) entregou.push(`${res.status} ${chave}  (${r.origem})`);
      else if (res.status === 400) naoChegou.push(`${chave}  (${r.origem})`);
    }

    expect(entregou, `rotas que entregaram recurso alheio a staff de outra consultoria:\n  ${entregou.join('\n  ')}`).toEqual([]);
    expect(naoChegou, `rotas que pararam no 400 e nunca chegaram à guarda:\n  ${naoChegou.join('\n  ')}`).toEqual([]);
  });

  it('toda entrada de FORA_DA_VARREDURA_3 corresponde a uma rota que ainda existe', () => {
    const existentes = new Set(rotasDeTopo().map((r) => `${r.metodo} ${r.caminho}`));
    for (const chave of Object.keys(FORA_DA_VARREDURA_3)) {
      expect(existentes.has(chave), `entrada órfã em FORA_DA_VARREDURA_3: "${chave}"`).toBe(true);
    }
  });

  it('nenhuma LISTAGEM sem parâmetro menciona o tenant alheio', async () => {
    // O outro lado da porta. `GET /api/v1/projects` e `GET /api/v1/users` não
    // têm parâmetro e por isso escapavam das duas varreduras — e faziam
    // `SELECT *` sem `WHERE` para todo papel não-cliente. Aqui o que se afirma
    // é o corpo: listagem escopada não cita o id nem o projeto do outro tenant.
    const rotas = rotasDeTopo({ semParametro: true }).filter(
      (r) => !(`${r.metodo} ${r.caminho}` in LISTAGEM_SEM_TENANT)
    );
    expect(rotas.length, 'o filtro de rota sem parâmetro parou de casar').toBeGreaterThanOrEqual(10);

    const vazou: string[] = [];
    for (const r of rotas) {
      const res = await pedir(worker, r.caminho, { headers });
      const texto = await res.text();
      if (texto.includes(ID_ALHEIO) || texto.includes(PROJ_ALHEIO)) {
        vazou.push(`${res.status} ${r.metodo} ${r.caminho}  (${r.origem})`);
      }
    }
    expect(vazou, `listagens que mencionaram o tenant alheio:\n  ${vazou.join('\n  ')}`).toEqual([]);
  });
});
