import { registraErro } from '../helpers';
import { conferirPedidosDoDocumento } from '../routes/pedidos';
import { COLUNAS_REVOGACAO } from '../routes/controls';
import { espelharTexto, garantirDocumentoDoControle } from './documentos';

/**
 * A sequência que todo escritor de texto de política repetia, agora numa função só (fatia 3.2):
 *
 * 1. garante o documento do controle (antes de escrever, para a primeira escrita não perder o histórico);
 * 2. grava o texto no controle e zera as duas aprovações (o texto mudou, o que foi assinado não vale mais);
 * 3. confere os pedidos abertos (o conteúdo congelado mudou: o pedido antigo é substituído);
 * 4. registra a versão em `policy_versions`;
 * 5. espelha o texto no documento.
 *
 * Até a 3.3 o controle segue sendo a fonte (ciência, portal e pedidos leem dele), então os passos 1 e 5 NUNCA
 * derrubam o escritor: a falha vai para o log com `registraErro`. `versaoOpcional` reproduz as rotas de geração,
 * em que a falha ao registrar a versão também só é logada; nas demais ela propaga, como antes.
 *
 * `controlId` é o id CANÔNICO do controle (o que existe em `compliance_controls`, FK de `policy_versions`).
 * `c` é o contexto Hono, porque `conferirPedidosDoDocumento` o usa para a trilha e para o log.
 */
export async function gravarPolitica(
  c: any, projectId: string, controlId: string, texto: string, ator: string,
  origem: 'humano' | 'gerador', opcoes: { versaoOpcional?: boolean } = {},
): Promise<{ versao: number }> {
  const db: D1Database = c.env.DB;

  let documentoId: string | null = null;
  try {
    documentoId = await garantirDocumentoDoControle(db, projectId, controlId, ator);
  } catch (e) {
    registraErro(c, e);
  }

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

  if (documentoId) {
    try {
      await espelharTexto(db, projectId, documentoId, texto, ator, origem);
    } catch (e) {
      registraErro(c, e);
    }
  }
  return { versao };
}
