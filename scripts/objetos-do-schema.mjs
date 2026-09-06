/**
 * Lista os objetos (tabelas, índices, triggers) que o `schema.sql` DECLARA.
 *
 * Aplica o arquivo num SQLite em memória e lê o `sqlite_master` resultante — e
 * não por regex sobre o texto, que erraria em `CREATE TABLE` dentro de
 * comentário, em índice declarado junto da tabela e em `IF NOT EXISTS`. O que
 * vale é o que o motor cria.
 *
 * Usado por `.github/workflows/schema-drift.yml` para comparar com o
 * `sqlite_master` do D1 de produção. Saída: uma linha por objeto, `tipo nome`,
 * ordenada — o formato que o `comm` do workflow espera.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

// Mesmo particionamento de `test/helpers/d1.ts`: `;` termina statement, exceto
// dentro de um bloco CREATE TRIGGER ... BEGIN ... END;
const statements = [];
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

const db = new DatabaseSync(':memory:');
for (const st of statements) {
  if (!st.trim()) continue;
  db.exec(st);
}

const objetos = db
  .prepare(
    `SELECT type || ' ' || name AS obj FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
     ORDER BY obj`
  )
  .all()
  .map((r) => r.obj);

process.stdout.write(objetos.join('\n') + '\n');
