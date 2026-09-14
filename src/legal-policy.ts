// Aceite de documento legal versionado — FUNÇÃO PURA, sem D1 nem rede.
//
// A regra do pacote de design: versão nova de documento legal apenas AVISA
// quando a mudança é comum, e BARRA o acesso até o aceite quando altera base
// legal ou retenção. O que decide é a `classification` gravada no documento —
// campo do documento, não julgamento de quem publica. Se fosse decisão de quem
// sobe a versão, a mesma mudança bloquearia ou não conforme a pressa do dia.

export type ClassificacaoLegal = 'comum' | 'material';

export interface DocumentoLegal {
  id: string;
  kind: string;              // 'terms' | 'privacy' | outro
  version: string;
  classification: ClassificacaoLegal;
  title: string;
  url?: string | null;
  /** Só documento publicado é exigível; rascunho tem published_at nulo. */
  publishedAt?: string | null;
}

export interface SituacaoLegal {
  /** Documentos publicados que este usuário ainda não aceitou. */
  pendentes: DocumentoLegal[];
  /** Há pendência material: o acesso fica barrado até o aceite. */
  bloqueia: boolean;
  /** Há pendência, mas só comum: faixa de aviso, acesso liberado. */
  avisa: boolean;
}

/** Versão exigível de cada tipo: a publicada mais recente. */
export function versoesVigentes(documentos: DocumentoLegal[]): DocumentoLegal[] {
  const porTipo = new Map<string, DocumentoLegal>();
  for (const doc of documentos) {
    if (!doc.publishedAt) continue;
    const atual = porTipo.get(doc.kind);
    // Empate de data resolve pelo que veio depois na lista (ordem do SELECT).
    if (!atual || String(doc.publishedAt) >= String(atual.publishedAt)) {
      porTipo.set(doc.kind, doc);
    }
  }
  return [...porTipo.values()];
}

/**
 * O que falta a este usuário, e se isso barra o acesso.
 *
 * `aceitos` são ids de documento — aceitar a v2.3 não vale pela v2.4, que é
 * outro documento. É esse o ponto de versionar: o aceite se refere a um texto
 * específico, não ao nome do documento.
 */
export function situacaoLegal(documentos: DocumentoLegal[], aceitos: Iterable<string>): SituacaoLegal {
  const jaAceitos = new Set(aceitos);
  const pendentes = versoesVigentes(documentos).filter(d => !jaAceitos.has(d.id));
  const bloqueia = pendentes.some(d => d.classification === 'material');
  return { pendentes, bloqueia, avisa: pendentes.length > 0 && !bloqueia };
}

// Rotas que uma sessão barrada AINDA alcança: as que ela precisa para sair do
// bloqueio (ver e aceitar) ou para ir embora. Lista fechada, não prefixo — um
// prefixo como '/api/v1/legal' já bastaria, mas /logout e /me não moram lá e
// sem eles o usuário barrado não conseguiria nem encerrar a sessão.
const PERMITIDO_COM_BLOQUEIO = new Set([
  '/api/v1/legal/pending',
  '/api/v1/legal/accept',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
]);

export function rotaLiberadaComBloqueio(path: string): boolean {
  return PERMITIDO_COM_BLOQUEIO.has(path.replace(/\/+$/, ''));
}
