import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { apiKeyRoleViolation } from '../auth-policy';

/**
 * Identidade de um agente de IA conectado pelo MCP remoto (spec
 * 2026-09-29-receita-agentes-mcp-remoto). Chega em `env.AGENTE`, que só o
 * handler /mcp preenche — requisição externa não escolhe o `env`.
 */
export interface PropsAgente {
  userId: string;
  email: string;
  projectId: string;
  concessaoId: string;
}

const REFACA = 'Acesso do agente revogado, expirado ou sem designação no projeto: refaça o login no cliente MCP.';

/**
 * A concessão vale agora? Não revogada, não expirada, consultor ativo e AINDA
 * designado na governança do projeto. Única fonte da regra: o handler /mcp a
 * consulta antes de abrir a sessão MCP (401 para o cliente reabrir o OAuth) e
 * o resolverAgente a cada chamada interna.
 */
/**
 * Nome do cliente para exibir (projeto com alias `p`): cai para o nome do
 * projeto quando `client_name` está vazio, e para o id em último caso. Usado no
 * login OAuth do agente e na trilha — nunca "agente de x ()".
 */
export const NOME_CLIENTE_SQL = `COALESCE(NULLIF(trim(p.client_name), ''), p.project_name, p.id)`;

export async function concessaoValida(
  db: D1Database,
  p: PropsAgente
): Promise<{ email: string; client_name: string } | null> {
  const row = await db.prepare(
    `SELECT u.email, u.role, u.ativo, ${NOME_CLIENTE_SQL} AS client_name
       FROM agente_concessoes ac
       JOIN users u ON u.id = ac.user_id
       JOIN projects p ON p.id = ac.project_id
      WHERE ac.id = ? AND ac.user_id = ? AND ac.project_id = ?
        AND ac.revogado_em IS NULL AND ac.expira_em > datetime('now')`
  ).bind(p.concessaoId, p.userId, p.projectId).first<{ email: string; role: string; ativo: number | null; client_name: string }>();
  if (!row || row.ativo === 0 || (row.role !== 'consultor' && row.role !== 'consultant')) return null;

  // Tirar o consultor da governança derruba o agente na próxima requisição,
  // sem esperar o token expirar.
  const designado = await db.prepare(
    `SELECT 1 FROM project_governance WHERE project_id = ? AND lower(email) = lower(?) AND role_category = 'consultor'`
  ).bind(p.projectId, row.email).first();
  return designado ? { email: row.email, client_name: row.client_name } : null;
}

export async function resolverAgente(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  p: PropsAgente
): Promise<Variables['user'] | Response> {
  const method = c.req.method.toUpperCase();
  // Caminho DECODIFICADO, o mesmo que o Hono usa para rotear: testar o cru
  // deixava `%67enerate-policies-bulk` passar pela recusa e chegar à rota.
  const path = c.req.path;
  // `%2F` o Hono não decodifica; `.`/`..` e `\` só aparecem aqui por
  // codificação. Nenhum caminho legítimo do agente tem isso.
  if (/%2f/i.test(path) || path.includes('\\') || path.split('/').some((s) => s === '.' || s === '..')) {
    return c.json({ error: 'Forbidden: caminho inválido' }, 403);
  }

  // Proporcionalidade: o agente escreve adequação, não destrói nem opera em lote.
  if (method === 'DELETE') return c.json({ error: 'Forbidden: o agente não apaga registros — faça pela interface' }, 403);
  if (path.endsWith('/generate-policies-bulk')) return c.json({ error: 'Forbidden: geração em lote exige a interface e aprovação humana' }, 403);
  if (/\/agentes(\/|$)/.test(path)) return c.json({ error: 'Forbidden: o agente não gere o próprio acesso' }, 403);
  const violacao = apiKeyRoleViolation('consultant', method, path);
  if (violacao) return c.json({ error: violacao }, 403);

  const row = await concessaoValida(c.env.DB, p);
  if (!row) return c.json({ error: REFACA }, 401);

  await c.env.DB.prepare(`UPDATE agente_concessoes SET ultimo_uso_em = datetime('now') WHERE id = ?`)
    .bind(p.concessaoId).run().catch(() => {});

  // `role: 'client'` + `client_project_id` herda o isolamento de tenant do
  // projectAccessMiddleware; a escrita é liberada pelo chamador (writeCapable).
  return {
    id: p.userId,
    email: `agente de ${row.email} (${row.client_name})`,
    role: 'client',
    client_project_id: p.projectId,
  };
}
