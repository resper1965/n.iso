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
 * Tipos suportados: só `dpia` por enquanto. Tipo novo = uma entrada em `DOCUMENTOS` e a ação de
 * assinatura correspondente em `routes/pedidos.ts`.
 */
import { genId, sha256Hex, type PapelAssinatura } from '../helpers';

export type TipoPedido = 'dpia';
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

const DOCUMENTOS: Record<TipoPedido, (db: D1Database, refId: string, projectId: string) => Promise<Documento | null>> = {
  async dpia(db, refId, projectId) {
    const row = await db.prepare(`SELECT ${COLUNAS_DPIA.join(', ')} FROM dpia_assessments WHERE id = ? AND project_id = ?`)
      .bind(refId, projectId).first<Record<string, unknown>>();
    if (!row) return null;
    const conteudo = Object.fromEntries(COLUNAS_DPIA.map((c) => [c, row[c] ?? null]));
    return { titulo: `DPIA: ${String(row.processing_name || row.system_name || refId)}`, conteudo };
  },
};

/** Conteúdo atual do documento (do projeto informado), ou `null` se não existe nele. */
export function documentoAtual(db: D1Database, tipo: TipoPedido, refId: string, projectId: string) {
  return DOCUMENTOS[tipo](db, refId, projectId);
}

export interface PedidoRow {
  id: string; org_id: string; project_id: string; tipo: TipoPedido; ref_id: string; titulo: string;
  papel_exigido: PapelPedido; conteudo_json: string; hash: string; status: string;
  substituido_por: string | null; criado_por: string; criado_em: string;
}

type Destinatario = { email: string; nome?: string | null; user_id?: string | null };

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
      db.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, nome, email, user_id, status) VALUES (?, ?, ?, ?, ?, 'pendente')`)
        .bind(genId(), p.id, d.nome ?? null, d.email.trim().toLowerCase(), d.user_id ?? null)),
  ];
}

/**
 * Cria o pedido congelando o documento. `null` se o documento não existe no projeto. E-mails
 * repetidos (sem caixa) entram uma vez só; o destinatário com conta ativa é ligado pelo `user_id`.
 */
export async function criarPedido(
  db: D1Database,
  a: { orgId: string; projectId: string; tipo: TipoPedido; refId: string; papel: PapelPedido; destinatarios: Destinatario[]; criadoPor: string },
): Promise<{ id: string; hash: string } | null> {
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
  const id = genId();
  const hash = await hashConteudo(doc.conteudo);
  await db.batch(inserirPedido(db, { id, orgId: a.orgId, projectId: a.projectId, tipo: a.tipo, refId: a.refId, papel: a.papel, doc, hash, criadoPor: a.criadoPor }, [...vistos.values()]));
  return { id, hash };
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
 * Assinatura do DPIA por papel — a MESMA usada por `POST /projects/:id/dpia/:assessmentId/approve`.
 * Devolve o UPDATE (para entrar num `batch`), ou `null` se o DPIA não existe no projeto. O DPO assina
 * e o DPIA segue em análise; só com as duas assinaturas ele vira Approved.
 */
export async function assinaturaDpia(db: D1Database, projectId: string, assessmentId: string, role: PapelAssinatura, approvedBy: string): Promise<D1PreparedStatement | null> {
  const atual = await db.prepare('SELECT dpo_signature, ceo_signature FROM dpia_assessments WHERE id = ? AND project_id = ?')
    .bind(assessmentId, projectId).first<{ dpo_signature: string | null; ceo_signature: string | null }>();
  if (!atual) return null;
  const now = new Date().toISOString();
  return role === 'ciso'
    ? db.prepare('UPDATE dpia_assessments SET dpo_signature = ?, dpo_approved_by = ?, dpo_approved_at = ?, status = ? WHERE id = ? AND project_id = ?')
      .bind(approvedBy, approvedBy, now, atual.ceo_signature ? 'Approved' : 'Under Review', assessmentId, projectId)
    : db.prepare('UPDATE dpia_assessments SET ceo_signature = ?, status = ? WHERE id = ? AND project_id = ?')
      .bind(approvedBy, atual.dpo_signature ? 'Approved' : 'Under Review', assessmentId, projectId);
}
