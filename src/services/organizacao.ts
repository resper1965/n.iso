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
  user: { role?: string | null; org_id?: string | null } | null | undefined,
  cabecalhoOrg?: string | null,
): string | null {
  const role = user?.role ?? '';
  if (PAPEIS_PLATAFORMA.has(role)) return cabecalhoOrg?.trim() || ORG_NESS;
  if (PAPEIS_EQUIPE.has(role)) return user?.org_id || ORG_NESS;
  return null;
}

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
  };
}

export function formatarNumeroProposta(prefixo: string, ano: number, n: number): string {
  return `${prefixo}-${ano}-${String(n).padStart(3, '0')}`;
}
