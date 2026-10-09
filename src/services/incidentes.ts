import { logAudit } from '../helpers';
import { prazoDe, proximoProtocolo } from './parametros-legais';

/**
 * Núcleo do n.privacy, fatia 7: incidente de segurança com dado pessoal (registro interno). Protocolo `IN-AAAA-NNNN`; os dois prazos de
 * comunicação saem dos parâmetros e contam da CIÊNCIA, congelados na criação (sem parâmetro ficam nulos). Encerrar exige risco avaliado, e
 * risco relevante exige a comunicação à ANPD registrada (o CHECK do banco também barra).
 */

export const RISCOS = ['sem_risco', 'baixo', 'relevante'] as const;
type Risco = (typeof RISCOS)[number];
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

const agora = () => new Date().toISOString();
const ehInstante = (s: string) => /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(s) && !Number.isNaN(Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s));

export type SituacaoComunicacao = 'sem_prazo' | 'comunicado' | 'no_prazo' | 'vence_hoje' | 'atrasado';
/** Cada comunicação: feita, ou o prazo em relação a hoje (sem prazo = parâmetro não cadastrado). */
export function situacaoDaComunicacao(prazo: string | null, feita: string | null, em = new Date().toISOString().slice(0, 10)): SituacaoComunicacao {
  if (feita) return 'comunicado';
  if (!prazo) return 'sem_prazo';
  const dia = prazo.slice(0, 10);
  return dia < em ? 'atrasado' : dia === em ? 'vence_hoje' : 'no_prazo';
}

const COLS = 'id, protocolo, titulo, descricao, ocorrido_em, ciencia_em, risco_titular, avaliacao_texto, comunicacao_anpd_em, comunicacao_titular_em, prazo_anpd_em, prazo_titular_em, status, responsavel_parte_id, criado_por, created_at, updated_at';
export type Incidente = {
  id: string; protocolo: string; titulo: string; descricao: string | null; ocorrido_em: string | null; ciencia_em: string; risco_titular: Risco | null; avaliacao_texto: string | null;
  comunicacao_anpd_em: string | null; comunicacao_titular_em: string | null; prazo_anpd_em: string | null; prazo_titular_em: string | null; status: string; responsavel_parte_id: string | null;
};
const comSituacao = (i: Incidente) => ({
  ...i,
  situacao_anpd: situacaoDaComunicacao(i.prazo_anpd_em, i.comunicacao_anpd_em),
  situacao_titular: situacaoDaComunicacao(i.prazo_titular_em, i.comunicacao_titular_em),
});

export async function listarIncidentes(db: D1Database, projectId: string) {
  const { results } = await db.prepare(`SELECT ${COLS} FROM incidentes WHERE project_id = ? ORDER BY ciencia_em DESC, protocolo DESC`).bind(projectId).all<Incidente>();
  return results.map(comSituacao);
}

export async function lerIncidente(db: D1Database, projectId: string, id: string) {
  const i = await db.prepare(`SELECT ${COLS} FROM incidentes WHERE id = ? AND project_id = ?`).bind(id, projectId).first<Incidente>();
  return i ? comSituacao(i) : null;
}

export type NovoIncidente = { titulo: string; descricao?: string | null; ocorrido_em?: string | null; ciencia_em: string; responsavel_parte_id?: string | null };

export async function criarIncidente(db: D1Database, projectId: string, ator: string, d: NovoIncidente): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_anpd_em: string | null; prazo_titular_em: string | null }> {
  if (!ehInstante(d.ciencia_em)) return falha(400, 'ciencia_em precisa ser uma data (AAAA-MM-DD) ou data e hora ISO');
  if (Date.parse(d.ciencia_em.length === 10 ? `${d.ciencia_em}T00:00:00Z` : d.ciencia_em) > Date.now() + 60_000) return falha(400, 'ciencia_em não pode estar no futuro');
  if (d.ocorrido_em && !ehInstante(d.ocorrido_em)) return falha(400, 'ocorrido_em precisa ser uma data ou data e hora ISO');
  if (d.responsavel_parte_id && !(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(d.responsavel_parte_id, projectId).first())) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');
  const [prazoAnpd, prazoTitular] = await Promise.all([prazoDe(db, 'incidente.comunicacao_anpd', d.ciencia_em), prazoDe(db, 'incidente.comunicacao_titular', d.ciencia_em)]);
  const id = crypto.randomUUID();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const protocolo = await proximoProtocolo(db, 'incidentes', 'IN', projectId, Number(d.ciencia_em.slice(0, 4)));
    try {
      await db.prepare(
        `INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ocorrido_em, ciencia_em, prazo_anpd_em, prazo_titular_em, responsavel_parte_id, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, projectId, protocolo, d.titulo, d.descricao ?? null, d.ocorrido_em ?? null, d.ciencia_em, prazoAnpd, prazoTitular, d.responsavel_parte_id ?? null, ator).run();
      await logAudit(db, 'incidente.criado', ator, `Incidente ${protocolo} registrado; prazo ANPD ${prazoAnpd ? prazoAnpd.slice(0, 16) : 'não calculado'}`, '', '', projectId);
      return { ok: true, id, protocolo, prazo_anpd_em: prazoAnpd, prazo_titular_em: prazoTitular };
    } catch (e) {
      if (!/UNIQUE/i.test(String((e as Error)?.message))) throw e;
    }
  }
  return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
}

/** Avalia o risco ao titular: o incidente aberto passa a `avaliado`. Reavaliar é permitido enquanto não encerrado. */
export async function avaliarRisco(db: D1Database, projectId: string, id: string, ator: string, d: { risco_titular: Risco; avaliacao_texto?: string | null }): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const status = i.status === 'aberto' ? 'avaliado' : i.status;
  await db.prepare(`UPDATE incidentes SET risco_titular = ?, avaliacao_texto = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`)
    .bind(d.risco_titular, d.avaliacao_texto ?? null, status, id, projectId).run();
  await logAudit(db, 'incidente.risco', ator, `Incidente ${i.protocolo}: risco ao titular ${d.risco_titular}`, '', '', projectId);
  return { ok: true };
}

/** Registra que a comunicação foi feita (à ANPD ou ao titular). Sem data, vale agora. A data não pode estar no futuro. */
export async function registrarComunicacao(db: D1Database, projectId: string, id: string, ator: string, d: { destino: 'anpd' | 'titular'; em?: string }): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const em = d.em ?? agora();
  if (!ehInstante(em)) return falha(400, 'em precisa ser uma data ou data e hora ISO');
  if (Date.parse(em.length === 10 ? `${em}T00:00:00Z` : em) > Date.now() + 60_000) return falha(400, 'A comunicação não pode estar no futuro');
  const coluna = d.destino === 'anpd' ? 'comunicacao_anpd_em' : 'comunicacao_titular_em'; // vem da lista fechada do tipo, nunca do corpo cru
  await db.prepare(`UPDATE incidentes SET ${coluna} = ?, status = 'comunicado', updated_at = datetime('now') WHERE id = ? AND project_id = ?`).bind(em, id, projectId).run();
  await logAudit(db, 'incidente.comunicacao', ator, `Incidente ${i.protocolo}: comunicação ${d.destino === 'anpd' ? 'à ANPD' : 'ao titular'} em ${em}`, '', '', projectId);
  return { ok: true };
}

export async function encerrarIncidente(db: D1Database, projectId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente já encerrado');
  if (!i.risco_titular) return falha(409, 'Avalie o risco ao titular antes de encerrar');
  if (i.risco_titular === 'relevante' && !i.comunicacao_anpd_em) return falha(409, 'Risco relevante exige a comunicação à ANPD registrada antes de encerrar');
  await db.prepare(`UPDATE incidentes SET status = 'encerrado', updated_at = datetime('now') WHERE id = ? AND project_id = ?`).bind(id, projectId).run();
  await logAudit(db, 'incidente.encerrado', ator, `Incidente ${i.protocolo} encerrado`, '', '', projectId);
  return { ok: true };
}
