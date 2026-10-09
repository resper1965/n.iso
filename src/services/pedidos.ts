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
 * Tipos: `dpia` e `politica` (texto da política no controle, `compliance_controls`); ambos assinam
 * (`assinaturaDpia`, `assinaturaPolitica`). Tipo novo =
 * uma entrada em `DOCUMENTOS`, o CHECK da tabela (migration) e, se assina, a ação em
 * `routes/pedidos.ts`.
 */
import {
  genId, genToken, sha256Hex, requireProjectAccess, ehConsultor, autoridadeDeAssinatura, recusaDeAssinatura,
  RECUSA_PLATAFORMA, type PapelAssinatura,
} from '../helpers';

export type TipoPedido = 'dpia' | 'politica' | 'documento';
export type Canal = 'conta' | 'link' | 'portal';
/** Validade do link pessoal da ciência; reenviar emite outro. */
export const DIAS_LINK = 30;
export type PapelPedido = 'ciso' | 'ceo' | 'ciente';

/** Papéis que pedem (parte 4 do desenho). `platform_admin` não: opera a plataforma, não o cliente. */
const PAPEIS_QUE_PEDEM = new Set(['org_admin', 'consultor', 'consultant', 'consultoria_admin']);

/**
 * Quem PEDE aprovação ou ciência neste projeto: o `org_admin` do projeto, o consultor designado nele
 * e o `consultoria_admin` da organização dele. Stakeholder, `org_user`, comercial e `platform_admin`
 * nunca. O alcance do projeto é o de `requireProjectAccess` (designação na matriz, organização,
 * `client_project_id`), a mesma regra do `projectAccessMiddleware`, aqui de novo para a regra não
 * depender de onde o router foi montado. Devolve o motivo da recusa, ou `null` se pode.
 */
export async function podePedir(db: D1Database, user: { role?: string; email?: string; client_project_id?: string | null; org_id?: string | null }, projectId: string): Promise<string | null> {
  if (!PAPEIS_QUE_PEDEM.has(user?.role ?? '')) {
    return 'Só o administrador da empresa no projeto, o consultor designado no projeto ou o administrador da consultoria pedem aprovação ou ciência.';
  }
  const alcanca = await requireProjectAccess(db, user as any, projectId).then(() => true, () => false);
  if (alcanca) return null;
  return ehConsultor(user)
    ? 'Você não está designado como consultor neste projeto (matriz de Governança).'
    : 'Você não tem acesso a este projeto.';
}

/**
 * Autoridade do destinatário sobre o pedido, pelo papel exigido. `ciente`: basta ser destinatário
 * (o chamador já conferiu), mas conta que administra a plataforma não dá ciência por cliente.
 * `ciso`/`ceo`: a regra das assinaturas (`recusaDeAssinatura`), falha fechado sem linha na matriz.
 * `nome`: como consta na matriz, para o carimbo; `null` se não consta.
 */
export async function autoridadeNoPedido(
  db: D1Database, pedido: Pick<PedidoRow, 'project_id' | 'papel_exigido'>, user: { email?: string; role?: string },
): Promise<{ recusa: string | null; nome: string | null }> {
  const a = await autoridadeDeAssinatura(db, pedido.project_id, user);
  if (pedido.papel_exigido === 'ciente') return { recusa: a.papelDePlataforma ? RECUSA_PLATAFORMA : null, nome: a.nome };
  return { recusa: recusaDeAssinatura(a, pedido.papel_exigido), nome: a.nome };
}

/**
 * Pedido de aprovação (`ciso`/`ceo`) só vai a quem teria a autoridade do papel na matriz do projeto
 * (a regra das assinaturas, aplicada ao e-mail do destinatário). Devolve a recusa, ou `null`.
 * Ciência não passa por aqui. A conta de plataforma não é checada: ela é recusada na decisão.
 */
export async function recusaDeDestinatarios(
  db: D1Database, projectId: string, papel: PapelPedido, destinatarios: { email: string }[],
): Promise<string | null> {
  if (papel === 'ciente') return null;
  const quem = papel === 'ceo' ? 'Direção (CEO)' : 'Líder SGSI';
  const sem: string[] = [];
  for (const email of new Set(destinatarios.map((d) => d.email.trim().toLowerCase()))) {
    if (recusaDeAssinatura(await autoridadeDeAssinatura(db, projectId, { email }), papel)) sem.push(email);
  }
  return sem.length ? sem.map((e) => `${e} não tem autoridade de ${quem} neste projeto`).join('; ') : null;
}

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
  // ref_id = documentos.id; o conteúdo é a versão VIGENTE (titulo, texto, numero). O "nome da tabela" é um subselect:
  // publicar versão nova muda o hash e a máquina de substituição funciona sem mudar. `FROM ${tabela} d` e `FROM ${tabela}` valem.
  documento: {
    tabela: "(SELECT d.id AS id, d.project_id AS project_id, d.titulo AS titulo, v.texto AS texto, v.numero AS numero FROM documentos d JOIN documento_versoes v ON v.documento_id = d.id AND v.estado = 'vigente')",
    colunas: ['titulo', 'texto', 'numero'],
    titulo: (r, id) => `Documento: ${String(r.titulo || id)}`,
  },
};

/** Conteúdo atual do documento (do projeto informado), ou `null` se não existe nele. */
export async function documentoAtual(db: D1Database, tipo: TipoPedido, refId: string, projectId: string): Promise<Documento | null> {
  const d = DOCUMENTOS[tipo];
  const row = await db.prepare(`SELECT ${d.colunas.join(', ')} FROM ${d.tabela} WHERE id = ? AND project_id = ?`)
    .bind(refId, projectId).first<Record<string, unknown>>();
  if (!row) return null;
  return { titulo: d.titulo(row, refId), conteudo: Object.fromEntries(d.colunas.map((c) => [c, row[c] ?? null])) };
}

/** Texto-padrão que o catálogo grava quando a política ainda não foi escrita. */
const DESCRICAO_PADRAO = 'Universal ISMS requirement.';

/** Política sem texto (nula, em branco ou o padrão do catálogo): não há o que aprovar nem o que ler. */
export async function politicaVazia(db: D1Database, refId: string, projectId: string): Promise<boolean> {
  const doc = await documentoAtual(db, 'politica', refId, projectId);
  if (!doc) return false; // inexistente é 404 de quem chama, não "vazia"
  const d = doc.conteudo.description;
  const t = typeof d === 'string' ? d.trim() : '';
  return !t || t === DESCRICAO_PADRAO;
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
  p: { id: string; projectId: string; tipo: TipoPedido; refId: string; papel: PapelPedido; doc: Documento; hash: string; criadoPor: string },
  destinatarios: Destinatario[],
): D1PreparedStatement[] {
  return [
    // `org_id` sai do projeto na hora de gravar: substituto de pedido lido antes de uma transferência
    // de projeto não herda a organização antiga.
    db.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, criado_por)
      VALUES (?, (SELECT org_id FROM projects WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, 'aberto', ?)`)
      .bind(p.id, p.projectId, p.projectId, p.tipo, p.refId, p.doc.titulo, p.papel, JSON.stringify(p.doc.conteudo), p.hash, p.criadoPor),
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
  a: { projectId: string; tipo: TipoPedido; refId: string; papel: PapelPedido; destinatarios: Destinatario[]; criadoPor: string; comLink?: boolean },
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
  await db.batch(inserirPedido(db, { id, projectId: a.projectId, tipo: a.tipo, refId: a.refId, papel: a.papel, doc, hash, criadoPor: a.criadoPor }, [...vistos.values()]));
  return { id, hash, links };
}

/** `criado`: foi ESTA chamada que substituiu (o chamador avisa os destinatários uma vez só). */
export type Vigencia = { vigente: true } | { vigente: false; status: 'substituido' | 'cancelado' | string; substituido_por?: string | null; criado?: boolean };

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
  // Quem leu pelo portal público (canal `portal`) não vai para o pedido novo: revê a versão nova quando voltar ao portal.
  const { results: dests } = await db.prepare("SELECT email, nome, user_id FROM pedido_destinatarios WHERE pedido_id = ? AND COALESCE(canal, '') <> 'portal'").bind(p.id).all<Destinatario>();
  await db.batch(inserirPedido(db, {
    id: novoId, projectId: p.project_id, tipo: p.tipo, refId: p.ref_id, papel: p.papel_exigido, doc, hash, criadoPor: p.criado_por,
  }, dests));
  return { vigente: false, status: 'substituido', substituido_por: novoId, criado: true };
}

/**
 * Confere todos os pedidos abertos de um documento (chamado depois de o documento ser gravado).
 * `refIds`: mais de um quando a escrita casa `(id = normId OR id = controlId)`; o hash decide, então
 * id que não mudou não substitui nada. Devolve cada pedido conferido com o resultado, para o
 * chamador avisar os destinatários (`avisarSubstituicao` em `routes/pedidos.ts`).
 */
export async function substituirPedidosDoDocumento(
  db: D1Database, tipo: TipoPedido, refIds: string | string[], projectId?: string,
): Promise<{ antigo: PedidoRow; vig: Vigencia }[]> {
  const ids = [...new Set(Array.isArray(refIds) ? refIds : [refIds])].filter(Boolean);
  if (!ids.length) return [];
  const { results } = await db.prepare(`SELECT * FROM pedidos WHERE tipo = ? AND status = 'aberto' AND ref_id IN (${ids.map(() => '?').join(', ')})
      ${projectId ? 'AND project_id = ?' : ''}`)
    .bind(tipo, ...ids, ...(projectId ? [projectId] : [])).all<PedidoRow>();
  const out: { antigo: PedidoRow; vig: Vigencia }[] = [];
  for (const p of results) out.push({ antigo: p, vig: await conferirVigencia(db, p) });
  return out;
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

// SET literal por papel: a catraca de colunas (test/colunas-catraca.test.ts) não enxerga nome de
// coluna montado por interpolação. Mesmo formato de COLUNAS_REVOGACAO (routes/controls.ts).
const SET_ASSINATURA_POLITICA: Record<PapelAssinatura, string> = {
  ciso: 'ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?',
  ceo: 'ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ?',
};

/**
 * Assinatura da política (o texto vive em `compliance_controls.description`) por papel. É a MESMA
 * usada por `POST /api/v1/controls/:id/approve` e pelo pedido de aprovação de política. Devolve o
 * UPDATE (para `run()` ou `batch`), ou `null` se o controle não existe no projeto. Não toca `status`:
 * ele é o da SoA. Com `guarda`, só pega se a prova do destinatário foi gravada no mesmo `batch` e o
 * título/texto são os congelados no pedido.
 */
export async function assinaturaPolitica(
  db: D1Database, projectId: string, controlId: string, role: PapelAssinatura,
  carimbo: { por: string; em: string; ip: string | null; ua: string | null }, guarda?: GuardaAssinatura,
): Promise<D1PreparedStatement | null> {
  const existe = await db.prepare('SELECT 1 FROM compliance_controls WHERE id = ? AND project_id = ?').bind(controlId, projectId).first();
  if (!existe) return null;
  let onde = 'id = ? AND project_id = ?';
  const bindsOnde: unknown[] = [controlId, projectId];
  if (guarda) {
    const ok = intacto('politica', '', guarda.conteudoJson);
    onde += ` AND EXISTS (SELECT 1 FROM pedido_destinatarios WHERE id = ? AND status = ? AND decidido_em = ?) AND ${ok.sql}`;
    bindsOnde.push(guarda.destId, guarda.status, guarda.decididoEm, ...ok.binds);
  }
  return db.prepare(`UPDATE compliance_controls SET ${SET_ASSINATURA_POLITICA[role]}, updated_at = CURRENT_TIMESTAMP WHERE ${onde}`)
    .bind(carimbo.por, carimbo.em, carimbo.ip, carimbo.ua, ...bindsOnde);
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
  // Documento: a prova da aprovação é a linha do destinatário (hash, IP, user-agent, MFA); não há coluna de assinatura a escrever.
  // Sem esta condição, cairia em `assinaturaDpia` e assinaria um DPIA de mesmo id.
  if (a.assinar && p.tipo !== 'documento') {
    const guarda = { destId: a.destId, status: a.status, decididoEm, conteudoJson: p.conteudo_json };
    // Cada tipo assina pela MESMA função da aprovação direta: DPIA (platform.ts) e política (controls.ts).
    const st = p.tipo === 'politica'
      ? await assinaturaPolitica(db, p.project_id, p.ref_id, a.assinar.papel, { por: a.nome, em: decididoEm, ip: a.ip, ua: a.ua }, guarda)
      : await assinaturaDpia(db, p.project_id, p.ref_id, a.assinar.papel, a.nome, guarda);
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

/** `criado_por` do pedido "em pé" que guarda a ciência de quem entra pelo portal público (índice único parcial na 0051). */
export const CONTEINER_PORTAL = 'sistema:portal';

export type CienciaPortal =
  | { ok: true; numero: number; hash: string; decididoEm: string; jaExistia: boolean }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Ciência de uma pessoa que entrou no portal público com código por e-mail (sem pedido prévio). A prova é a de
 * sempre: uma linha de `pedido_destinatarios` JÁ DECIDIDA (`ciente`, canal `portal`, `hash_lido`, IP, user-agent)
 * num pedido de ciência "em pé" do documento, achado ou criado na hora. É sempre a versão VIGENTE no momento do
 * registro, e `numero` volta para a tela dizer qual foi. O mesmo e-mail na mesma versão não duplica.
 */
export async function registrarCienciaPortal(
  db: D1Database, a: { projectId: string; documentoId: string; nome: string; email: string; ip: string | null; ua: string | null },
): Promise<CienciaPortal> {
  const doc = await documentoAtual(db, 'documento', a.documentoId, a.projectId);
  if (!doc) return { ok: false, status: 404, error: 'Documento não encontrado ou sem versão vigente' };
  const numero = Number(doc.conteudo.numero);
  const email = a.email.trim().toLowerCase();

  const achar = () => db.prepare(
    `SELECT * FROM pedidos WHERE project_id = ? AND tipo = 'documento' AND ref_id = ? AND papel_exigido = 'ciente' AND criado_por = ? AND status = 'aberto'
      ORDER BY criado_em DESC, rowid DESC LIMIT 1`
  ).bind(a.projectId, a.documentoId, CONTEINER_PORTAL).first<PedidoRow>();

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let pedido = await achar();
    if (pedido) {
      // O contêiner pode ter ficado para trás de uma versão publicada: confere, e usa o substituto.
      const vig = await conferirVigencia(db, pedido);
      if (!vig.vigente) pedido = vig.substituido_por ? await db.prepare('SELECT * FROM pedidos WHERE id = ?').bind(vig.substituido_por).first<PedidoRow>() : null;
    }
    if (pedido) {
      const ja = await db.prepare(`SELECT decidido_em FROM pedido_destinatarios WHERE pedido_id = ? AND lower(email) = ? AND status = 'ciente'`)
        .bind(pedido.id, email).first<{ decidido_em: string }>();
      if (ja) return { ok: true, numero, hash: pedido.hash, decididoEm: ja.decidido_em, jaExistia: true };
    }

    const hash = await hashConteudo(doc.conteudo);
    const decididoEm = new Date().toISOString();
    const u = await db.prepare(`SELECT id FROM users WHERE lower(email) = ? AND COALESCE(ativo, 1) <> 0`).bind(email).first<{ id: string }>();
    const pedidoId = pedido?.id ?? genId();
    // A condição vai no próprio INSERT: só grava se o pedido segue aberto e com o hash que acabamos de ler.
    const inserirDestinatario = db.prepare(
      `INSERT INTO pedido_destinatarios (id, pedido_id, nome, email, user_id, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado)
       SELECT ?, ?, ?, ?, ?, ?, 'ciente', ?, 'portal', ?, ?, ?, 0
        WHERE EXISTS (SELECT 1 FROM pedidos WHERE id = ? AND status = 'aberto' AND hash = ?)`
    ).bind(genId(), pedidoId, a.nome, email, u?.id ?? null, decididoEm, decididoEm, a.ip, a.ua, hash, pedidoId, hash);
    try {
      const res = pedido
        ? [await inserirDestinatario.run()]
        : await db.batch([
            ...inserirPedido(db, { id: pedidoId, projectId: a.projectId, tipo: 'documento', refId: a.documentoId, papel: 'ciente', doc, hash, criadoPor: CONTEINER_PORTAL }, []),
            inserirDestinatario,
          ]);
      if (res[res.length - 1].meta?.changes) return { ok: true, numero, hash, decididoEm, jaExistia: false };
      // O pedido deixou de estar aberto/igual entre a leitura e a gravação (versão publicada agora): lê de novo.
    } catch (e) {
      // Dois acessos criando o contêiner ao mesmo tempo: o índice único barrou o segundo; lê de novo e usa o do primeiro.
      if (!String((e as { message?: string })?.message ?? e).includes('UNIQUE')) throw e;
    }
  }
  return { ok: false, status: 409, error: 'O documento mudou durante o registro; recarregue e tente de novo' };
}
