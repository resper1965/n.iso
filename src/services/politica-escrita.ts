import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { logAudit, registraErro } from '../helpers';
import { conferirPedidosDoDocumento } from '../routes/pedidos';
import { COLUNAS_REVOGACAO } from '../routes/controls';
import { espelharTexto, garantirDocumentoDoControle, salvarRascunho, type Falha } from './documentos';

/** O contexto Hono das rotas: `conferirPedidosDoDocumento` o usa para a trilha e para o log. */
type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Passos 2 a 4 da escrita de política, que todo escritor repetia (fatia 3.2):
 *
 * 2. grava o texto no controle e zera as duas aprovações (o texto mudou, o que foi assinado não vale mais);
 * 3. confere os pedidos abertos (o conteúdo congelado mudou: o pedido antigo é substituído);
 * 4. registra a versão em `policy_versions`.
 *
 * `versaoOpcional` reproduz as rotas de geração, em que a falha ao registrar a versão só é logada; nas demais
 * ela propaga, como antes. `controlId` é o id CANÔNICO (o que existe em `compliance_controls`, FK de
 * `policy_versions`). `c` é o contexto Hono, porque `conferirPedidosDoDocumento` o usa para trilha e log.
 */
export async function aplicarTextoNoControle(
  c: Ctx, projectId: string, controlId: string, texto: string, ator: string, opcoes: { versaoOpcional?: boolean } = {},
): Promise<{ versao: number }> {
  const db: D1Database = c.env.DB;
  await db.prepare(
    `UPDATE compliance_controls SET description = ?, ${COLUNAS_REVOGACAO.ciso}, ${COLUNAS_REVOGACAO.ceo}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
  ).bind(texto, controlId, projectId).run();
  await conferirPedidosDoDocumento(c, 'politica', controlId, projectId);

  let versao = 0;
  try {
    const n = await db.prepare('SELECT COUNT(*) AS count FROM policy_versions WHERE project_id = ? AND control_id = ?')
      .bind(projectId, controlId).first<{ count: number }>();
    versao = (n?.count || 0) + 1;
    await db.prepare('INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID().replace(/-/g, '').substring(0, 16), projectId, controlId, versao, texto, ator).run();
  } catch (e) {
    if (!opcoes.versaoOpcional) throw e;
    registraErro(c, e);
  }
  return { versao };
}

/**
 * Escrita HUMANA (ou de gerador) de política: documento garantido, texto aplicado no controle e espelhado
 * no documento. Até a 3.3 o controle segue sendo a fonte (ciência, portal e pedidos leem dele), então o
 * documento NUNCA derruba o escritor: a falha dele vai para o log com `registraErro`.
 */
export async function gravarPolitica(
  c: Ctx, projectId: string, controlId: string, texto: string, ator: string,
  origem: 'humano' | 'gerador', opcoes: { versaoOpcional?: boolean } = {},
): Promise<{ versao: number }> {
  const db: D1Database = c.env.DB;

  // Antes de escrever, para a primeira escrita não perder o histórico que ainda está só em policy_versions.
  let documentoId: string | null = null;
  try {
    documentoId = await garantirDocumentoDoControle(db, projectId, controlId, ator);
  } catch (e) {
    registraErro(c, e);
  }

  const { versao } = await aplicarTextoNoControle(c, projectId, controlId, texto, ator, opcoes);

  if (documentoId) {
    try {
      await espelharTexto(db, projectId, documentoId, texto, ator, origem);
    } catch (e) {
      registraErro(c, e);
    }
  }
  return { versao };
}

/**
 * Escrita do AGENTE (MCP): vira rascunho do documento do controle e NADA mais. O controle, as aprovações, os
 * pedidos e `policy_versions` ficam como estão; um humano publica (`POST /documentos/:id/versoes/:n/publicar`).
 * A imposição é do servidor: quem chama decide por `c.get('user')?.agente === true`, vindo de `env.AGENTE`.
 */
export async function gravarRascunhoDoAgente(
  c: Ctx, projectId: string, controlId: string, texto: string, ator: string,
): Promise<Falha | { ok: true; documento_id: string; numero: number }> {
  const db: D1Database = c.env.DB;
  const documentoId = await garantirDocumentoDoControle(db, projectId, controlId, ator);
  const r = await salvarRascunho(db, projectId, documentoId, ator, texto, 'agente');
  if (!r.ok) return r;
  await logAudit(db, 'policy.rascunho_do_agente', ator, `Rascunho de política do agente para o controle ${controlId} (versão ${r.numero})`, '', '', projectId);
  return { ok: true, documento_id: documentoId, numero: r.numero };
}
