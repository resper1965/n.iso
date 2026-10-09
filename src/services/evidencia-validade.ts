import { genId, logAudit } from '../helpers';

/**
 * Núcleo do n.privacy, fatia 8 (spec 4.7 e 4.9): evidência com validade. A evidência que venceu volta a `pending`; a assinatura gravada NÃO é
 * apagada (ela atesta o conteúdo, e o que venceu é a avaliação). Roda na rotina diária de avisos, antes de avisar. Idempotente: uma evidência já
 * pendente não é tocada, então rodar duas vezes no dia não duplica trilha.
 */

/** Põe de volta em `pending` as evidências com `valido_ate` anterior a `hoje` (AAAA-MM-DD). Devolve quantas foram. */
export async function vencerEvidencias(db: D1Database, hoje: string): Promise<number> {
  const { results } = await db.prepare(
    `SELECT id, project_id, file_name, valido_ate, evaluation_status FROM evidence
      WHERE valido_ate IS NOT NULL AND valido_ate < ?1 AND COALESCE(evaluation_status, 'pending') <> 'pending'`
  ).bind(hoje).all<{ id: string; project_id: string | null; file_name: string; valido_ate: string; evaluation_status: string | null }>();
  for (const e of results) {
    await db.batch([
      db.prepare(`UPDATE evidence SET evaluation_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND COALESCE(evaluation_status, 'pending') <> 'pending'`).bind(e.id),
      db.prepare(
        `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
         VALUES (?, 'evidencia.vencida', 'sistema', ?, '', '', ?, datetime('now'))`
      ).bind(genId(), `Evidência ${e.id} (${e.file_name}) venceu em ${e.valido_ate}: avaliação ${e.evaluation_status ?? 'pending'} → pending; a assinatura foi mantida`, e.project_id),
    ]);
  }
  return results.length;
}

type Falha = { ok: false; status: 400 | 404; error: string };

const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Define (ou limpa, com null) a validade da evidência do projeto. */
export async function definirValidade(db: D1Database, projectId: string, evidenciaId: string, ator: string, validoAte: string | null): Promise<Falha | { ok: true }> {
  if (validoAte !== null && !ehData(validoAte)) return { ok: false, status: 400, error: 'valido_ate precisa ser uma data AAAA-MM-DD' };
  const r = await db.prepare('UPDATE evidence SET valido_ate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?').bind(validoAte, evidenciaId, projectId).run();
  if (!r.meta.changes) return { ok: false, status: 404, error: 'Evidência não encontrada' };
  await logAudit(db, 'evidencia.validade', ator, `Evidência ${evidenciaId}: validade ${validoAte ?? 'removida'}`, '', '', projectId);
  return { ok: true };
}
