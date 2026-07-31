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
