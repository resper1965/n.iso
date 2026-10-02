import { DEFAULT_FINANCIAL_MODEL, SCOPE_MULTIPLIERS } from './pricing';

export const ORG_NESS = 'org_ness';

// ponytail: uma organização só até a fatia 5 (multi-consultoria); aqui entra users.org_id
export function orgDoUsuario(_user: { role?: string } | undefined): string {
  return ORG_NESS;
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

function json<T>(s: string | null | undefined, vazio: T): T {
  if (!s) return vazio;
  try { return JSON.parse(s) as T; } catch { return vazio; }
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
    preco: mesclarPreco(precoPadrao(), json(r.config_preco, {})),
    textos: { ...TEXTOS_VAZIOS, ...json<Partial<TextosOrg>>(r.textos, {}) },
    secoesDesligadas: json<SecaoDesligavel[]>(r.secoes_desligadas, []),
  };
}

export function formatarNumeroProposta(prefixo: string, ano: number, n: number): string {
  return `${prefixo}-${ano}-${String(n).padStart(3, '0')}`;
}
