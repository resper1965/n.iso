import { genId } from '../helpers';
import { PHASE_TITLES } from '../constants';

/**
 * INSERTs das fases da trilha de adequação de um projeto, para entrar num batch.
 * Cada INSERT só age se o projeto existe: num batch com guarda (fecharVenda), o
 * projeto que não foi criado por esta chamada não ganha fases nem estoura a FK.
 */
export function stmtsFases(db: D1Database, projectId: string): D1PreparedStatement[] {
  const phaseStmt = db.prepare(
    `INSERT INTO project_phases (id, project_id, phase_number, title, status, notes, created_at)
     SELECT ?, ?, ?, ?, ?, '', datetime('now') WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?)`
  );
  return PHASE_TITLES.map((title, i) =>
    phaseStmt.bind(genId(), projectId, i, title, i === 0 ? 'in_progress' : 'pending', projectId)
  );
}

/**
 * Cria as fases da trilha de adequação para um projeto novo.
 * Era duplicada em routes/projects.ts e routes/assessments.ts (a segunda cópia
 * ainda declarava um statement de evidência que nunca era usado).
 */
export async function seedPhases(db: D1Database, projectId: string) {
  await db.batch(stmtsFases(db, projectId));
}

type ItemDeCatalogo = { code: string; title: string };

/**
 * INSERT único dos controles de um catálogo ("A.5.1 — título") que o projeto ainda não tem, para
 * entrar num batch. Só age se o projeto existe. Em fecharVenda o id é novo a cada chamada e o projeto só
 * nasce sob a guarda G, então a chamada que perde a corrida não semeia nada nem estoura a FK. Idempotente: o código vive como
 * primeiro token do título, e o que já existe naquela norma é pulado em qualquer formato de id
 * (ctrl-a51, A.5.1, gerado).
 */
export function stmtControles(db: D1Database, projectId: string, standard: string, lista: readonly ItemDeCatalogo[]): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, maturity, updated_at)
     SELECT lower(hex(randomblob(16))), ?1, ?2, j.value, '', 'Missing', 0, datetime('now') FROM json_each(?3) j
      WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?1)
        AND NOT EXISTS (SELECT 1 FROM compliance_controls c WHERE c.project_id = ?1 AND c.standard = ?2
          AND substr(c.title, 1, instr(c.title || ' ', ' ') - 1) = substr(j.value, 1, instr(j.value || ' ', ' ') - 1))`
  ).bind(projectId, standard, JSON.stringify(lista.map((c) => `${c.code} — ${c.title}`)));
}

/** Semeia, como 'Missing', os controles da lista que o projeto ainda não tem. */
export async function semearControles(
  db: D1Database, projectId: string, standard: string, lista: readonly ItemDeCatalogo[],
): Promise<{ created: number; total: number }> {
  const r = await stmtControles(db, projectId, standard, lista).run();
  return { created: r.meta.changes ?? 0, total: lista.length };
}
