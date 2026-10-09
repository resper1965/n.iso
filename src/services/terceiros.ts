import { logAudit } from '../helpers';

/**
 * Núcleo do n.privacy, fatia 6: terceiros (TPRM) tipificados. O terceiro é uma parte do tipo `organizacao`; o tipo define o
 * método de avaliação (o servidor decide); a avaliação tem validade e a situação é DERIVADA dela (nunca gravada).
 */

export const TIPOS_TERCEIRO = ['grande_provedor', 'medio', 'pequeno', 'critico'] as const;
export type TipoTerceiro = (typeof TIPOS_TERCEIRO)[number];
export type Metodo = 'trust_center' | 'questionario' | 'auditoria';
export type Situacao = 'pendente' | 'vigente' | 'vencida' | 'reprovada';

/** O tipo define o método (spec seção 5). Trust center é link mais validade, preenchido à mão. */
export const METODO_DO_TIPO: Record<TipoTerceiro, Metodo> = { grande_provedor: 'trust_center', medio: 'questionario', pequeno: 'questionario', critico: 'auditoria' };

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const hoje = () => new Date().toISOString().slice(0, 10);
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export type Avaliacao = {
  id: string; metodo: Metodo; resultado: 'aprovado' | 'com_ressalvas' | 'reprovado'; valido_ate: string;
  evidencia_url: string | null; observacao: string | null; avaliado_por: string | null; created_at: string;
};

/** Situação derivada da avaliação MAIS RECENTE: reprovada, vencida (passou de `valido_ate`), vigente ou pendente (nunca avaliado). */
export function situacaoDe(ultima: Pick<Avaliacao, 'resultado' | 'valido_ate'> | null | undefined, em = hoje()): Situacao {
  if (!ultima) return 'pendente';
  if (ultima.resultado === 'reprovado') return 'reprovada';
  return ultima.valido_ate >= em ? 'vigente' : 'vencida';
}

export type Terceiro = {
  id: string; nome: string; terceiro_tipo: TipoTerceiro | null; metodo: Metodo | null; situacao: Situacao;
  ultima_avaliacao: Avaliacao | null; tratamentos: number; documentos: number;
};

const COLS_AVALIACAO = 'id, parte_id, metodo, resultado, valido_ate, evidencia_url, observacao, avaliado_por, created_at';

/** Terceiros do projeto (partes organização ativas) com tipo, situação, nº de tratamentos que os usam e nº de documentos (DPA). */
export async function listarTerceiros(db: D1Database, projectId: string): Promise<Terceiro[]> {
  const [partes, avals, trat, docs] = await db.batch([
    db.prepare(`SELECT id, nome, terceiro_tipo FROM partes WHERE project_id = ? AND tipo = 'organizacao' AND status = 'ativa' ORDER BY nome`).bind(projectId),
    db.prepare(`SELECT ${COLS_AVALIACAO} FROM avaliacoes_terceiro WHERE project_id = ? ORDER BY created_at, rowid`).bind(projectId),
    db.prepare(`SELECT parte_id, count(DISTINCT alvo_id) AS n FROM parte_vinculos WHERE project_id = ? AND alvo_tipo = 'tratamento' GROUP BY parte_id`).bind(projectId),
    db.prepare(`SELECT parte_id, count(DISTINCT documento_id) AS n FROM documento_partes WHERE project_id = ? GROUP BY parte_id`).bind(projectId),
  ]);
  const ultima = new Map<string, Avaliacao>();
  for (const a of avals.results as (Avaliacao & { parte_id: string })[]) ultima.set(a.parte_id, a); // ordenado: a última sobrescreve
  const n = (r: { results: unknown[] }) => new Map((r.results as { parte_id: string; n: number }[]).map((x) => [x.parte_id, x.n]));
  const nt = n(trat), nd = n(docs);
  return (partes.results as { id: string; nome: string; terceiro_tipo: TipoTerceiro | null }[]).map((p) => {
    const u = ultima.get(p.id) ?? null;
    return { id: p.id, nome: p.nome, terceiro_tipo: p.terceiro_tipo, metodo: p.terceiro_tipo ? METODO_DO_TIPO[p.terceiro_tipo] : null, situacao: situacaoDe(u), ultima_avaliacao: u, tratamentos: nt.get(p.id) ?? 0, documentos: nd.get(p.id) ?? 0 };
  });
}

/** A ficha do terceiro: dados, histórico, documentos ligados, suboperadores e os tratamentos que o usam. null = não é do projeto. */
export async function lerTerceiro(db: D1Database, projectId: string, parteId: string) {
  const todos = await listarTerceiros(db, projectId);
  const t = todos.find((x) => x.id === parteId);
  if (!t) return null;
  const [hist, docs, subs, trat] = await db.batch([
    db.prepare(`SELECT ${COLS_AVALIACAO} FROM avaliacoes_terceiro WHERE parte_id = ? AND project_id = ? ORDER BY created_at DESC, rowid DESC`).bind(parteId, projectId),
    db.prepare(`SELECT d.id, d.titulo, d.status, dp.papel FROM documento_partes dp JOIN documentos d ON d.id = dp.documento_id WHERE dp.parte_id = ? AND dp.project_id = ? ORDER BY d.titulo`).bind(parteId, projectId),
    db.prepare(`SELECT p.id, p.nome FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id WHERE v.papel = 'suboperador' AND v.alvo_tipo = 'parte' AND v.alvo_id = ? AND v.project_id = ? ORDER BY p.nome`).bind(parteId, projectId),
    db.prepare(`SELECT DISTINCT r.id, r.processing_purpose AS finalidade FROM parte_vinculos v JOIN ropa_records r ON r.id = v.alvo_id WHERE v.parte_id = ? AND v.alvo_tipo = 'tratamento' AND v.project_id = ? ORDER BY r.processing_purpose`).bind(parteId, projectId),
  ]);
  return { ...t, historico: hist.results as Avaliacao[], documentos_ligados: docs.results, suboperadores: subs.results, tratamentos_afetados: trat.results };
}

const parteDoProjeto = (db: D1Database, projectId: string, parteId: string) =>
  db.prepare(`SELECT id, tipo, terceiro_tipo FROM partes WHERE id = ? AND project_id = ?`).bind(parteId, projectId).first<{ id: string; tipo: string; terceiro_tipo: TipoTerceiro | null }>();

export async function definirTipo(db: D1Database, projectId: string, parteId: string, ator: string, tipo: TipoTerceiro | null): Promise<Falha | { ok: true }> {
  const p = await parteDoProjeto(db, projectId, parteId);
  if (!p) return falha(404, 'Parte não encontrada');
  if (p.tipo !== 'organizacao') return falha(400, 'Só organização é terceiro');
  await db.prepare(`UPDATE partes SET terceiro_tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(tipo, parteId, projectId).run();
  await logAudit(db, 'terceiro.tipo', ator, `Parte ${parteId}: tipo de terceiro ${p.terceiro_tipo ?? '—'} → ${tipo ?? '—'}`, '', '', projectId);
  return { ok: true };
}

export type NovaAvaliacao = { resultado: Avaliacao['resultado']; valido_ate: string; evidencia_url?: string | null; observacao?: string | null };

/** Registra a avaliação (o método vem do tipo, nunca do corpo). A validade é obrigatória e não pode estar no passado. */
export async function registrarAvaliacao(db: D1Database, projectId: string, parteId: string, ator: string, d: NovaAvaliacao): Promise<Falha | { ok: true; id: string; metodo: Metodo }> {
  const p = await parteDoProjeto(db, projectId, parteId);
  if (!p) return falha(404, 'Parte não encontrada');
  if (p.tipo !== 'organizacao') return falha(400, 'Só organização é terceiro');
  if (!p.terceiro_tipo) return falha(400, 'Defina o tipo do terceiro antes de registrar a avaliação');
  if (!dataValida(d.valido_ate)) return falha(400, 'valido_ate precisa ser uma data AAAA-MM-DD');
  if (d.valido_ate < hoje()) return falha(400, 'valido_ate não pode estar no passado');
  const metodo = METODO_DO_TIPO[p.terceiro_tipo];
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, evidencia_url, observacao, avaliado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, parteId, metodo, d.resultado, d.valido_ate, d.evidencia_url ?? null, d.observacao ?? null, ator).run();
  await logAudit(db, 'terceiro.avaliacao', ator, `Parte ${parteId}: avaliação ${metodo} (${d.resultado}) válida até ${d.valido_ate}`, '', '', projectId);
  return { ok: true, id, metodo };
}

export type PapelDocumento = 'dpa' | 'contrato' | 'outro';

export async function ligarDocumento(db: D1Database, projectId: string, parteId: string, ator: string, documentoId: string, papel: PapelDocumento): Promise<Falha | { ok: true }> {
  if (!(await parteDoProjeto(db, projectId, parteId))) return falha(404, 'Parte não encontrada');
  if (!(await db.prepare('SELECT 1 FROM documentos WHERE id = ? AND project_id = ?').bind(documentoId, projectId).first())) return falha(400, 'Documento inexistente ou de outro projeto');
  try {
    await db.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES (?, ?, ?, ?)`).bind(documentoId, parteId, papel, projectId).run();
  } catch (e) {
    if (/UNIQUE|PRIMARY KEY/i.test(String((e as Error)?.message))) return falha(409, 'Esse documento já está ligado a este terceiro com esse papel');
    throw e;
  }
  await logAudit(db, 'terceiro.documento', ator, `Parte ${parteId}: documento ${documentoId} ligado como ${papel}`, '', '', projectId);
  return { ok: true };
}

export async function desligarDocumento(db: D1Database, projectId: string, parteId: string, ator: string, documentoId: string, papel: PapelDocumento): Promise<boolean> {
  const r = await db.prepare('DELETE FROM documento_partes WHERE documento_id = ? AND parte_id = ? AND papel = ? AND project_id = ?').bind(documentoId, parteId, papel, projectId).run();
  if (r.meta.changes) await logAudit(db, 'terceiro.documento', ator, `Parte ${parteId}: documento ${documentoId} desligado (${papel})`, '', '', projectId);
  return (r.meta.changes ?? 0) > 0;
}
