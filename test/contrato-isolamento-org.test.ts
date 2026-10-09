import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Fatia 5, tarefa 3: a rede de proteção do isolamento entre ORGANIZAÇÕES (consultorias).
 *
 * `org-corte.test.ts` prova uma rota representativa de cada grupo; este percorre `app.routes`
 * inteiro, então rota nova entra na varredura no mesmo commit em que é escrita. Duas organizações
 * completas são semeadas (`org_ness` e `org_b`), cada uma com UMA linha em toda tabela que tem
 * `project_id`, `org_id` ou chave estrangeira para uma delas — derivado do banco, como em
 * `contrato-isolamento-topo.test.ts`, para que tabela nova entre sozinha.
 *
 * Toda linha de uma organização carrega o marcador dela (`zzn`/`zzb`) no id e no texto. Três
 * varreduras, nos dois sentidos, para consultor, comercial, consultoria_admin, org_admin e stakeholder
 * de cada organização, para um agente MCP, uma chave de API e o auditor externo (token do portal),
 * todos presos a projeto da própria organização:
 *
 * 1. **Por id**: rota com parâmetro, forjada com o id REAL da organização alheia → 4xx.
 *    2xx é entrega; 5xx é recusa virando erro. 400 (corpo recusado antes da guarda) e 429 (limite)
 *    não provam nada: a rota precisa de corpo em `CORPOS` ou de entrada em `NAO_PROVADAS_POR_CORPO`.
 * 2. **Listas e respostas**: toda rota GET, forjada com os ids da PRÓPRIA organização, não pode
 *    trazer o marcador alheio em lugar nenhum do corpo (lista, agregado, aninhada, exportação).
 * 3. **Criação com referência alheia**: rota sem parâmetro que não é GET precisa estar
 *    classificada: ou recebe corpo apontando para o alheio (`CRIA_COM_REFERENCIA`, → 4xx), ou é
 *    declarada sem recurso alheio (`SEM_RECURSO_ALHEIO`, com o motivo). Rota nova fora das duas
 *    listas FALHA — como em `trilha-exclusao.test.ts`.
 */

const SENHA = 'Senha-forte-123!';
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

type Org = { org: string; m: string; proj: string; rec: string };
const NESS: Org = { org: 'org_ness', m: 'zzn', proj: 'zzn-proj', rec: 'zzn-rec' };
const B: Org = { org: 'org_b', m: 'zzb', proj: 'zzb-proj', rec: 'zzb-rec' };

type Rota = { metodo: string; caminho: string; chave: string };

function todasAsRotas(): Rota[] {
  const vistas = new Set<string>();
  const rotas: Rota[] = [];
  for (const r of app.routes) {
    if (!METODOS.includes(r.method)) continue;
    const chave = `${r.method} ${r.path}`;
    if (vistas.has(chave) || r.path === '/*') continue; // `/*` é o catch-all dos estáticos
    vistas.add(chave);
    rotas.push({ metodo: r.method, caminho: r.path, chave });
  }
  return rotas;
}
const temParametro = (r: Rota) => /:\w/.test(r.caminho);

/**
 * Rotas com parâmetro dispensadas da varredura por id. Cada uma diz POR QUE é segura.
 */
const EXCECOES: Record<string, string> = {
  // Consulta a CNPJ em base pública externa (faz fetch para fora); não lê dado de organização.
  'GET /api/v1/leads/consulta-cnpj/:cnpj': 'consulta pública externa de CNPJ, sem dado de tenant',
  // Responde 200 mesmo sem alterar nada: o filtro é por dono no WHERE; a asserção real é sobre a
  // linha (`org-corte.test.ts` e `idor-tenant.test.ts`), e aqui a linha alheia é conferida abaixo.
  'PUT /api/v1/notifications/:id/read': 'escopo por destinatário; prova pela linha, não pelo status',
};

/** Corpos que passam a validação, para a guarda de organização ser o que recusa. */
const CORPOS: Record<string, (alvo: Org) => unknown> = {
  'POST /api/v1/controls/:id/approve': () => ({ password: SENHA }),
  'PUT /api/v1/controls/:id/approve': () => ({ password: SENHA }),
  'PUT /api/v1/leads/:id/status': () => ({ status: 'Lost' }),
  // pedido alheio: a guarda é o destinatário + projeto (404) antes da senha
  'POST /api/v1/pedidos/:id/aprovar': () => ({ senha: SENHA }),
  'POST /api/v1/pedidos/:id/recusar': () => ({ senha: SENHA }),
  'POST /api/v1/projects/:projectId/pedidos': (alvo) => ({ tipo: 'dpia', ref_id: alvo.rec, papel_exigido: 'ciente', destinatarios: [{ email: `stk@${alvo.m}.lat` }] }),
  'POST /api/v1/leads/:id/enrich-cnpj': () => ({ cnpj: '11222333000181' }),
  'PUT /api/v1/projects/:projectId/modulos/:modulo': () => ({ habilitado: true }),
  'POST /api/v1/projects/:projectId/departamentos': () => ({ nome: 'Varredura' }),
  'PUT /api/v1/projects/:projectId/departamentos/:id': () => ({ nome: 'Varredura' }),
  'POST /api/v1/projects/:projectId/partes': () => ({ nome: 'Varredura' }),
  'PUT /api/v1/projects/:projectId/partes/:id': () => ({ nome: 'Varredura' }),
  'POST /api/v1/projects/:projectId/partes/:id/vinculos': (alvo) => ({ papel: 'responsavel', alvo_tipo: 'departamento', alvo_id: alvo.rec }),
  // tenta trazer o projeto alheio para a organização de quem chama: só platform_admin transfere
  'POST /api/v1/platform/projects/:id/transferir': (alvo) => ({ orgDestinoId: alvo === B ? NESS.org : B.org, motivo: 'varredura de isolamento' }),
};

/**
 * Rotas que param no 400 e para as quais não há corpo simples que chegue à guarda. Cada uma com o
 * motivo; o relatório da tarefa as lista como "não provadas por corpo".
 */
const NAO_PROVADAS_POR_CORPO: Record<string, string> = {};

/** Rota sem parâmetro, não GET, que recebe referência ALHEIA no corpo e precisa recusar. */
const CRIA_COM_REFERENCIA: Record<string, (alvo: Org) => unknown> = {
  'POST /api/v1/users': (a) => ({ email: `novo-${crypto.randomUUID()}@x.com`, password: SENHA, name: 'N', role: 'org_user', client_project_id: a.proj }),
  'POST /api/v1/admin/users': (a) => ({ email: `novo-${crypto.randomUUID()}@x.com`, password: SENHA, name: 'N', role: 'org_user', client_project_id: a.proj }),
  'POST /api/v1/assessments': (a) => ({ client_name: 'X', lead_id: a.rec }),
  'POST /api/v1/proposals': (a) => ({ lead_id: a.rec, assessment_id: a.rec, total_price: 1, content_html: '<p>x</p>' }),
  'POST /api/v1/propostas': (a) => ({ leadId: a.rec }),
};

/**
 * Corpos ADICIONAIS com referência alheia (a mesma rota com outro corpo), mais o PUT na conta da
 * PRÓPRIA organização tentando prendê-la a projeto alheio. Revisão final da fatia 5, B1: conta de
 * equipe presa a projeto de outra organização entrava com acesso total a ele.
 */
const REFERENCIA_ALHEIA_EXTRA: [string, (p: { de: Org; alheio: Org }) => string, (p: { de: Org; alheio: Org }) => unknown][] = [
  ['POST', () => '/api/v1/users', (p) => ({ email: `novo-${crypto.randomUUID()}@x.com`, password: SENHA, name: 'N', role: 'comercial', client_project_id: p.alheio.proj })],
  ['POST', () => '/api/v1/admin/users', (p) => ({ email: `novo-${crypto.randomUUID()}@x.com`, password: SENHA, name: 'N', role: 'consultor', client_project_id: p.alheio.proj })],
  ['PUT', (p) => `/api/v1/users/${p.de.m}-com`, (p) => ({ client_project_id: p.alheio.proj })],
  ['PUT', (p) => `/api/v1/users/${p.de.m}-cli`, (p) => ({ role: 'comercial', client_project_id: p.alheio.proj })],
];

/**
 * Rota do PRÓPRIO projeto (ou recurso) com id de recurso alheio no corpo: `control_id`, `risk_id`,
 * `ropa_id`… A guarda de acesso olha a URL; quem confere o corpo é `refForaDoProjeto`. Sem ela o
 * risco gravava o controle alheio e a lista exibia o título dele; a CAPA apontava para o risco
 * alheio e morria no ON DELETE CASCADE quando o dono o apagava.
 */
type Ctx = { de: Org; alheio: Org; token?: string };
const VINCULO_ALHEIO: [string, (p: Ctx) => string, (p: Ctx) => unknown][] = [
  ['POST', (p) => `/api/v1/projects/${p.de.proj}/risks`, (p) => ({ asset: 'A', threat: 'T', control_id: p.alheio.rec })],
  ['PUT', (p) => `/api/v1/risks/${p.de.rec}`, (p) => ({ asset: 'A', threat: 'T', asset_id: p.alheio.rec })],
  ['POST', (p) => `/api/v1/projects/${p.de.proj}/capa`, (p) => ({ title: 'C', description: 'd', severity: 'Low', assigned_to: 'x', due_date: '2099-01-01', risk_id: p.alheio.rec })],
  ['PUT', (p) => `/api/v1/capa/${p.de.rec}`, (p) => ({ title: 'C', description: 'd', severity: 'Low', assigned_to: 'x', due_date: '2099-01-01', status: 'Open', audit_id: p.alheio.rec })],
  ['POST', (p) => `/api/v1/audits/${p.de.rec}/findings`, (p) => ({ project_id: p.de.proj, finding_type: 'observation', description: 'd', control_id: p.alheio.rec })],
  ['POST', () => '/api/v1/public/auditor/notas/criar', (p) => ({ token: p.token ?? 'token-forjado-inexistente', content: 'n', control_id: p.alheio.rec })],
  ['POST', (p) => `/api/v1/projects/${p.de.proj}/dpia`, (p) => ({ processing_name: 'P', data_category_risk: 'r', necessity_proportionality: 'n', technical_measures: 't', ropa_id: p.alheio.rec })],
];

/** Rota sem parâmetro, não GET, que não recebe nem devolve recurso de outra organização. */
const SEM_RECURSO_ALHEIO: Record<string, string> = {
  'POST /api/v1/auth/setup': 'bootstrap do primeiro admin, por SETUP_KEY; sem sessão',
  'POST /api/v1/requisitos/semear': 'catálogo global de requisitos, só platform_admin; não recebe id de recurso',
  'POST /api/v1/requisitos/mapeamentos': 'catálogo global de requisitos, só platform_admin; ids são de requisito, não de organização',
  'PUT /api/v1/requisitos/mapeamentos': 'catálogo global de requisitos, só platform_admin',
  'DELETE /api/v1/requisitos/mapeamentos': 'catálogo global de requisitos, só platform_admin',
  'POST /api/v1/auth/login': 'login: identidade global por e-mail e senha',
  'POST /api/v1/auth/reset-password-first': 'troca da senha provisória da própria conta',
  'POST /api/v1/auth/forgot-password': 'pedido de redefinição por e-mail; não devolve dado',
  'POST /api/v1/auth/reset-password': 'redefinição por token de uso único da própria conta',
  'POST /api/v1/auth/logout': 'encerra a própria sessão',
  'POST /api/v1/auth/change-password': 'senha da própria conta',
  'POST /api/v1/auth/mfa/setup': 'segundo fator da própria conta',
  'POST /api/v1/auth/mfa/activate': 'segundo fator da própria conta',
  'POST /api/v1/auth/mfa/verify': 'segundo fator da própria conta',
  'POST /api/v1/auth/mfa/disable': 'segundo fator da própria conta',
  'POST /api/v1/public/policies/request-otp': 'portal público de ciência de política, por OTP do próprio e-mail',
  'POST /api/v1/public/policies/verify-otp': 'portal público de ciência de política, por OTP do próprio e-mail',
  'POST /api/v1/public/policies/ack': 'portal público de ciência de política, por token emitido no OTP',
  'POST /api/v1/public/sso/iniciar': 'início de SSO: só redireciona ao provedor',
  'POST /api/v1/public/propostas/ver': 'proposta pública: o token do link é a autorização',
  'POST /api/v1/public/propostas/aceitar': 'proposta pública: o token do link é a autorização',
  'POST /api/v1/public/propostas/recusar': 'proposta pública: o token do link é a autorização',
  'POST /api/v1/public/propostas/ajuste': 'proposta pública: o token do link é a autorização',
  'POST /api/v1/public/pedidos/ver': 'ciência por link: o token pessoal do link é a autorização',
  'POST /api/v1/public/pedidos/codigo': 'ciência por link: o token pessoal do link é a autorização; o código vai ao e-mail do destinatário',
  'POST /api/v1/public/pedidos/ciencia': 'ciência por link: token pessoal do link + código do e-mail do destinatário',
  'POST /api/v1/public/auditor/ver': 'portal do auditor: o token do link (no corpo) é a autorização, preso a um projeto; isolamento em test/portal-auditor.test.ts',
  'POST /api/v1/public/auditor/evidencia': 'portal do auditor: token no corpo; evidência alheia por id é 404 (test/portal-auditor.test.ts)',
  'POST /api/v1/public/auditor/pedidos': 'portal do auditor: token no corpo, prova só do projeto do token',
  'POST /api/v1/public/auditor/notas': 'portal do auditor: token no corpo, notas só do projeto do token',
  'POST /api/v1/public/auditor/notas/criar': 'portal do auditor: token no corpo; control_id alheio coberto em VINCULO_ALHEIO',
  'POST /scim/v2/Users': 'SCIM: token próprio do projeto, cria usuário só naquele projeto',
  'POST /oauth/authorize/entrar': 'login do agente: credencial do próprio consultor',
  'POST /oauth/authorize/confirmar': 'login do agente: projetos oferecidos já cortados por organização (tarefa 2)',
  'POST /api/v1/leads': 'cria na organização da sessão; o corpo não escolhe organização',
  'PUT /api/v1/proposals/config/pricing': 'precificação antiga (settings global): só org_ness (tarefa 2)',
  'PUT /api/v1/pricing-config': 'precificação antiga (settings global): só org_ness (tarefa 2)',
  'PUT /api/v1/org/config': 'configuração da organização da sessão',
  'POST /api/v1/org/logo': 'logo da organização da sessão; a chave do R2 é derivada da sessão, o corpo é só a imagem',
  'POST /api/v1/servicos/semear-padrao': 'semeia o catálogo da organização da sessão',
  'POST /api/v1/servicos': 'cria na organização da sessão',
  'POST /api/v1/projects': 'cria na organização da sessão (X-Org-Id só para platform_admin)',
  'POST /api/v1/projects/admin/encrypt-tokens': 'manutenção global, só platform_admin',
  'POST /api/v1/legal/accept': 'aceite de documento legal (catálogo global) pela própria conta',
  'POST /api/v1/legal/documents': 'publica documento legal global, só platform_admin',
  'POST /api/v1/platform/orgs': 'cria organização: só platform_admin (403 para toda a equipe)',
};

/** Colunas com CHECK de enum: o PRAGMA não expõe o CHECK. */
const VALOR_FIXO: Record<string, Record<string, unknown>> = {
  legal_documents: { classification: 'comum' },
  servicos: { tipo: 'avulso' },
  propostas: { status: 'rascunho' },
  pedidos: { tipo: 'dpia', papel_exigido: 'ciente' },
  parte_vinculos: { papel: 'responsavel', alvo_tipo: 'projeto' },
};

/**
 * Semeia uma linha por tabela para a organização `o`. Tabela "da organização" (tem `project_id`,
 * `org_id` ou chave estrangeira para tabela da organização) recebe id e textos com o marcador;
 * tabela global (catálogo) recebe um id neutro, para não sujar as listas globais de marcador.
 */
async function semearOrganizacao(o: Org, neutro: string): Promise<string[]> {
  const { results: tabelas } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
  ).all<{ name: string }>();

  const idDe = new Map<string, string>([['projects', o.proj], ['organizations', o.org]]);
  const daOrg = new Set<string>(['projects', 'organizations']);
  const falhas: string[] = [];
  const globais: string[] = [];
  for (const { name } of tabelas) {
    if (name === 'projects' || name === 'organizations') continue;
    const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${name}")`).all<any>();
    if (!(cols as any[]).some((c) => c.name === 'id')) continue;
    const { results: fks } = await env.DB.prepare(`PRAGMA foreign_key_list("${name}")`).all<any>();
    const alvoFk = new Map((fks as any[]).filter((f) => !f.to || f.to === 'id').map((f) => [f.from as string, f.table as string]));

    const nomes = (cols as any[]).map((c) => c.name as string);
    const ehDaOrg = nomes.includes('project_id') || nomes.includes('org_id')
      || [...alvoFk.entries()].some(([, t]) => daOrg.has(t) && idDe.has(t));
    const id = ehDaOrg ? o.rec : neutro;
    if (ehDaOrg) daOrg.add(name); else globais.push(name);

    const usadas: string[] = [];
    const valores: unknown[] = [];
    for (const c of cols as any[]) {
      const fixo = VALOR_FIXO[name]?.[c.name];
      if (c.name === 'id') valores.push(id);
      else if (c.name === 'project_id') valores.push(o.proj);
      else if (c.name === 'org_id') valores.push(o.org);
      else if (alvoFk.has(c.name) && idDe.has(alvoFk.get(c.name)!)) valores.push(idDe.get(alvoFk.get(c.name)!));
      else if (c.notnull && c.dflt_value === null) {
        valores.push(fixo !== undefined ? fixo : /INT|REAL|NUM/i.test(c.type ?? '') ? 0 : `${id}-${c.name}`);
      } else continue;
      usadas.push(c.name);
    }
    try {
      await env.DB.prepare(
        `INSERT INTO "${name}" (${usadas.map((u) => `"${u}"`).join(',')}) VALUES (${usadas.map(() => '?').join(',')})`
      ).bind(...valores).run();
      idDe.set(name, id);
    } catch (e: any) {
      falhas.push(`${name}: ${e?.message ?? e}`);
    }
  }
  expect(falhas, `não foi possível semear ${o.org}:\n  ${falhas.join('\n  ')}`).toEqual([]);
  return globais;
}

/** Usuários, designação, propostas em vários status, notificação, concessão de agente e chave de API. */
async function semearPessoas(o: Org, senha: string): Promise<void> {
  const d = env.DB;
  const { m } = o;
  await d.batch([
    d.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      (?, ?, ?, ?, 'consultor', NULL, ?, 1), (?, ?, ?, ?, 'comercial', NULL, ?, 1),
      (?, ?, ?, ?, 'consultoria_admin', NULL, ?, 1), (?, ?, ?, ?, 'org_admin', ?, ?, 1)`).bind(
      `${m}-cons`, `cons@${m}.lat`, senha, `Consultor ${m}`, o.org,
      `${m}-com`, `com@${m}.lat`, senha, `Comercial ${m}`, o.org,
      `${m}-cadm`, `cadm@${m}.lat`, senha, `Admin ${m}`, o.org,
      `${m}-cli`, `cli@${m}.lat`, senha, `Cliente ${m}`, o.proj, o.org),
    d.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?, ?, ?, ?, 'consultor', 'Consultor')`)
      .bind(`${m}-gov-cons`, o.proj, `Consultor ${m}`, `cons@${m}.lat`),
    ...['enviada', 'aceita', 'recusada'].map((st, i) =>
      d.prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, cliente, criada_por, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`${m}-pr-${st}`, o.org, o.rec, `${m}-2026-00${i + 1}`, `Cliente ${m}`, `com@${m}.lat`, st)),
    d.prepare(`INSERT INTO notifications (id, user_id, type, title) VALUES (?, ?, 'aviso', ?), (?, ?, 'aviso', ?)`)
      .bind(`${m}-notif-cons`, `${m}-cons`, `Aviso ${m}`, `${m}-notif-com`, `${m}-com`, `Aviso ${m}`),
    d.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES (?, ?, ?, datetime('now','+30 days'))`)
      .bind(`${m}-conc`, `${m}-cons`, o.proj),
    d.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?, ?, ?, ?, 'write', 'Active')`)
      .bind(`${m}-key`, o.proj, await sha256Hex(`chave-${m}`), `Chave ${m}`),
  ]);
}

// `token`: o auditor externo não tem sessão; a credencial é o token do portal, preso a um projeto.
type Principal = { nome: string; de: Org; alheio: Org; headers: Record<string, string>; extraEnv?: Record<string, unknown>; token?: string };
const PRINCIPAIS: Principal[] = [];

async function chamar(p: Principal, metodo: string, caminho: string, corpo?: unknown): Promise<Response> {
  return app.fetch(
    new Request('http://localhost' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...p.headers },
      body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
    }),
    { ...workerEnv(), ...(p.extraEnv ?? {}) } as any,
  );
}

/** Troca os parâmetros pelos ids da organização `o`; `token`, se dado, é o do próprio auditor. */
function forjar(caminho: string, o: Org, token?: string): string {
  // O primeiro parâmetro depois de /projects/ é o projeto (`:id` ou `:projectId`), também em /platform/projects.
  const c = caminho.replace(/^\/api\/v1\/(platform\/)?projects\/:\w+/, (_t, plat = '') => `/api/v1/${plat}projects/${o.proj}`);
  return c.replace(/:(\w+)/g, (_t, nome: string) => {
    // Token público é a autorização por desenho; um válido testaria o desenho, não a guarda.
    if (nome.toLowerCase().includes('token')) return token ?? 'token-forjado-inexistente';
    if (nome === 'num' || nome === 'phase') return '1';
    if (nome === 'projectId') return o.proj;
    return o.rec;
  });
}

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria zzb', 'zzb')`).run()
    .catch(() => undefined);
  await env.DB.prepare(`UPDATE organizations SET name = 'Consultoria zzn' WHERE id = 'org_ness'`).run();
  const senha = await hashPassword(SENHA);
  for (const [o, neutro] of [[NESS, 'neutro-1'], [B, 'neutro-2']] as const) {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, ?, 'ISO 27001', 'controller', 'Active', ?)`)
      .bind(o.proj, `Cliente ${o.m}`, o.org).run();
    await semearOrganizacao(o, neutro);
    await semearPessoas(o, senha);
    // Logo (tarefa 6): cada organização tem o seu, com o marcador nos bytes. `GET /api/v1/org/logo`
    // entra na varredura de listas: devolver o logo alheio traria o marcador alheio no corpo.
    const chave = `logos/${o.org}/${o.m}-logo.png`;
    await env.STORAGE.put(chave, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode(`${o.m}-logo`)]));
    await env.DB.prepare('UPDATE organizations SET logo_chave = ? WHERE id = ?').bind(chave, o.org).run();
  }
  // Pedido de uma organização endereçado (por engano) ao stakeholder da OUTRA: ser destinatário não
  // basta, o projeto do pedido tem de ser o dele. Sem esta linha a varredura por id de /pedidos só
  // provaria "não é destinatário". Ligado pelo `user_id`, com e-mail neutro: o painel de
  // acompanhamento (fatia 3) mostra à organização dona do pedido os e-mails que ELA endereçou, e um
  // e-mail com o marcador alheio aqui seria acusado como vazamento sem ser.
  await env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, user_id) VALUES ('cruz-1', ?, 'cruz@neutro.lat', ?), ('cruz-2', ?, 'cruz@neutro.lat', ?)`)
    .bind(B.rec, `${NESS.m}-stk`, NESS.rec, `${B.m}-stk`).run();
  for (const [de, alheio] of [[NESS, B], [B, NESS]] as const) {
    const m = de.m;
    for (const [papel, uid] of [['consultor', 'cons'], ['comercial', 'com'], ['consultoria_admin', 'cadm']] as const) {
      PRINCIPAIS.push({
        nome: `${papel}@${de.org}`, de, alheio,
        headers: await sessionFor({ id: `${m}-${uid}`, email: `${uid}@${m}.lat`, role: papel, org_id: de.org }),
      });
    }
    // Stakeholder (fatia 1 do acesso de stakeholders): preso ao projeto da própria organização; o
    // allow-list de caminhos o deixa em perfil/senha/MFA, então toda rota por id alheio é 403.
    PRINCIPAIS.push({
      nome: `stakeholder@${de.org}`, de, alheio,
      headers: await sessionFor({ id: `${m}-stk`, email: `stk@${m}.lat`, role: 'stakeholder', client_project_id: de.proj, org_id: de.org }),
    });
    PRINCIPAIS.push({
      nome: `agente@${de.org}`, de, alheio, headers: { 'X-Agente-Confirmado': '1' },
      extraEnv: { AGENTE: { concessaoId: `${m}-conc`, userId: `${m}-cons`, email: `cons@${m}.lat`, projectId: de.proj } },
    });
    PRINCIPAIS.push({ nome: `chave-api@${de.org}`, de, alheio, headers: { 'X-API-Key': `chave-${m}` } });
    // Cliente dono do projeto (fatia 5 do acesso de stakeholders): pede e acompanha pedidos.
    PRINCIPAIS.push({
      nome: `org_admin@${de.org}`, de, alheio,
      headers: await sessionFor({ id: `${m}-cli`, email: `cli@${m}.lat`, role: 'org_admin', client_project_id: de.proj, org_id: de.org }),
    });
    // Auditor externo: token VÁLIDO do projeto da própria organização (portal `/api/v1/public/auditor/*`, token no corpo).
    await env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?, ?, ?, '2099-01-01T00:00:00Z')`)
      .bind(`${m}-aud`, de.proj, await sha256Hex(`tok-aud-${m}`)).run();
    PRINCIPAIS.push({ nome: `auditor@${de.org}`, de, alheio, headers: {}, token: `tok-aud-${m}` });
  }
}, 120_000);

describe('contrato de isolamento entre organizações', () => {
  it('descobre as rotas e a semeadura de fato gravou (senão o teste passa vazio)', async () => {
    const rotas = todasAsRotas();
    expect(rotas.length, 'app.routes parou de listar').toBeGreaterThanOrEqual(250);
    expect(rotas.filter(temParametro).length).toBeGreaterThanOrEqual(180);
    for (const [t, o] of [['servicos', B], ['leads', B], ['propostas', NESS], ['assessment_answers', NESS], ['contracts', B]] as const) {
      const linha = await env.DB.prepare(`SELECT id FROM "${t}" WHERE id = ?`).bind(o.rec).first();
      expect(linha, `${t} de ${o.org} não foi semeada`).not.toBeNull();
    }
  });

  it('cada principal está autenticado e alcança o que é da PRÓPRIA organização', async () => {
    // consultoria_admin (tarefa 4): projeto E área comercial da organização dele, para a varredura o
    // exercitar nos dois lados do corte.
    const proprio: Record<string, string[]> = {
      consultor: ['/api/v1/projects/:p/risks'],
      comercial: ['/api/v1/servicos/:r', '/api/v1/org/logo'],
      consultoria_admin: ['/api/v1/projects/:p/risks', '/api/v1/servicos/:r', '/api/v1/leads/:r', '/api/v1/org/config', '/api/v1/org/logo'],
      stakeholder: ['/api/v1/auth/me', '/api/v1/pedidos'],
      agente: ['/api/v1/projects/:p/risks'],
      'chave-api': ['/api/v1/projects/:p/risks'],
      org_admin: ['/api/v1/projects/:p/risks', '/api/v1/projects/:p/pedidos'],
      auditor: [],
    };
    for (const p of PRINCIPAIS) {
      for (const molde of proprio[p.nome.split('@')[0]]) {
        const res = await chamar(p, 'GET', molde.replace(':p', p.de.proj).replace(':r', p.de.rec).replace(':t', p.token ?? ''));
        expect(res.status, `${p.nome} ${molde}: ${await res.clone().text()}`).toBe(200);
      }
    }
    // Auditor externo: o token vai no CORPO das rotas do portal (src/routes/public-auditor.ts), e a
    // resposta não traz nada da organização alheia.
    for (const p of PRINCIPAIS.filter((x) => x.token)) {
      for (const acao of ['ver', 'pedidos', 'notas']) {
        const res = await chamar(p, 'POST', `/api/v1/public/auditor/${acao}`, { token: p.token });
        const texto = await res.text();
        expect(res.status, `${p.nome} ${acao}: ${texto}`).toBe(200);
        expect(texto.toLowerCase(), `${p.nome} ${acao}`).not.toContain(p.alheio.m);
      }
    }
  });

  it('toda rota sem parâmetro que não é GET está classificada', () => {
    const sem = todasAsRotas().filter((r) => !temParametro(r) && r.metodo !== 'GET'
      && !(r.chave in CRIA_COM_REFERENCIA) && !(r.chave in SEM_RECURSO_ALHEIO));
    expect(sem.map((r) => r.chave), 'rota nova sem classificação: acrescente em CRIA_COM_REFERENCIA ou SEM_RECURSO_ALHEIO').toEqual([]);
  });

  it('nenhuma lista de classificação tem entrada órfã', () => {
    const existentes = new Set(todasAsRotas().map((r) => r.chave));
    for (const lista of [EXCECOES, CORPOS, NAO_PROVADAS_POR_CORPO, CRIA_COM_REFERENCIA, SEM_RECURSO_ALHEIO]) {
      for (const chave of Object.keys(lista)) expect(existentes.has(chave), `entrada órfã: "${chave}"`).toBe(true);
    }
  });

  it('por id: nenhuma rota entrega recurso da organização alheia', async () => {
    const rotas = todasAsRotas().filter((r) => temParametro(r) && !(r.chave in EXCECOES));
    const entregou: string[] = [];
    const naoChegou = new Set<string>();
    for (const p of PRINCIPAIS) {
      for (const r of rotas) {
        // Auditor: rota cujo único parâmetro é o token dele devolve o PRÓPRIO projeto (varredura de listas);
        // as demais recebem o token dele com o id alheio (ex.: evidência alheia pelo portal → 4xx).
        if (p.token && !/:\w/.test(r.caminho.replace(/:\w*token\w*/gi, ''))) continue;
        const res = await chamar(p, r.metodo, forjar(r.caminho, p.alheio, p.token), CORPOS[r.chave]?.(p.alheio));
        if (res.status < 400 || res.status >= 500) entregou.push(`${res.status} ${r.chave}  [${p.nome}]`);
        else if ((res.status === 400 || res.status === 429) && !(r.chave in NAO_PROVADAS_POR_CORPO)) naoChegou.add(`${res.status} ${r.chave}`);
      }
    }
    expect(entregou, `rotas que entregaram recurso de outra organização:\n  ${entregou.join('\n  ')}`).toEqual([]);
    expect([...naoChegou], 'rotas que pararam no 400/429 sem chegar à guarda: corpo em CORPOS ou entrada em NAO_PROVADAS_POR_CORPO').toEqual([]);
  }, 600_000);

  it('a notificação alheia não é marcada como lida (a exceção prova pela linha)', async () => {
    for (const p of PRINCIPAIS) await chamar(p, 'PUT', `/api/v1/notifications/${p.alheio.m}-notif-cons/read`);
    const { results } = await env.DB.prepare(`SELECT id, read FROM notifications WHERE id LIKE '%-notif-cons'`).all<any>();
    expect(results.map((n) => [n.id, n.read])).toEqual([['zzn-notif-cons', 0], ['zzb-notif-cons', 0]]);
  });

  it('criação com referência alheia no corpo é recusada', async () => {
    const aceitou: string[] = [];
    for (const p of PRINCIPAIS) {
      for (const [chave, corpo] of Object.entries(CRIA_COM_REFERENCIA)) {
        const [metodo, caminho] = chave.split(' ');
        const res = await chamar(p, metodo, caminho, corpo(p.alheio));
        // org_admin não escolhe projeto: a conta nasce no PRÓPRIO projeto dele, ignorando o do corpo
        // (users.ts). 201 aí não é vazamento; a prova é a linha criada, conferida aqui e no teste seguinte.
        if (res.status === 201 && p.nome.startsWith('org_admin@') && (await res.clone().json<any>()).client_project_id === p.de.proj) continue;
        if (res.status < 400 || res.status >= 500) aceitou.push(`${res.status} ${chave}  [${p.nome}]`);
      }
    }
    expect(aceitou, `criaram com referência de outra organização:\n  ${aceitou.join('\n  ')}`).toEqual([]);
  }, 120_000);

  it('conta de equipe não se prende a projeto alheio (POST e PUT /users, corpos extras)', async () => {
    const aceitou: string[] = [];
    for (const p of PRINCIPAIS) {
      for (const [metodo, caminho, corpo] of REFERENCIA_ALHEIA_EXTRA) {
        const res = await chamar(p, metodo, caminho(p), corpo(p));
        if (res.status < 400 || res.status >= 500) aceitou.push(`${res.status} ${metodo} ${caminho(p)}  [${p.nome}]`);
      }
    }
    expect(aceitou, `prenderam conta a projeto de outra organização:\n  ${aceitou.join('\n  ')}`).toEqual([]);
    const { results } = await env.DB.prepare(
      `SELECT u.id FROM users u JOIN projects p ON p.id = u.client_project_id WHERE p.org_id <> u.org_id OR u.role NOT IN ('org_admin', 'org_user', 'client')`
    ).all();
    expect(results).toEqual([]);
  }, 120_000);

  it('vínculo a recurso alheio no corpo de rota do próprio projeto é recusado', async () => {
    const aceitou: string[] = [];
    for (const p of PRINCIPAIS) {
      for (const [metodo, caminho, corpo] of VINCULO_ALHEIO) {
        const res = await chamar(p, metodo, caminho(p), corpo(p));
        if (res.status < 400 || res.status >= 500) aceitou.push(`${res.status} ${metodo} ${caminho(p)}  [${p.nome}]`);
      }
    }
    expect(aceitou, `vincularam recurso de outra organização:\n  ${aceitou.join('\n  ')}`).toEqual([]);
  }, 120_000);

  it('listas e respostas: nenhuma rota GET traz dado da organização alheia', async () => {
    const rotas = todasAsRotas().filter((r) => r.metodo === 'GET' && !(r.chave in EXCECOES));
    const vazou: string[] = [];
    let respostas2xx = 0;
    for (const p of PRINCIPAIS) {
      for (const r of rotas) {
        const res = await chamar(p, 'GET', forjar(r.caminho, p.de, p.token));
        if (res.ok) respostas2xx++;
        const texto = (await res.text()).toLowerCase();
        if (texto.includes(p.alheio.m)) {
          const i = texto.indexOf(p.alheio.m);
          vazou.push(`${res.status} ${r.chave}  [${p.nome}]  …${texto.slice(Math.max(0, i - 60), i + 40)}…`);
        }
      }
    }
    expect(vazou, `respostas com dado de outra organização:\n  ${vazou.join('\n  ')}`).toEqual([]);
    // Se quase tudo responde 4xx, a varredura não olhou dado nenhum. Em 2026-10-02: 670 de 1200.
    expect(respostas2xx, 'a varredura de listas quase não recebeu 2xx').toBeGreaterThan(500);
  }, 600_000);
});
