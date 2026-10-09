import { logAudit } from '../helpers';

/**
 * Núcleo do n.privacy, fatia 5: LIA (teste de legítimo interesse), uma por tratamento, e a DPIA que nasce do tratamento.
 * A LIA é exigida quando a base legal do tratamento é o legítimo interesse; a exigência só aparece nas ligações, não bloqueia.
 */

const normaliza = (s: string | null | undefined) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A base é legítimo interesse? Vale o título da base do catálogo ou o texto livre do registro (sem acento nem caixa). */
export const ehLegitimoInteresse = (...textos: (string | null | undefined)[]) => textos.some((t) => normaliza(t).includes('legitimo interesse'));

export type Lia = {
  id: string; ropa_id: string; finalidade_legitima: string | null; necessidade: string | null; balanceamento: string | null; salvaguardas: string | null;
  conclusao: 'prevalece' | 'nao_prevalece' | null; status: 'rascunho' | 'concluida'; concluida_em: string | null; concluida_por: string | null;
  criado_por: string | null; updated_at: string;
};
export type DadosLia = Partial<Pick<Lia, 'finalidade_legitima' | 'necessidade' | 'balanceamento' | 'salvaguardas' | 'conclusao' | 'status'>>;
type Falha = { ok: false; status: 400 | 404 | 409; error: string };

const COLUNAS = 'id, ropa_id, finalidade_legitima, necessidade, balanceamento, salvaguardas, conclusao, status, concluida_em, concluida_por, criado_por, updated_at';
const CAMPOS_TEXTO = ['finalidade_legitima', 'necessidade', 'balanceamento', 'salvaguardas'] as const;
const OBRIGATORIOS = ['finalidade_legitima', 'necessidade', 'balanceamento'] as const;

export async function lerLia(db: D1Database, projectId: string, ropaId: string): Promise<Lia | null> {
  return db.prepare(`SELECT ${COLUNAS} FROM lia_assessments WHERE ropa_id = ? AND project_id = ?`).bind(ropaId, projectId).first<Lia>();
}

/**
 * Grava a LIA do tratamento (cria ou altera só o que veio). Concluir exige finalidade, necessidade, balanceamento e conclusão;
 * LIA concluída não muda por edição: reabrir (`status: 'rascunho'`) é um ato à parte.
 */
export async function salvarLia(db: D1Database, projectId: string, ropaId: string, ator: string, d: DadosLia): Promise<Falha | { ok: true; id: string; criada: boolean }> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const atual = await lerLia(db, projectId, ropaId);
  if (atual?.status === 'concluida' && d.status !== 'rascunho') return { ok: false, status: 409, error: 'LIA concluída: reabra (status rascunho) para editar' };

  const final = { ...(atual ?? {}), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as Partial<Lia>;
  const status = d.status ?? atual?.status ?? 'rascunho';
  if (status === 'concluida') {
    const faltam = OBRIGATORIOS.filter((c) => !String(final[c] ?? '').trim());
    if (faltam.length || !final.conclusao) return { ok: false, status: 400, error: `Para concluir, preencha: ${[...faltam, ...(final.conclusao ? [] : ['conclusao'])].join(', ')}` };
  }
  const concluindo = status === 'concluida' && atual?.status !== 'concluida';
  const sets = [...CAMPOS_TEXTO, 'conclusao'].filter((c) => (d as Record<string, unknown>)[c] !== undefined);

  if (!atual) {
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO lia_assessments (id, project_id, ropa_id, finalidade_legitima, necessidade, balanceamento, salvaguardas, conclusao, status, concluida_em, concluida_por, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, projectId, ropaId, d.finalidade_legitima ?? null, d.necessidade ?? null, d.balanceamento ?? null, d.salvaguardas ?? null, d.conclusao ?? null, status,
      concluindo ? new Date().toISOString() : null, concluindo ? ator : null, ator).run();
    await logAudit(db, 'lia.criada', ator, `LIA do tratamento ${ropaId} criada (${status})`, '', '', projectId);
    return { ok: true, id, criada: true };
  }
  const colunas = [...sets.map((c) => `${c} = ?`), 'status = ?', 'concluida_em = ?', 'concluida_por = ?', "updated_at = datetime('now')"];
  await db.prepare(`UPDATE lia_assessments SET ${colunas.join(', ')} WHERE id = ? AND project_id = ?`).bind(
    ...sets.map((c) => (d as Record<string, unknown>)[c] ?? null), status,
    status === 'concluida' ? (concluindo ? new Date().toISOString() : atual.concluida_em) : null,
    status === 'concluida' ? (concluindo ? ator : atual.concluida_por) : null, atual.id, projectId,
  ).run();
  await logAudit(db, concluindo ? 'lia.concluida' : 'lia.atualizada', ator, `LIA do tratamento ${ropaId}: ${status}`, '', '', projectId);
  return { ok: true, id: atual.id, criada: false };
}

export async function apagarLia(db: D1Database, projectId: string, ropaId: string, ator: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM lia_assessments WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId).run();
  if (r.meta.changes) await logAudit(db, 'lia.apagada', ator, `LIA do tratamento ${ropaId} apagada`, '', '', projectId);
  return (r.meta.changes ?? 0) > 0;
}

/** DPIA `Draft` já ligada ao tratamento e pré-preenchida com o que o registro sabe. 409 (com o id) se já existe uma. */
export async function criarDpiaDoTratamento(
  db: D1Database, projectId: string, ropaId: string, ator: string,
  lig: { itens: { nome: string; tipo: string }[]; departamentos: { nome: string }[]; partes: { nome: string; papel: string }[]; transferencias: { pais: string; destinatario: string | null; mecanismo: string | null }[] },
): Promise<Falha | { ok: true; id: string } | { ok: false; status: 409; error: string; id: string }> {
  const reg = await db.prepare('SELECT processing_purpose, data_subjects, data_categories FROM ropa_records WHERE id = ? AND project_id = ?')
    .bind(ropaId, projectId).first<{ processing_purpose: string; data_subjects: string | null; data_categories: string | null }>();
  if (!reg) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const ja = await db.prepare('SELECT id FROM dpia_assessments WHERE ropa_id = ? AND project_id = ? ORDER BY created_at LIMIT 1').bind(ropaId, projectId).first<{ id: string }>();
  if (ja) return { ok: false, status: 409, error: 'Já existe DPIA ligada a este tratamento', id: ja.id };
  const linhas = [
    lig.itens.length ? `Sistemas, bases e processos: ${lig.itens.map((i) => `${i.nome} (${i.tipo})`).join(', ')}` : '',
    lig.departamentos.length ? `Departamentos: ${lig.departamentos.map((d) => d.nome).join(', ')}` : '',
    lig.partes.length ? `Partes: ${lig.partes.map((p) => `${p.nome} (${p.papel})`).join(', ')}` : '',
    lig.transferencias.length ? `Transferências: ${lig.transferencias.map((t) => `${t.pais}${t.destinatario ? ` para ${t.destinatario}` : ''}${t.mecanismo ? ` (${t.mecanismo})` : ''}`).join('; ')}` : '',
  ].filter(Boolean);
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, system_name, data_subjects_types, personal_data_categories, data_flow_description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`
  ).bind(id, projectId, ropaId, reg.processing_purpose, lig.itens.map((i) => i.nome).join(', ') || null, reg.data_subjects, reg.data_categories, linhas.join('\n') || null).run();
  await logAudit(db, 'dpia.criada_do_tratamento', ator, `DPIA ${id} criada a partir do tratamento ${ropaId}`, '', '', projectId);
  return { ok: true, id };
}
