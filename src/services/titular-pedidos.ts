import { logAudit } from '../helpers';
import { prazoDe, proximoProtocolo } from './parametros-legais';

/**
 * Núcleo do n.privacy, fatia 7: pedido do titular (registro interno). Protocolo `PT-AAAA-NNNN` por projeto; o prazo vem do parâmetro
 * `titular.resposta` e é CONGELADO no registro (sem parâmetro fica nulo: "não calculado"). Respondido/negado é final: só arquiva.
 */

export const TIPOS_PEDIDO = ['confirmacao', 'acesso', 'correcao', 'anonimizacao_bloqueio_eliminacao', 'portabilidade', 'informacao_compartilhamento', 'revogacao_consentimento', 'oposicao', 'outro'] as const;
export const CANAIS_PEDIDO = ['email', 'telefone', 'formulario', 'presencial', 'outro'] as const;
export const STATUS_PEDIDO = ['recebido', 'em_andamento', 'respondido', 'negado', 'arquivado'] as const;
type TipoPedido = (typeof TIPOS_PEDIDO)[number];
type CanalPedido = (typeof CANAIS_PEDIDO)[number];
type StatusPedido = (typeof STATUS_PEDIDO)[number];
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

const hoje = () => new Date().toISOString().slice(0, 10);
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export type SituacaoPrazo = 'sem_prazo' | 'encerrado' | 'no_prazo' | 'vence_hoje' | 'atrasado';
/** O prazo do pedido em relação a hoje; pedido respondido, negado ou arquivado não corre mais. */
export function situacaoDoPrazo(p: { prazo_em: string | null; status: string }, em = hoje()): SituacaoPrazo {
  if (['respondido', 'negado', 'arquivado'].includes(p.status)) return 'encerrado';
  if (!p.prazo_em) return 'sem_prazo';
  const dia = p.prazo_em.slice(0, 10);
  return dia < em ? 'atrasado' : dia === em ? 'vence_hoje' : 'no_prazo';
}

const COLS = 'id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, prazo_em, status, respondido_em, resposta_texto, responsavel_parte_id, criado_por, created_at, updated_at';
export type Pedido = {
  id: string; protocolo: string; tipo: TipoPedido; canal: CanalPedido; titular_nome: string | null; titular_contato: string | null; descricao: string | null;
  recebido_em: string; prazo_em: string | null; status: StatusPedido; respondido_em: string | null; resposta_texto: string | null; responsavel_parte_id: string | null;
};
const comSituacao = (p: Pedido) => ({ ...p, situacao_prazo: situacaoDoPrazo(p) });

export async function listarPedidos(db: D1Database, projectId: string) {
  const { results } = await db.prepare(`SELECT ${COLS} FROM titular_pedidos WHERE project_id = ? ORDER BY recebido_em DESC, protocolo DESC`).bind(projectId).all<Pedido>();
  return results.map(comSituacao);
}

export async function lerPedido(db: D1Database, projectId: string, id: string) {
  const p = await db.prepare(`SELECT ${COLS} FROM titular_pedidos WHERE id = ? AND project_id = ?`).bind(id, projectId).first<Pedido>();
  return p ? comSituacao(p) : null;
}

const parteDoProjeto = async (db: D1Database, projectId: string, id: string | null | undefined) =>
  !id || !!(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(id, projectId).first());

export type NovoPedido = { tipo: TipoPedido; canal?: CanalPedido; titular_nome?: string | null; titular_contato?: string | null; descricao?: string | null; recebido_em?: string; responsavel_parte_id?: string | null };

export async function criarPedido(db: D1Database, projectId: string, ator: string, d: NovoPedido): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_em: string | null }> {
  const recebido = d.recebido_em ?? hoje();
  if (!ehData(recebido)) return falha(400, 'recebido_em precisa ser uma data AAAA-MM-DD');
  if (recebido > hoje()) return falha(400, 'recebido_em não pode estar no futuro');
  if (!(await parteDoProjeto(db, projectId, d.responsavel_parte_id))) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');
  const prazo = await prazoDe(db, 'titular.resposta', recebido);
  const id = crypto.randomUUID();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const protocolo = await proximoProtocolo(db, 'titular_pedidos', 'PT', projectId, Number(recebido.slice(0, 4)));
    try {
      await db.prepare(
        `INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, prazo_em, responsavel_parte_id, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, projectId, protocolo, d.tipo, d.canal ?? 'outro', d.titular_nome ?? null, d.titular_contato ?? null, d.descricao ?? null, recebido, prazo, d.responsavel_parte_id ?? null, ator).run();
      await logAudit(db, 'titular.pedido_criado', ator, `Pedido ${protocolo} (${d.tipo}) registrado; prazo ${prazo ? prazo.slice(0, 10) : 'não calculado'}`, '', '', projectId);
      return { ok: true, id, protocolo, prazo_em: prazo };
    } catch (e) {
      if (!/UNIQUE/i.test(String((e as Error)?.message))) throw e; // duas criações juntas pegaram o mesmo número: tenta o próximo
    }
  }
  return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
}

export type AtualizacaoPedido = { status?: StatusPedido; resposta_texto?: string | null; responsavel_parte_id?: string | null; prazo_em?: string | null; descricao?: string | null };

export async function atualizarPedido(db: D1Database, projectId: string, id: string, ator: string, d: AtualizacaoPedido): Promise<Falha | { ok: true }> {
  const atual = await lerPedido(db, projectId, id);
  if (!atual) return falha(404, 'Pedido não encontrado');
  const final = atual.status === 'respondido' || atual.status === 'negado';
  if (final && (d.status ?? atual.status) !== atual.status && d.status !== 'arquivado') return falha(409, 'Pedido respondido ou negado só pode ser arquivado');
  if (final && (d.resposta_texto !== undefined || d.prazo_em !== undefined || d.descricao !== undefined)) return falha(409, 'Pedido respondido ou negado não muda: a resposta é o registro');
  if (atual.status === 'arquivado' && d.status !== undefined && d.status !== 'arquivado') return falha(409, 'Pedido arquivado não reabre');
  if (d.prazo_em != null && !ehData(d.prazo_em.slice(0, 10))) return falha(400, 'prazo_em precisa ser uma data AAAA-MM-DD');
  if (d.responsavel_parte_id !== undefined && !(await parteDoProjeto(db, projectId, d.responsavel_parte_id))) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');

  const novo = d.status ?? atual.status;
  const resposta = d.resposta_texto !== undefined ? d.resposta_texto : atual.resposta_texto;
  if ((novo === 'respondido' || novo === 'negado') && !String(resposta ?? '').trim()) return falha(400, 'Registre o texto da resposta para responder ou negar');
  const encerrando = (novo === 'respondido' || novo === 'negado') && atual.status !== novo;

  const sets: string[] = ['status = ?', "updated_at = datetime('now')"];
  const binds: unknown[] = [novo];
  if (d.resposta_texto !== undefined) { sets.push('resposta_texto = ?'); binds.push(d.resposta_texto); }
  if (d.responsavel_parte_id !== undefined) { sets.push('responsavel_parte_id = ?'); binds.push(d.responsavel_parte_id); }
  if (d.prazo_em !== undefined) { sets.push('prazo_em = ?'); binds.push(d.prazo_em); }
  if (d.descricao !== undefined) { sets.push('descricao = ?'); binds.push(d.descricao); }
  if (encerrando) { sets.push('respondido_em = ?'); binds.push(new Date().toISOString()); }
  await db.prepare(`UPDATE titular_pedidos SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`).bind(...binds, id, projectId).run();
  await logAudit(db, 'titular.pedido_atualizado', ator, `Pedido ${atual.protocolo}: ${atual.status} → ${novo}${d.prazo_em !== undefined ? '; prazo alterado à mão' : ''}`, '', '', projectId);
  return { ok: true };
}
