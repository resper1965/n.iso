import { env } from 'cloudflare:test';
// `?raw` inlina o arquivo como string em tempo de build (Vite), então roda no
// pool workerd sem tocar node:fs — que é o que quebrava a suíte antes.
import schemaSql from '../../schema.sql?raw';

/**
 * Aplica um script SQL num D1 real.
 *
 * `exec()` do D1 não aceita múltiplos statements de forma confiável, então
 * separamos por ';' respeitando os blocos BEGIN...END dos triggers.
 */
export async function execSql(sql: string): Promise<void> {
  const statements: string[] = [];
  let buf = '';
  let inTrigger = false;
  for (const rawLine of sql.split('\n')) {
    const line = rawLine.replace(/--.*$/, '');
    if (!line.trim()) continue;
    if (/CREATE\s+TRIGGER/i.test(line)) inTrigger = true;
    buf += line + '\n';
    if (inTrigger) {
      if (/^\s*END\s*;/i.test(line)) { statements.push(buf); buf = ''; inTrigger = false; }
      continue;
    }
    if (line.trim().endsWith(';')) { statements.push(buf); buf = ''; }
  }
  for (const st of statements) {
    if (!st.trim()) continue;
    await env.DB.prepare(st).run();
  }
}

/** Cria todas as tabelas a partir do schema.sql canônico. */
export async function applySchema(): Promise<void> {
  await execSql(schemaSql);
}

/**
 * Zera todos os dados do D1 mantendo o schema (tabelas e triggers ficam).
 *
 * O pool de Workers (`@cloudflare/vitest-pool-workers` >= 0.5) isola storage
 * apenas POR ARQUIVO — a versao antiga (0.4.x) resetava a cada `it()`. Testes
 * que semeiam ids fixos ou acumulam mutacao em cima da mesma linha contavam com
 * aquele reset; chamar isto num `beforeEach` restaura o mesmo efeito.
 *
 * As FKs estao ATIVAS no D1, entao apagar tabela-pai antes da filha viola a
 * constraint. `PRAGMA defer_foreign_keys=TRUE` como 1a instrucao do batch adia a
 * checagem ate o COMMIT — quando todas as linhas ja sairam e nao ha orfao — e
 * assim a ordem de DELETE deixa de importar.
 */
export async function resetData(): Promise<void> {
  const { results } = await env.DB.prepare(
    // `audit_logs` fica de fora: um trigger a torna append-only (bloqueia DELETE
    // no nivel do DB). Acumular log entre testes e inocuo — os testes conferem a
    // propria entrada nova, nao a contagem total.
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name <> 'audit_logs'"
  ).all<{ name: string }>();
  if (!results.length) return;
  await env.DB.batch([
    env.DB.prepare('PRAGMA defer_foreign_keys = TRUE'),
    ...results.map((t) => env.DB.prepare(`DELETE FROM "${t.name}"`)),
  ]);
}

/** Apaga todas as sessoes do KV — o par de `resetData` para o storage de sessao. */
export async function resetSessions(): Promise<void> {
  const { keys } = await env.SESSIONS.list();
  await Promise.all(keys.map((k) => env.SESSIONS.delete(k.name)));
}

/**
 * Cria uma sessão no KV e devolve os headers que autenticam como esse usuário.
 * Espelha o formato que `authMiddleware` lê (`session_<id>`).
 */
export async function sessionFor(user: Record<string, unknown>): Promise<Record<string, string>> {
  const id = `sess-${crypto.randomUUID()}`;
  // `iat` e `seen` são carimbados pelo login real (routes/auth.ts): `iat` é o
  // que permite revogar a sessão, `seen` é o relógio da expiração por
  // inatividade. Sem eles a fixture produzia uma sessão de formato que o login
  // nunca emite — e que o middleware, com razão, recusa.
  // Quem quiser testar sessão velha passa o próprio `seen`.
  const agora = Date.now();
  const sessao = { iat: agora, seen: agora, ...user };
  await env.SESSIONS.put(`session_${id}`, JSON.stringify(sessao));
  return { Authorization: `Bearer ${id}` };
}

/**
 * Fixture mínima compartilhada: dois projetos de clientes diferentes, para que
 * qualquer teste de isolamento tenha o "outro tenant" disponível.
 */
export async function seedTwoProjects(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, ?, ?, ?, ?)`
    ).bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active'),
    env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, ?, ?, ?, ?)`
    ).bind('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active'),
  ]);
}

/**
 * Matriz de tenants da camada MSP. `seedTwoProjects` prova isolamento entre dois
 * projetos; esta prova isolamento entre duas CONSULTORIAS, que é o vazamento que
 * a camada MSP existe para fechar e que nenhuma fixture de dois projetos alcança.
 *
 *   conta-a (msp)   ├─ cli-a1 ─┬─ proj-a1-27001   (concedido a u-a1-user)
 *                   │          └─ proj-a1-27701   (NÃO concedido)
 *                   └─ cli-a2 ─── proj-a2-27001
 *   conta-b (msp)   └─ cli-b1 ─── proj-b1-27001
 *   conta-c (direto)└─ cli-c  ─── proj-c-27001
 */
export async function seedMatrizMsp(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-a', 'msp', 'Consultoria A', 'Active')`),
    env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-b', 'msp', 'Consultoria B', 'Active')`),
    env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-c', 'direto', 'Gama', 'Active')`),
  ]);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-a1', 'conta-a', 'Acme', 'Active')`),
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-a2', 'conta-a', 'Beta', 'Active')`),
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-b1', 'conta-b', 'Delta', 'Active')`),
    env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-c', 'conta-c', 'Gama', 'Active')`),
  ]);
  const projeto = (id: string, cliente: string, nome: string, norma: string) =>
    env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id) VALUES (?, ?, ?, 'controller', 'Active', ?)`
    ).bind(id, nome, norma, cliente);
  await env.DB.batch([
    projeto('proj-a1-27001', 'cli-a1', 'Acme', 'ISO 27001'),
    projeto('proj-a1-27701', 'cli-a1', 'Acme', 'ISO 27701'),
    projeto('proj-a2-27001', 'cli-a2', 'Beta', 'ISO 27001'),
    projeto('proj-b1-27001', 'cli-b1', 'Delta', 'ISO 27001'),
    projeto('proj-c-27001', 'cli-c', 'Gama', 'ISO 27001'),
  ]);
  const usuario = (id: string, email: string, role: string, conta: string | null, cliente: string | null) =>
    env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, conta_id, cliente_id) VALUES (?, ?, 'h', ?, ?, ?, ?)`
    ).bind(id, email, id, role, conta, cliente);
  await env.DB.batch([
    usuario('u-a-consultor', 'consultor@a.com', 'consultor', 'conta-a', null),
    usuario('u-b-consultor', 'consultor@b.com', 'consultor', 'conta-b', null),
    usuario('u-c-staff', 'staff@c.com', 'consultor', 'conta-c', null),
    usuario('u-a1-admin', 'admin@acme.com', 'org_admin', null, 'cli-a1'),
    usuario('u-a1-user', 'user@acme.com', 'org_user', null, 'cli-a1'),
    usuario('u-plataforma', 'adm@ness.com', 'platform_admin', null, null),
  ]);
  // O usuário comum recebe UM dos dois projetos do cliente dele. É esse par —
  // concedido e não concedido dentro da MESMA empresa — que distingue "vê o
  // cliente" de "vê o que lhe deram".
  await env.DB.prepare(
    `INSERT INTO acesso_projeto (user_id, project_id) VALUES ('u-a1-user', 'proj-a1-27001')`
  ).run();
}

/**
 * `env` do worker com o binding de IA trocado por stub.
 *
 * Oito arquivos de teste declaravam esta mesma função local. Ela vive aqui para
 * que o stub de IA tenha UMA definição — teste que exercita rota com IA sem o
 * stub estoura no `env.AI.run`, e descobrir isso arquivo a arquivo é
 * desperdício. Os arquivos anteriores a 2026-09 ainda têm a cópia local;
 * migram quando forem tocados.
 */
export function workerEnv(): any {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) } };
}

/** Requisição ao worker montado, com o `workerEnv()` acima. */
export async function pedir(
  worker: { fetch: (r: Request, e: any) => Promise<Response> },
  caminho: string,
  init: RequestInit = {}
): Promise<Response> {
  return worker.fetch(new Request(`http://localhost${caminho}`, init), workerEnv());
}
