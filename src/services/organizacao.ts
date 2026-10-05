import { DEFAULT_FINANCIAL_MODEL, SCOPE_MULTIPLIERS } from './pricing';

export const ORG_NESS = 'org_ness';

const PAPEIS_PLATAFORMA = new Set(['platform_admin', 'admin']);
/** Equipe de uma consultoria: a organização vem de `users.org_id`, gravado na sessão pelo login. */
const PAPEIS_EQUIPE = new Set(['consultor', 'consultant', 'comercial', 'consultoria_admin']);

/**
 * Organização em que o usuário age; `null` = nega (403). Falha fechada:
 * - `platform_admin` (e `admin` legado): o cabeçalho `X-Org-Id`, se houver; senão `org_ness`.
 *   A existência da organização pedida é conferida por `exigirOrg`, que tem o banco.
 * - equipe: `org_id` da sessão; sessão anterior à 0040 (sem o campo) = `org_ness`, porque toda
 *   conta de equipe existente antes dela é da ness. O cabeçalho é IGNORADO.
 * - cliente (`org_admin`, `org_user`, `client`) e papel desconhecido: `null`, com ou sem `org_id`.
 *   A organização do cliente é a do projeto dele, não `users.org_id`.
 */
export function orgDoUsuario(
  user: { role?: string | null; org_id?: string | null; iat?: number | null } | null | undefined,
  cabecalhoOrg?: string | null,
): string | null {
  const role = user?.role ?? '';
  if (PAPEIS_PLATAFORMA.has(role)) return cabecalhoOrg?.trim() || ORG_NESS;
  if (PAPEIS_EQUIPE.has(role)) {
    if (user?.org_id) return user.org_id;
    // Sem `org_id`: só a sessão LEGADA (emitida antes do deploy) vale como ness. Sessão nova sem o
    // campo é caminho de criação de sessão que o esqueceu: nega, em vez de pôr a conta na ness.
    return (user?.iat ?? 0) >= SESSAO_COM_ORG_DESDE ? null : ORG_NESS;
  }
  return null;
}

/**
 * Desde quando toda sessão nasce com `org_id` (login, SSO, primeiro acesso, troca de senha; o MFA e a
 * renovação copiam a sessão). Sessão de equipe sem o campo emitida a partir daqui é negada.
 */
export const SESSAO_COM_ORG_DESDE = Date.parse('2026-10-03T00:00:00Z');

export const SEM_ORG = { error: 'Organização não identificada' } as const;

/** `orgDoUsuario` da requisição, com o `X-Org-Id` do `platform_admin` conferido no banco; `null` = nega. */
export async function resolverOrg(c: any): Promise<string | null> {
  const cabecalho = c.req.header('X-Org-Id');
  const orgId = orgDoUsuario(c.get('user'), cabecalho);
  if (orgId && cabecalho?.trim() === orgId) {
    const existe = await c.env.DB.prepare('SELECT 1 FROM organizations WHERE id = ?').bind(orgId).first();
    if (!existe) return null;
  }
  return orgId;
}

/**
 * Middleware: resolve a organização da requisição em `c.get('orgId')` ou responde 403. O
 * `X-Org-Id` do `platform_admin` só vale se a organização existe (inexistente → 403, não 400:
 * um caminho só de recusa).
 */
export async function exigirOrg(c: any, next: () => Promise<void>) {
  const orgId = await resolverOrg(c);
  if (!orgId) return c.json(SEM_ORG, 403);
  c.set('orgId', orgId);
  await next();
}

/**
 * Middleware, depois de `exigirOrg`: só a organização da ness. Para o que é global e anterior à
 * multiconsultoria e não tem `org_id` (a tabela `settings` com a precificação antiga da ness.):
 * outra consultoria não lê nem grava o custo interno da ness.
 */
export async function somenteOrgNess(c: any, next: () => Promise<void>) {
  if (c.get('orgId') !== ORG_NESS) return c.json({ error: 'Forbidden: configuração exclusiva da ness.' }, 403);
  await next();
}

/** Conta de EQUIPE (o que o `max_users` do plano limita); conta de cliente não conta. */
export const SQL_EQUIPE = `role IN ('consultor', 'consultant', 'comercial', 'consultoria_admin')`;

/** Plano da ness. (`organizations.plan`): sem limite de projetos nem de usuários. */
export const PLANO_INTERNO = 'interno';

/**
 * A organização já usa tudo o que o plano permite? Conta o que existe (`COUNT(*)` por `org_id`;
 * usuários: só a equipe, `SQL_EQUIPE`).
 * O plano `interno` (a ness., cujos `max_projects`/`max_users` ficaram no default 3/5 da coluna) é
 * ilimitado. Organização inexistente ou limite nulo: atingido (falha fechada).
 */
export async function limiteDoPlanoAtingido(db: D1Database, orgId: string, recurso: 'projetos' | 'usuarios'): Promise<boolean> {
  const contagem = recurso === 'projetos'
    ? 'SELECT COUNT(*) FROM projects WHERE org_id = o.id'
    : `SELECT COUNT(*) FROM users WHERE org_id = o.id AND ${SQL_EQUIPE}`;
  const coluna = recurso === 'projetos' ? 'max_projects' : 'max_users';
  const r = await db.prepare(`SELECT o.plan, o.${coluna} AS max, (${contagem}) AS n
    FROM organizations o WHERE o.id = ?`).bind(orgId).first<{ plan: string | null; max: number | null; n: number }>();
  if (!r) return true;
  if (r.plan === PLANO_INTERNO) return false;
  return r.max == null || r.n >= r.max;
}
export const LIMITE_PROJETOS = { error: 'Limite de projetos do plano atingido' } as const;
export const LIMITE_USUARIOS = { error: 'Limite de usuários do plano atingido' } as const;

/**
 * A equipe (consultor, comercial, consultoria_admin) de organização `Suspended` não autentica nem
 * usa sessão aberta. Uma consulta só quando o usuário é de equipe e NÃO é da ness. (a ness. não é
 * suspensa: `PUT /platform/orgs` recusa); platform_admin e cliente não passam por aqui (o cliente
 * final não é "da consultoria"). Organização inexistente ou com status diferente de `Active`: bloqueia.
 */
export async function equipeDeOrgSuspensa(db: D1Database, user: { role?: string | null; org_id?: string | null } | null | undefined): Promise<boolean> {
  if (!PAPEIS_EQUIPE.has(user?.role ?? '')) return false;
  const org = orgDoUsuario(user);
  if (!org || org === ORG_NESS) return false;
  const r = await db.prepare('SELECT status FROM organizations WHERE id = ?').bind(org).first<{ status: string | null }>();
  return r?.status !== 'Active';
}
export const ORG_SUSPENSA = { error: 'Organização suspensa: o acesso da equipe está bloqueado. Fale com o administrador da plataforma.' } as const;

export type SecaoDesligavel = 'como_trabalhamos' | 'responsabilidades';
type PorFaixa = Record<'1' | '2' | '3', number>;

export interface ConfigPreco {
  diaria: PorFaixa;
  porte: { maxPessoas: number | null; fator: number }[];
  tetoDesconto: number;
  custoInterno: PorFaixa;
  overheadPct: number;
  tributosPct: number;
  margemAlvo: number;
}

export interface TextosOrg {
  sobre: string; comoTrabalhamos: string; equipe: string;
  termos: string; premissas: string; pagamentoPadrao: string;
}

export interface ConfigOrg {
  id: string; nome: string; cnpj: string | null; corDestaque: string; seloNiso: boolean;
  prefixoProposta: string; proximoNumero: number;
  preco: ConfigPreco; textos: TextosOrg; secoesDesligadas: SecaoDesligavel[];
  /** Chave do logo no R2 (`logos/<org>/<sha256>.<ext>`); ausente/nula = sem logo. */
  logoChave?: string | null;
}

const faixa = (m: Record<number, number>): PorFaixa => ({ '1': m[1], '2': m[2], '3': m[3] });

export function precoPadrao(): ConfigPreco {
  const fm = DEFAULT_FINANCIAL_MODEL;
  return {
    diaria: faixa(fm.taxaVendaPD),
    porte: SCOPE_MULTIPLIERS.map((s) => ({ maxPessoas: Number.isFinite(s.maxPessoas) ? s.maxPessoas : null, fator: s.fator })),
    tetoDesconto: 15,
    custoInterno: faixa(fm.custoInternoPD),
    overheadPct: fm.overheadPct,
    tributosPct: Object.values(fm.tributos).reduce((a, v) => a + v, 0),
    margemAlvo: fm.margemAlvo,
  };
}

const TEXTOS_VAZIOS: TextosOrg = { sobre: '', comoTrabalhamos: '', equipe: '', termos: '', premissas: '', pagamentoPadrao: '' };

/** NULL ou vazio = organização nova, vale o padrão. Qualquer outra coisa que não seja o formato esperado falha fechado. */
function json<T>(s: string | null | undefined, vazio: T, orgId: string, coluna: string): T {
  if (!s) return vazio;
  const corrompida = () => new Error(`Configuração da organização ${orgId} corrompida: ${coluna}`);
  let v: unknown;
  try { v = JSON.parse(s); } catch { throw corrompida(); }
  if (Array.isArray(vazio) !== Array.isArray(v) || v === null || typeof v !== 'object') throw corrompida();
  return v as T;
}

/** Mescla campo a campo (um nível de objeto aninhado), como o mergeConfig do pricing. */
export function mesclarPreco(base: ConfigPreco, o: any = {}): ConfigPreco {
  return {
    ...base, ...o,
    diaria: { ...base.diaria, ...(o.diaria ?? {}) },
    custoInterno: { ...base.custoInterno, ...(o.custoInterno ?? {}) },
    porte: o.porte ?? base.porte,
  };
}

export async function lerConfigOrg(db: D1Database, orgId: string): Promise<ConfigOrg> {
  const r = await db.prepare(`SELECT * FROM organizations WHERE id = ?`).bind(orgId).first<any>();
  if (!r) throw new Error(`Organização não configurada: ${orgId}`);
  return {
    id: r.id,
    nome: r.name,
    cnpj: r.cnpj ?? null,
    corDestaque: r.cor_destaque || '#00ade8',
    seloNiso: r.selo_niso !== 0,
    prefixoProposta: r.prefixo_proposta ?? '',
    proximoNumero: r.proximo_numero ?? 1,
    preco: mesclarPreco(precoPadrao(), json(r.config_preco, {}, orgId, 'config_preco')),
    textos: { ...TEXTOS_VAZIOS, ...json<Partial<TextosOrg>>(r.textos, {}, orgId, 'textos') },
    secoesDesligadas: json<SecaoDesligavel[]>(r.secoes_desligadas, [], orgId, 'secoes_desligadas'),
    logoChave: r.logo_chave ?? null,
  };
}

export function formatarNumeroProposta(prefixo: string, ano: number, n: number): string {
  return `${prefixo}-${ano}-${String(n).padStart(3, '0')}`;
}
