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
