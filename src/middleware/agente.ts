import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { apiKeyRoleViolation } from '../auth-policy';
import { consultorDesignado } from '../helpers';

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
 * A concessão vale agora? Não revogada, não expirada, consultor ativo, projeto da
 * MESMA organização do consultor e AINDA designado na governança do projeto.
 * Única fonte da regra: o handler /mcp a consulta antes de abrir a sessão MCP (401 para o cliente reabrir o OAuth) e
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
): Promise<{ email: string; client_name: string; project_name: string } | null> {
  const row = await db.prepare(
    `SELECT u.email, u.role, u.ativo, ${NOME_CLIENTE_SQL} AS client_name,
            COALESCE(NULLIF(trim(p.project_name), ''), p.id) AS project_name
       FROM agente_concessoes ac
       JOIN users u ON u.id = ac.user_id
       JOIN projects p ON p.id = ac.project_id
      WHERE ac.id = ? AND ac.user_id = ? AND ac.project_id = ?
        AND ac.revogado_em IS NULL AND ac.expira_em > datetime('now')
        -- multiconsultoria: o projeto tem de ser da organização do consultor da concessão
        AND p.org_id = u.org_id
        -- organização suspensa derruba o agente da equipe dela (a ness. não é suspensa)
        AND (u.org_id = 'org_ness' OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = u.org_id AND o.status = 'Active'))`
  ).bind(p.concessaoId, p.userId, p.projectId).first<{ email: string; role: string; ativo: number | null; client_name: string; project_name: string }>();
  if (!row || row.ativo === 0 || (row.role !== 'consultor' && row.role !== 'consultant')) return null;

  // Tirar o consultor da governança derruba o agente na próxima requisição,
  // sem esperar o token expirar.
  // Mesma regra do consultor humano (D5): uma fonte só.
  return await consultorDesignado(db, row.email, p.projectId) ?{ email: row.email, client_name: row.client_name, project_name: row.project_name } : null;
}

/** Só `resolverAgente` lê; ele só roda com `env.AGENTE`, então de fora o cabeçalho é inerte. */
export const CABECALHO_CONFIRMADO = 'X-Agente-Confirmado';

/**
 * O consultor humano alcança estas rotas; o agente não. Não são documento nem
 * achado do SGSI: são controle de acesso, configuração de segurança do cliente,
 * visão de todos os clientes ou a área comercial. O agente não amplia o próprio
 * acesso nem enxerga fora do projeto.
 */
/** Terceiro campo opcional: só estes métodos são recusados (GET /projects segue valendo, escopado). */
const FORA_DO_AGENTE: Array<[RegExp, string, string[]?]> = [
  [/^\/api\/v1\/(users|admin\/users)(\/|$)/, 'gestão de usuários'],
  [/^\/api\/v1\/platform(\/|$)/, 'administração da plataforma (organizações)'],
  [/^\/api\/v1\/dashboard(\/|$)/, 'o painel global agrega todos os clientes'],
  [/^\/api\/v1\/(assessments|leads|proposals|funil)(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/org(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/servicos(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/propostas(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/projects\/[^/]+\/(sso|security-policy|scim-token|api-keys|webhooks)(\/|$)/, 'configuração de segurança do cliente'],
  [/^\/api\/v1\/webhooks(\/|$)/, 'configuração de segurança do cliente'],
  // O principal do agente carrega o users.id REAL do consultor: rotas de "minha conta" agiriam sobre ele.
  [/^\/api\/v1\/(auth|legal|notifications)(\/|$)/, 'conta pessoal do consultor'],
  [/^\/api\/v1\/projects\/[^/]+\/auditor-token(\/|$)/, 'credencial de auditor externo'],
  [/^\/api\/v1\/projects\/?$/, 'o agente está preso a um projeto', ['POST']],
  [/\/agentes(\/|$)/, 'o agente não gere o próprio acesso'],
  // Desaprovar é ato da direção, pela interface (F6, decisão D1): o agente não revoga a aprovação de
  // ROPA nem de DPIA, e não apaga análise crítica, que é registro assinado. Revogar aprovação de
  // CONTROLE segue possível, com confirmação (acaoDestrutiva).
  // Assinatura eletrônica é ato humano, pela interface (senha do assinante).
  [/^\/api\/v1\/(evidence|controls)\/[^/]+\/(signatures\/)?approve$/, 'assinatura eletrônica é ato humano, pela interface', ['POST', 'PUT']],
  [/^\/api\/v1\/projects\/[^/]+\/(ropa|dpia)\/[^/]+\/revoke-approval$/, 'revogar aprovação de ROPA e DPIA é da direção, pela interface'],
  // O agente propõe política (rascunho); publicar e descartar o rascunho é ato humano, pela interface (fatia 3.2).
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+\/versoes\/[^/]+\/publicar$/, 'publicar versão de documento é ato humano, pela interface', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+\/rascunho$/, 'descartar rascunho de documento é ato humano, pela interface', ['DELETE']],
  [/^\/api\/v1\/management-reviews\/[^/]+$/, 'excluir análise crítica destrói registro assinado: use a interface', ['DELETE']],
];

/** Única definição do que exige confirmação: apagar, gerar em lote, anonimizar titular, revogar aprovações. */
export function acaoDestrutiva(method: string, path: string): boolean {
  return method.toUpperCase() === 'DELETE' || path.endsWith('/generate-policies-bulk') || path.endsWith('/data-subject/erase') || /\/revoke-approvals?$/.test(path);
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

  // A concessão primeiro: agente revogado, expirado ou sem designação ouve 401 ("refaça o
  // login") em QUALQUER rota. Com a lista de proibidas antes, ele ouvia 403 e não sabia que
  // precisava reconectar.
  const row = await concessaoValida(c.env.DB, p);
  if (!row) return c.json({ error: REFACA }, 401);

  // Paridade com o consultor, preso ao projeto: `role: 'client'` + `client_project_id`
  // herda o isolamento de tenant; o que é destrutivo exige confirmação.
  for (const [re, motivo, metodos] of FORA_DO_AGENTE) {
    if (re.test(path) && (!metodos || metodos.includes(method))) return c.json({ error: `Forbidden: fora do alcance do agente (${motivo}) — use a interface` }, 403);
  }
  if (acaoDestrutiva(method, path) && c.req.header(CABECALHO_CONFIRMADO) !== '1') {
    return c.json({ error: 'Forbidden: apagar, gerar em lote, eliminar titular e revogar aprovações exigem confirmação — mostre ao usuário o que será feito, espere o "sim" e reenvie com confirmado_pelo_usuario: true' }, 403);
  }
  const violacao = apiKeyRoleViolation('consultant', method, path);
  if (violacao) return c.json({ error: violacao }, 403);

  await c.env.DB.prepare(`UPDATE agente_concessoes SET ultimo_uso_em = datetime('now') WHERE id = ?`)
    .bind(p.concessaoId).run().catch(() => {});

  // `role: 'client'` + `client_project_id` herda o isolamento de tenant do
  // projectAccessMiddleware; a escrita é liberada pelo chamador (writeCapable).
  // Sem nome de cliente, NOME_CLIENTE_SQL já cai para o projeto: não repita o nome.
  const rotulo = row.client_name === row.project_name ? row.client_name : `${row.client_name} / ${row.project_name}`;
  return {
    id: p.userId,
    email: `agente de ${row.email} (${rotulo})`,
    role: 'client',
    client_project_id: p.projectId,
    agente: true,
  };
}
