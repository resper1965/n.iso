import { logAudit } from '../helpers';
import { documentoAtual, hashConteudo } from './pedidos';
import { hojeEmSaoPaulo } from './avisos-prazo';
import { falha, type Falha } from './documentos';

/**
 * Exceções a documentos (fatia 3.5). A exceção é um registro (a quem vale, por quê, até quando); a APROVAÇÃO é um pedido
 * `tipo = 'excecao'` com `ref_id` = a exceção, e a prova é a linha do destinatário. Situação derivada: `revogada`,
 * `vencida`, `aprovada` (existe pedido aprovado com o hash do conteúdo atual), `aguardando` (há pedido aberto) ou
 * `sem_pedido`. Mudar escopo, motivo ou prazo muda o hash e a aprovação deixa de valer sozinha.
 */
export type SituacaoExcecao = 'revogada' | 'vencida' | 'aprovada' | 'aguardando' | 'sem_pedido';

export type Excecao = {
  id: string; escopo: string; motivo: string; vence_em: string; status: 'ativa' | 'revogada'; criado_por: string | null;
  revogada_em: string | null; revogada_por: string | null; created_at: string;
  situacao: SituacaoExcecao; aprovacao: { por: string; em: string; papel: 'ciso' | 'ceo' } | null;
};

export type ExcecaoCriar = { escopo: string; motivo: string; vence_em: string };
export type ExcecaoAtualizar = Partial<ExcecaoCriar>;

const documentoExiste = async (db: D1Database, projectId: string, documentoId: string) =>
  !!(await db.prepare('SELECT 1 FROM documentos WHERE id = ? AND project_id = ?').bind(documentoId, projectId).first());

/** A exceção é daquele documento e daquele projeto? Devolve a linha, ou `null`. */
const daqui = (db: D1Database, projectId: string, documentoId: string, id: string) =>
  db.prepare('SELECT id, status FROM documento_excecoes WHERE id = ? AND documento_id = ? AND project_id = ?')
    .bind(id, documentoId, projectId).first<{ id: string; status: 'ativa' | 'revogada' }>();

export async function listarExcecoes(db: D1Database, projectId: string, documentoId: string): Promise<Excecao[] | null> {
  if (!(await documentoExiste(db, projectId, documentoId))) return null;
  const { results } = await db.prepare(
    `SELECT id, escopo, motivo, vence_em, status, criado_por, revogada_em, revogada_por, created_at
       FROM documento_excecoes WHERE documento_id = ? AND project_id = ? ORDER BY vence_em, created_at, rowid`
  ).bind(documentoId, projectId).all<Omit<Excecao, 'situacao' | 'aprovacao'>>();

  const hoje = hojeEmSaoPaulo();
  const saida: Excecao[] = [];
  for (const e of results) {
    let situacao: SituacaoExcecao = 'sem_pedido';
    let aprovacao: Excecao['aprovacao'] = null;
    if (e.status === 'revogada') situacao = 'revogada';
    else {
      const atual = await documentoAtual(db, 'excecao', e.id, projectId);
      const hash = atual ? await hashConteudo(atual.conteudo) : null;
      if (hash) {
        const a = await db.prepare(
          `SELECT COALESCE(NULLIF(pd.nome, ''), pd.email) AS por, pd.decidido_em AS em, p.papel_exigido AS papel
             FROM pedido_destinatarios pd JOIN pedidos p ON p.id = pd.pedido_id
            WHERE p.project_id = ? AND p.tipo = 'excecao' AND p.ref_id = ? AND p.hash = ? AND pd.status = 'aprovado'
            ORDER BY pd.decidido_em DESC, pd.rowid DESC LIMIT 1`
        ).bind(projectId, e.id, hash).first<NonNullable<Excecao['aprovacao']>>();
        aprovacao = a ?? null;
      }
      const aberto = await db.prepare(`SELECT 1 FROM pedidos WHERE project_id = ? AND tipo = 'excecao' AND ref_id = ? AND status = 'aberto'`).bind(projectId, e.id).first();
      situacao = e.vence_em < hoje ? 'vencida' : aprovacao ? 'aprovada' : aberto ? 'aguardando' : 'sem_pedido';
    }
    saida.push({ ...e, situacao, aprovacao });
  }
  return saida;
}

/** Prazo no passado não vale: a exceção é temporária por definição. O dia é o de São Paulo (como os avisos). */
const passado = (vence: string) => vence < hojeEmSaoPaulo();

export async function criarExcecao(db: D1Database, projectId: string, documentoId: string, ator: string, d: ExcecaoCriar): Promise<Falha | { ok: true; id: string }> {
  if (!(await documentoExiste(db, projectId, documentoId))) return falha(404, 'Documento não encontrado');
  if (passado(d.vence_em)) return falha(400, 'vence_em não pode estar no passado');
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO documento_excecoes (id, project_id, documento_id, escopo, motivo, vence_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, documentoId, d.escopo, d.motivo, d.vence_em, ator).run();
  await logAudit(db, 'documento.excecao_criada', ator, `Exceção ${id} ao documento ${documentoId}, até ${d.vence_em}`, '', '', projectId);
  return { ok: true, id };
}

export async function atualizarExcecao(
  db: D1Database, projectId: string, documentoId: string, id: string, ator: string, campos: ExcecaoAtualizar,
): Promise<Falha | { ok: true }> {
  const atual = await daqui(db, projectId, documentoId, id);
  if (!atual) return falha(404, 'Exceção não encontrada');
  if (atual.status === 'revogada') return falha(409, 'Exceção revogada não se edita: registre outra');
  if (!Object.keys(campos).length) return falha(400, 'Informe ao menos um campo para atualizar');
  if (campos.vence_em !== undefined && passado(campos.vence_em)) return falha(400, 'vence_em não pode estar no passado');
  // Colunas fixas, nunca nomes vindos da requisição.
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (campos.escopo !== undefined) { sets.push('escopo = ?'); binds.push(campos.escopo); }
  if (campos.motivo !== undefined) { sets.push('motivo = ?'); binds.push(campos.motivo); }
  if (campos.vence_em !== undefined) { sets.push('vence_em = ?'); binds.push(campos.vence_em); }
  await db.prepare(`UPDATE documento_excecoes SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(...binds, id, projectId).run();
  await logAudit(db, 'documento.excecao_atualizada', ator, `Exceção ${id} atualizada (${Object.keys(campos).join(', ')})`, '', '', projectId);
  return { ok: true };
}

export async function revogarExcecao(db: D1Database, projectId: string, documentoId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const atual = await daqui(db, projectId, documentoId, id);
  if (!atual) return falha(404, 'Exceção não encontrada');
  if (atual.status === 'revogada') return falha(409, 'A exceção já está revogada');
  await db.prepare(`UPDATE documento_excecoes SET status = 'revogada', revogada_em = CURRENT_TIMESTAMP, revogada_por = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND status = 'ativa'`)
    .bind(ator, id, projectId).run();
  await logAudit(db, 'documento.excecao_revogada', ator, `Exceção ${id} revogada`, '', '', projectId);
  return { ok: true };
}
