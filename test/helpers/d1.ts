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
  await env.SESSIONS.put(`session_${id}`, JSON.stringify(user));
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
