// Transferência de projeto para a organização do cliente (fatia 5, spec §9): só o platform_admin.
//
// Num db.batch só (transação): (1) o projeto muda de organização, com o UPDATE guardado pela
// organização de ORIGEM lida antes; (2) a trilha `projeto.transferido` entra só se (1) mudou a linha
// (`changes()`), com id único desta chamada; (3) e (4) só agem se a trilha DESTA chamada existe
// (mesmo padrão de public-propostas.ts). Duas transferências concorrentes leem a mesma origem; a
// primeira muda a linha, a segunda não muda nada e responde 'corrida'. Repetição: a origem passa a
// ser o destino → 'mesma_org' antes do batch.
//
// O que sai: as designações `consultor` cujo e-mail é de conta da organização de origem (sem
// diferença de caixa), as concessões de agente ainda ativas do projeto e as integrações que a origem
// configurou e que continuariam dando acesso a ela: chaves de API (revogadas), webhooks (inativos:
// URL e segredo são da origem), SSO (desligado: o `issuer` decide quem entra) e o token SCIM
// (inativo). O administrador do destino reconfigura o que quiser. O que fica: usuários do
// cliente (`client_project_id`), propostas e contratos (são da consultoria que vendeu) e
// designações de e-mail de fora da origem.
import { genId } from '../helpers';

export interface EntradaTransferencia { projetoId: string; orgDestinoId: string; motivo: string; atorEmail: string; ip: string }
export type ResultadoTransferencia =
  | { ok: true; origem: string; destino: string; consultoresRemovidos: number; concessoesRevogadas: number;
      chavesRevogadas: number; webhooksDesativados: number; ssoDesativado: boolean; scimRevogado: boolean }
  | { ok: false; motivo: 'nao_encontrado' | 'destino_invalido' | 'mesma_org' | 'corrida' };

export const MSG_CORRIDA = { error: 'O projeto mudou de organização; tente de novo' } as const;

/** Consultores da origem na governança do projeto: os mesmos `?` (projeto, origem) nas duas consultas. */
const CONSULTORES_DA_ORIGEM = `project_id = ? AND role_category = 'consultor'
  AND lower(email) IN (SELECT lower(email) FROM users WHERE org_id = ?)`;

export async function transferirProjeto(db: D1Database, e: EntradaTransferencia): Promise<ResultadoTransferencia> {
  const [projeto, destino] = await Promise.all([
    db.prepare('SELECT org_id FROM projects WHERE id = ?').bind(e.projetoId).first<{ org_id: string }>(),
    db.prepare('SELECT status FROM organizations WHERE id = ?').bind(e.orgDestinoId).first<{ status: string | null }>(),
  ]);
  if (!projeto || !destino) return { ok: false, motivo: 'nao_encontrado' };
  if (destino.status !== 'Active') return { ok: false, motivo: 'destino_invalido' };
  const origem = projeto.org_id;
  if (origem === e.orgDestinoId) return { ok: false, motivo: 'mesma_org' };

  const auditId = genId();
  const DESTA = 'EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)';
  // motivo digitado: uma linha, com teto, entre aspas (JSON escapa aspas e barras)
  const motivo = JSON.stringify(e.motivo.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 500));
  const res = await db.batch([
    db.prepare(`UPDATE projects SET org_id = ? WHERE id = ? AND org_id = ?
        AND EXISTS (SELECT 1 FROM organizations WHERE id = ? AND status = 'Active')`)
      .bind(e.orgDestinoId, e.projetoId, origem, e.orgDestinoId),
    // Uma linha só (batch de tamanho fixo), com a lista exata do que o DELETE abaixo remove: mesma
    // condição, mesma transação. ponytail: sem `governance.removed` por consultor; a lista vai aqui.
    db.prepare(`INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
        SELECT ?, 'projeto.transferido', ?,
          'Projeto ' || ? || ' transferido da organização ' || ? || ' para ' || ? || '; motivo: ' || ?
          || '; consultores da origem removidos da governança: '
          || COALESCE((SELECT group_concat(email, ', ') FROM project_governance WHERE ${CONSULTORES_DA_ORIGEM}), 'nenhum')
          || '; concessões de agente revogadas: '
          || (SELECT COUNT(*) FROM agente_concessoes WHERE project_id = ? AND revogado_em IS NULL)
          || '; chaves de API revogadas: ' || (SELECT COUNT(*) FROM api_keys WHERE project_id = ? AND status = 'Active')
          || '; webhooks desativados: ' || (SELECT COUNT(*) FROM webhooks WHERE project_id = ? AND status = 'Active')
          || '; SSO desativado: ' || (SELECT CASE WHEN EXISTS (SELECT 1 FROM project_sso WHERE project_id = ? AND ativo = 1) THEN 'sim' ELSE 'não' END)
          || '; SCIM revogado: ' || (SELECT CASE WHEN EXISTS (SELECT 1 FROM project_scim WHERE project_id = ? AND ativo = 1) THEN 'sim' ELSE 'não' END),
          '', ?, ?, datetime('now')
        WHERE changes() > 0`)
      .bind(auditId, e.atorEmail, e.projetoId, origem, e.orgDestinoId, motivo, e.projetoId, origem, e.projetoId,
        e.projetoId, e.projetoId, e.projetoId, e.projetoId, e.ip, e.projetoId),
    db.prepare(`DELETE FROM project_governance WHERE ${CONSULTORES_DA_ORIGEM} AND ${DESTA}`).bind(e.projetoId, origem, auditId),
    // o agente cai na próxima chamada (concessaoValida exige revogado_em NULL)
    db.prepare(`UPDATE agente_concessoes SET revogado_em = datetime('now'), revogado_por = ?
        WHERE project_id = ? AND revogado_em IS NULL AND ${DESTA}`).bind(e.atorEmail, e.projetoId, auditId),
    // a chave cai na próxima requisição (o middleware exige status 'Active')
    db.prepare(`UPDATE api_keys SET status = 'Revoked' WHERE project_id = ? AND status = 'Active' AND ${DESTA}`).bind(e.projetoId, auditId),
    db.prepare(`UPDATE webhooks SET status = 'Inactive' WHERE project_id = ? AND status = 'Active' AND ${DESTA}`).bind(e.projetoId, auditId),
    db.prepare(`UPDATE project_sso SET ativo = 0, atualizado_em = datetime('now'), atualizado_por = ?
        WHERE project_id = ? AND ativo = 1 AND ${DESTA}`).bind(e.atorEmail, e.projetoId, auditId),
    db.prepare(`UPDATE project_scim SET ativo = 0 WHERE project_id = ? AND ativo = 1 AND ${DESTA}`).bind(e.projetoId, auditId),
    // Pedidos (abertos e fechados) acompanham o projeto: `org_id` é o corte de isolamento deles. O
    // trigger `pedido_prova_imutavel` deixa `org_id` livre; a prova (hash, conteúdo, status) não muda.
    db.prepare(`UPDATE pedidos SET org_id = ? WHERE project_id = ? AND ${DESTA}`).bind(e.orgDestinoId, e.projetoId, auditId),
  ]);
  if (!res[0].meta.changes) {
    // o destino pode ter sido suspenso no meio; senão, outra transferência levou o projeto
    const d = await db.prepare('SELECT status FROM organizations WHERE id = ?').bind(e.orgDestinoId).first<{ status: string | null }>();
    return { ok: false, motivo: d?.status === 'Active' ? 'corrida' : 'destino_invalido' };
  }
  return {
    ok: true, origem, destino: e.orgDestinoId, consultoresRemovidos: res[2].meta.changes, concessoesRevogadas: res[3].meta.changes,
    chavesRevogadas: res[4].meta.changes, webhooksDesativados: res[5].meta.changes,
    ssoDesativado: res[6].meta.changes > 0, scimRevogado: res[7].meta.changes > 0,
  };
}
