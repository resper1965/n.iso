import { genId } from '../helpers';
import { PHASE_TITLES } from '../constants';

/**
 * Cria as fases da trilha de adequação para um projeto novo.
 * Era duplicada em routes/projects.ts e routes/assessments.ts (a segunda cópia
 * ainda declarava um statement de evidência que nunca era usado).
 */
export async function seedPhases(db: D1Database, projectId: string) {
  const phaseStmt = db.prepare(
    `INSERT INTO project_phases (id, project_id, phase_number, title, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, '', datetime('now'))`
  );
  const batch = PHASE_TITLES.map((title, i) =>
    phaseStmt.bind(genId(), projectId, i, title, i === 0 ? 'in_progress' : 'pending')
  );
  await db.batch(batch);
}
