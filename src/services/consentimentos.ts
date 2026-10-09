import { logAudit } from '../helpers';

/**
 * Núcleo do n.privacy, fatia 7: prova de consentimento ligada ao tratamento (quem, quando, finalidade, versão do aviso). `titular_ref` é uma
 * referência PSEUDONIMIZADA escolhida pela equipe (a tela avisa: nada de CPF). Revogar não apaga: a prova do que existiu fica.
 */

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const hoje = () => new Date().toISOString().slice(0, 10);
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s));

const COLS = 'c.id, c.ropa_id, r.processing_purpose AS tratamento, c.titular_ref, c.finalidade, c.versao_aviso, c.obtido_em, c.canal, c.revogado_em, c.revogado_por, c.criado_por, c.created_at';

export async function listarConsentimentos(db: D1Database, projectId: string, ropaId?: string) {
  const { results } = await db.prepare(
    `SELECT ${COLS} FROM consentimentos c JOIN ropa_records r ON r.id = c.ropa_id
      WHERE c.project_id = ?1 AND (?2 IS NULL OR c.ropa_id = ?2) ORDER BY c.obtido_em DESC, c.created_at DESC`
  ).bind(projectId, ropaId ?? null).all();
  return results.map((r) => ({ ...r, vigente: !r.revogado_em }));
}

export type NovoConsentimento = { ropa_id: string; titular_ref: string; finalidade: string; versao_aviso: string; obtido_em: string; canal?: string | null };

export async function registrarConsentimento(db: D1Database, projectId: string, ator: string, d: NovoConsentimento): Promise<Falha | { ok: true; id: string }> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(d.ropa_id, projectId).first())) return falha(404, 'Tratamento não encontrado');
  if (!ehData(d.obtido_em)) return falha(400, 'obtido_em precisa ser uma data AAAA-MM-DD');
  if (d.obtido_em.slice(0, 10) > hoje()) return falha(400, 'obtido_em não pode estar no futuro');
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO consentimentos (id, project_id, ropa_id, titular_ref, finalidade, versao_aviso, obtido_em, canal, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, d.ropa_id, d.titular_ref, d.finalidade, d.versao_aviso, d.obtido_em, d.canal ?? null, ator).run();
  await logAudit(db, 'consentimento.registrado', ator, `Consentimento ${id} registrado no tratamento ${d.ropa_id} (aviso ${d.versao_aviso})`, '', '', projectId);
  return { ok: true, id };
}

export async function revogarConsentimento(db: D1Database, projectId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const c = await db.prepare('SELECT revogado_em FROM consentimentos WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ revogado_em: string | null }>();
  if (!c) return falha(404, 'Consentimento não encontrado');
  if (c.revogado_em) return falha(409, 'Consentimento já revogado');
  await db.prepare(`UPDATE consentimentos SET revogado_em = ?, revogado_por = ? WHERE id = ? AND project_id = ?`).bind(new Date().toISOString(), ator, id, projectId).run();
  await logAudit(db, 'consentimento.revogado', ator, `Consentimento ${id} revogado`, '', '', projectId);
  return { ok: true };
}
