/**
 * Pedidos de aprovação/ciência (acesso de stakeholders, fatia 2).
 *
 * Um pedido CONGELA o conteúdo do documento no momento em que é criado e guarda o SHA-256 dele. A
 * prova de cada destinatário grava esse hash (`hash_lido`): é a versão que a pessoa leu e aprovou.
 * Se o documento muda depois, o pedido vira `substituido` e um novo nasce para os mesmos
 * destinatários — nunca se aprova texto diferente do lido. A checagem é feita na escrita do
 * documento (PUT do DPIA) E de novo na hora de decidir, porque o documento pode mudar por outro
 * caminho (agente, ferramenta genérica, banco).
 *
 * Tipos: `dpia` e `politica` (texto da política no controle, `compliance_controls`). Tipo novo =
 * uma entrada em `DOCUMENTOS`, o CHECK da tabela (migration) e, se assina, a ação em
 * `routes/pedidos.ts`.
 */
import { genId, genToken, sha256Hex, type PapelAssinatura } from '../helpers';

export type TipoPedido = 'dpia' | 'politica';
export type Canal = 'conta' | 'link';
/** Validade do link pessoal da ciência; reenviar emite outro. */
export const DIAS_LINK = 30;
export type PapelPedido = 'ciso' | 'ceo' | 'ciente';

/** JSON com chaves ordenadas, em qualquer profundidade: a mesma informação dá sempre o mesmo texto. */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonico((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** SHA-256 (hex) do conteúdo em forma canônica. Estável: a ordem das chaves não muda o hash. */
export async function hashConteudo(conteudo: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(canonico(conteudo)));
}

/**
 * Colunas de CONTEÚDO do DPIA. Assinaturas, status e datas ficam de fora de propósito: a assinatura
 * do DPO mudaria o hash e substituiria o pedido da Direção, que é sobre o mesmo texto.
 */
const COLUNAS_DPIA = [
  'processing_name', 'ropa_id', 'system_name', 'data_flow_description', 'data_subjects_types',
  'personal_data_categories', 'data_category_risk', 'necessity_proportionality', 'risks_identified',
  'mitigation_measures', 'technical_measures', 'residual_risk_level', 'dpo_recommendations', 'dpo_opinion',
] as const;

type Documento = { titulo: string; conteudo: Record<string, unknown> };

/** Onde mora cada tipo e quais colunas são CONTEÚDO (entram no hash e na conferência do batch). */
const DOCUMENTOS: Record<TipoPedido, { tabela: string; colunas: readonly string[]; titulo: (r: Record<string, unknown>, refId: string) => string }> = {
  dpia: { tabela: 'dpia_assessments', colunas: COLUNAS_DPIA, titulo: (r, id) => `DPIA: ${String(r.processing_name || r.system_name || id)}` },
  politica: { tabela: 'compliance_controls', colunas: ['title', 'description'], titulo: (r, id) => `Política: ${String(r.title || id)}` },
};

/** Conteúdo atual do documento (do projeto informado), ou `null` se não existe nele. */
export async function documentoAtual(db: D1Database, tipo: TipoPedido, refId: string, projectId: string): Promise<Documento | null> {
  const d = DOCUMENTOS[tipo];
  const row = await db.prepare(`SELECT ${d.colunas.join(', ')} FROM ${d.tabela} WHERE id = ? AND project_id = ?`)
    .bind(refId, projectId).first<Record<string, unknown>>();
  if (!row) return null;
  return { titulo: d.titulo(row, refId), conteudo: Object.fromEntries(d.colunas.map((c) => [c, row[c] ?? null])) };
}

export interface PedidoRow {
  id: string; org_id: string; project_id: string; tipo: TipoPedido; ref_id: string; titulo: string;
  papel_exigido: PapelPedido; conteudo_json: string; hash: string; status: string;
  substituido_por: string | null; criado_por: string; criado_em: string;
}

type Destinatario = { email: string; nome?: string | null; user_id?: string | null; token_hash?: string | null };

/** Statements que criam o pedido e os destinatários (para o chamador pôr num `batch`). */
function inserirPedido(
  db: D1Database,
  p: { id: string; orgId: string; projectId: string; tipo: TipoPedido; refId: string; papel: PapelPedido; doc: Documento; hash: string; criadoPor: string },
  destinatarios: Destinatario[],
): D1PreparedStatement[] {
  return [
    db.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?)`)
      .bind(p.id, p.orgId, p.projectId, p.tipo, p.refId, p.doc.titulo, p.papel, JSON.stringify(p.doc.conteudo), p.hash, p.criadoPor),
    ...destinatarios.map((d) =>
      db.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, nome, email, user_id, token_hash, token_expira_em, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, CASE WHEN ?6 IS NULL THEN NULL ELSE datetime('now', '+${DIAS_LINK} days') END, 'pendente')`)
        .bind(genId(), p.id, d.nome ?? null, d.email.trim().toLowerCase(), d.user_id ?? null, d.token_hash ?? null)),
  ];
}

/**
 * Cria o pedido congelando o documento. `null` se o documento não existe no projeto. E-mails
 * repetidos (sem caixa) entram uma vez só; o destinatário com conta ativa é ligado pelo `user_id`.
 * `comLink`: cada destinatário ganha um token CSPRNG (só o SHA-256 vai ao banco); os tokens em
 * claro voltam UMA vez, para o e-mail, e não devem ir a resposta, trilha nem log.
 */
export async function criarPedido(
  db: D1Database,
  a: { orgId: string; projectId: string; tipo: TipoPedido; refId: string; papel: PapelPedido; destinatarios: Destinatario[]; criadoPor: string; comLink?: boolean },
): Promise<{ id: string; hash: string; links: { email: string; nome: string | null; token: string }[] } | null> {
  const doc = await documentoAtual(db, a.tipo, a.refId, a.projectId);
  if (!doc) return null;
  const vistos = new Map<string, Destinatario>();
  for (const d of a.destinatarios) {
    const email = d.email.trim().toLowerCase();
    if (!vistos.has(email)) vistos.set(email, { ...d, email });
  }
  for (const d of vistos.values()) {
    const u = await db.prepare(`SELECT id, name FROM users WHERE lower(email) = ? AND COALESCE(ativo, 1) <> 0`).bind(d.email).first<{ id: string; name: string | null }>();
    d.user_id = u?.id ?? null;
    d.nome = d.nome || u?.name || null;
  }
  const links: { email: string; nome: string | null; token: string }[] = [];
  if (a.comLink) {
    for (const d of vistos.values()) {
      const token = genToken();
      d.token_hash = await sha256Hex(token);
      links.push({ email: d.email, nome: d.nome ?? null, token });
    }
  }
  const id = genId();
  const hash = await hashConteudo(doc.conteudo);
  await db.batch(inserirPedido(db, { id, orgId: a.orgId, projectId: a.projectId, tipo: a.tipo, refId: a.refId, papel: a.papel, doc, hash, criadoPor: a.criadoPor }, [...vistos.values()]));
  return { id, hash, links };
}

export type Vigencia = { vigente: true } | { vigente: false; status: 'substituido' | 'cancelado' | string; substituido_por?: string | null };

/**
 * O pedido ainda fala do documento como ele está? Só pedido `aberto` é conferido. Documento
 * alterado: o pedido vira `substituido` e nasce outro, com o conteúdo novo, para os mesmos
 * destinatários (todos pendentes). Documento apagado: `cancelado`.
 */
export async function conferirVigencia(db: D1Database, p: PedidoRow): Promise<Vigencia> {
  if (p.status !== 'aberto') return { vigente: false, status: p.status, substituido_por: p.substituido_por };
  const doc = await documentoAtual(db, p.tipo, p.ref_id, p.project_id);
  if (!doc) {
    await db.prepare(`UPDATE pedidos SET status = 'cancelado' WHERE id = ? AND status = 'aberto'`).bind(p.id).run();
    return { vigente: false, status: 'cancelado' };
  }
  const hash = await hashConteudo(doc.conteudo);
  if (hash === p.hash) return { vigente: true };

  // Marca o antigo PRIMEIRO, com guarda: se outra requisição já o substituiu, devolve o novo dela.
  const novoId = genId();
  const marcou = await db.prepare(`UPDATE pedidos SET status = 'substituido', substituido_por = ? WHERE id = ? AND status = 'aberto'`)
    .bind(novoId, p.id).run();
  if (!marcou.meta?.changes) {
    const atual = await db.prepare('SELECT status, substituido_por FROM pedidos WHERE id = ?').bind(p.id).first<{ status: string; substituido_por: string | null }>();
    return { vigente: false, status: atual?.status ?? 'substituido', substituido_por: atual?.substituido_por ?? null };
  }
  const { results: dests } = await db.prepare('SELECT email, nome, user_id FROM pedido_destinatarios WHERE pedido_id = ?').bind(p.id).all<Destinatario>();
  await db.batch(inserirPedido(db, {
    id: novoId, orgId: p.org_id, projectId: p.project_id, tipo: p.tipo, refId: p.ref_id, papel: p.papel_exigido, doc, hash, criadoPor: p.criado_por,
  }, dests));
  return { vigente: false, status: 'substituido', substituido_por: novoId };
}

/** Confere todos os pedidos abertos de um documento (chamado depois de o documento ser gravado). */
export async function substituirPedidosDoDocumento(db: D1Database, tipo: TipoPedido, refId: string): Promise<void> {
  const { results } = await db.prepare(`SELECT * FROM pedidos WHERE tipo = ? AND ref_id = ? AND status = 'aberto'`).bind(tipo, refId).all<PedidoRow>();
  for (const p of results) await conferirVigencia(db, p);
}

/**
 * O documento ainda tem, coluna a coluna, o conteúdo congelado no pedido? Fragmento SQL sobre as
 * colunas da linha do documento em escopo (`prefixo` = alias ou vazio), com um `?` por coluna, todos
 * ligados ao `conteudo_json` do pedido (`binds`). É a conferência do hash feita DENTRO do `batch`:
 * fecha a janela entre conferir em JS e gravar.
 */
function intacto(tipo: TipoPedido, prefixo: string, conteudoJson: string): { sql: string; binds: string[] } {
  const { colunas } = DOCUMENTOS[tipo];
  return {
    sql: colunas.map((c) => `${prefixo}${c} IS json_extract(?, '$.${c}')`).join(' AND '),
    binds: colunas.map(() => conteudoJson),
  };
}

/** Guarda da assinatura feita por pedido: só assina se a decisão acabou de ser gravada e o texto é o lido. */
export type GuardaAssinatura = { destId: string; status: string; decididoEm: string; conteudoJson: string };

/**
 * Assinatura do DPIA por papel — a MESMA usada por `POST /projects/:id/dpia/:assessmentId/approve`.
 * Devolve o UPDATE (para entrar num `batch`), ou `null` se o DPIA não existe no projeto. O DPO assina
 * e o DPIA segue em análise; só com as duas assinaturas ele vira Approved (decidido no próprio UPDATE,
 * sem ler antes). Com `guarda`, o UPDATE só pega se a prova do destinatário foi gravada neste mesmo
 * `batch` (status e `decidido_em` exatos) e o conteúdo é o congelado.
 */
export async function assinaturaDpia(db: D1Database, projectId: string, assessmentId: string, role: PapelAssinatura, approvedBy: string, guarda?: GuardaAssinatura): Promise<D1PreparedStatement | null> {
  const existe = await db.prepare('SELECT 1 FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(assessmentId, projectId).first();
  if (!existe) return null;
  const now = new Date().toISOString();
  const set = role === 'ciso'
    ? { sql: `dpo_signature = ?, dpo_approved_by = ?, dpo_approved_at = ?, status = CASE WHEN ceo_signature IS NOT NULL THEN 'Approved' ELSE 'Under Review' END`, binds: [approvedBy, approvedBy, now] }
    : { sql: `ceo_signature = ?, status = CASE WHEN dpo_signature IS NOT NULL THEN 'Approved' ELSE 'Under Review' END`, binds: [approvedBy] };
  let onde = 'id = ? AND project_id = ?';
  const bindsOnde: unknown[] = [assessmentId, projectId];
  if (guarda) {
    const ok = intacto('dpia', '', guarda.conteudoJson);
    onde += ` AND EXISTS (SELECT 1 FROM pedido_destinatarios WHERE id = ? AND status = ? AND decidido_em = ?) AND ${ok.sql}`;
    bindsOnde.push(guarda.destId, guarda.status, guarda.decididoEm, ...ok.binds);
  }
  return db.prepare(`UPDATE dpia_assessments SET ${set.sql} WHERE ${onde}`).bind(...set.binds, ...bindsOnde);
}

/**
 * Grava a decisão do destinatário, a assinatura (se houver) e o novo status do pedido num `batch`
 * só, com toda condição conferida no SQL: o destinatário ainda pendente, o pedido ainda `aberto` com
 * o mesmo hash, e o documento com o conteúdo congelado. Devolve se a decisão pegou; se não pegou,
 * nada foi gravado (a assinatura depende da linha do destinatário que acabou de mudar).
 * Canal `link`: também o mesmo token e ainda no prazo (reenvio no meio troca o token: nada grava).
 */
export async function registrarDecisao(db: D1Database, a: {
  pedido: PedidoRow; destId: string; status: 'aprovado' | 'ciente' | 'recusado'; ip: string | null; ua: string | null;
  mfa: boolean; nome: string; motivo: string | null; assinar?: { papel: PapelAssinatura };
  canal?: Canal; tokenHash?: string;
}): Promise<boolean> {
  const { pedido: p } = a;
  const decididoEm = new Date().toISOString();
  const ok = intacto(p.tipo, 'd.', p.conteudo_json);
  const link = a.canal === 'link';
  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE pedido_destinatarios SET status = ?, decidido_em = ?, canal = ?, ip = ?, user_agent = ?, hash_lido = ?,
        mfa_usado = ?, nome = ?, motivo = ?
      WHERE id = ? AND status = 'pendente'
        ${link ? `AND token_hash = ? AND token_expira_em > datetime('now')` : ''}
        AND EXISTS (SELECT 1 FROM pedidos WHERE id = ? AND status = 'aberto' AND hash = ?)
        AND EXISTS (SELECT 1 FROM ${DOCUMENTOS[p.tipo].tabela} d WHERE d.id = ? AND d.project_id = ? AND ${ok.sql})`)
      .bind(a.status, decididoEm, link ? 'link' : 'conta', a.ip, a.ua, p.hash, a.mfa ? 1 : 0, a.nome, a.motivo, a.destId,
        ...(link ? [a.tokenHash ?? ''] : []), p.id, p.hash, p.ref_id, p.project_id, ...ok.binds),
  ];
  if (a.assinar) {
    const st = await assinaturaDpia(db, p.project_id, p.ref_id, a.assinar.papel, a.nome,
      { destId: a.destId, status: a.status, decididoEm, conteudoJson: p.conteudo_json });
    if (!st) return false;
    stmts.push(st);
  }
  // Recusa de um fecha o pedido; aprovado quando ninguém mais está pendente.
  stmts.push(db.prepare(`UPDATE pedidos SET status = CASE
      WHEN EXISTS (SELECT 1 FROM pedido_destinatarios WHERE pedido_id = ?1 AND status = 'recusado') THEN 'recusado'
      WHEN NOT EXISTS (SELECT 1 FROM pedido_destinatarios WHERE pedido_id = ?1 AND status = 'pendente') THEN 'aprovado'
      ELSE status END
    WHERE id = ?1 AND status = 'aberto'`).bind(p.id));
  const res = await db.batch(stmts);
  return !!res[0].meta?.changes;
}
