// Rotas públicas do cliente (spec do sistema de propostas, seção 6.2; plano da fatia 4, Tarefa 4).
// Sem sessão, na internet: a única credencial é o token do link, que chega no CORPO (nunca no
// caminho nem na query, que vão para o log de requisição) e é procurado pelo SHA-256 em
// propostas.token_hash. O token nunca vai para trilha, notificação, log nem resposta.
//
// O que o cliente recebe é só o documento congelado e metadados públicos (número, revisão,
// validade, estado). Token desconhecido, revogado, rotacionado, vencido ou de proposta que não
// aceita a ação: o MESMO 404, sem dizer qual. Montado antes do authMiddleware (index.ts).
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings } from '../index';
import { genId, sha256Hex, rateLimitD1, erro500 } from '../helpers';
import { validateBody, propostaTokenSchema, propostaAceiteLinkSchema, propostaRecusaSchema, propostaAjusteSchema } from '../schemas';
import { fecharVenda, ATOR_LINK } from '../services/fechar-venda';
import { diaEmBrasilia } from './propostas';

export const publicPropostasApp = new Hono<{ Bindings: Bindings }>();
type Ctx = Context<{ Bindings: Bindings }>;

const INVALIDO = { error: 'Link inválido ou expirado' };
const MUITAS = { error: 'Muitas tentativas. Tente novamente mais tarde.' };
const JA_RESPONDIDA = { error: 'Esta proposta já foi respondida' };
const JANELA_SEG = 600; // src/manutencao.ts (MAIOR_JANELA_SEG) acompanha esta janela
const ABERTA = ['enviada', 'visualizada'];
// ponytail: teto do acumulado de pedidos de ajuste; passou, os mais antigos saem pelo começo (o comercial já foi notificado de cada um)
const TETO_AJUSTE = 20000;

const ipDe = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? '';

// Limite por IP antes de ler o corpo: variar o corpo não contorna.
publicPropostasApp.use('*', async (c, next) => {
  if (!(await rateLimitD1(c.env.DB, `proposta-publica:ip:${ipDe(c) || 'sem-ip'}`, 30, JANELA_SEG))) return c.json(MUITAS, 429);
  await next();
});

/**
 * Limite por token (chave com o hash, nunca o token) e a proposta do token. Vencida que ainda
 * estava aberta vira 'expirada' aqui, em todas as rotas: o fecharVenda não confere validade.
 */
async function resolver(c: Ctx, token: string): Promise<Response | Record<string, any>> {
  const db = c.env.DB;
  const hash = await sha256Hex(token);
  if (!(await rateLimitD1(db, `proposta-publica:token:${hash}`, 20, JANELA_SEG))) return c.json(MUITAS, 429);
  const p = await db.prepare('SELECT * FROM propostas WHERE token_hash = ?').bind(hash).first<any>();
  if (!p) return c.json(INVALIDO, 404);
  if (ABERTA.includes(p.status) && p.valida_ate && String(p.valida_ate).slice(0, 10) < diaEmBrasilia()) {
    await db.prepare(`UPDATE propostas SET status = 'expirada', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('enviada', 'visualizada')`)
      .bind(p.id).run();
    p.status = 'expirada';
  }
  return p;
}

// Os efeitos de cada ação vão num batch. A trilha só entra se o UPDATE guardado logo antes mudou a
// linha (changes()), e o resto se guarda pela linha da trilha DESTA chamada (id único): duas
// chamadas concorrentes, ou recusa contra aceite, deixam um efeito só.
const DESTA = 'EXISTS (SELECT 1 FROM audit_logs WHERE id = ?)';
const trilha = (db: D1Database, auditId: string, acao: string, detalhe: string, ip: string) => db.prepare(
  `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
   SELECT ?, ?, ?, ?, '', ?, NULL, datetime('now') WHERE changes() > 0`).bind(auditId, acao, ATOR_LINK, detalhe, ip);
/** Notificação ao comercial que criou a proposta, se ele tem conta. */
const notificar = (db: D1Database, p: any, auditId: string, titulo: string, mensagem: string, tipo: string) => db.prepare(
  `INSERT INTO notifications (id, user_id, type, title, message, read, link, action_type, target_id, created_at)
   SELECT ?, u.id, 'proposta', ?, ?, 0, ?, ?, ?, datetime('now') FROM users u WHERE lower(u.email) = lower(?) AND ${DESTA}`)
  .bind(genId(), titulo, mensagem, `/propostas/${p.id}`, tipo, p.id, p.criada_por, auditId);
const ref = (p: any) => `${p.id} (${p.numero} rev. ${p.revisao})`;
/** Ainda aberta e dentro da validade no instante do UPDATE, com o mesmo token (rotação no meio: nada muda). */
const AINDA_ABERTA = `id = ? AND token_hash = ? AND status IN ('enviada', 'visualizada') AND (valida_ate IS NULL OR substr(valida_ate, 1, 10) >= ?)`;

publicPropostasApp.post('/ver', async (c) => {
  try {
    const v = await validateBody(c, propostaTokenSchema);
    if (!v.success) return v.response;
    const p = await resolver(c, v.data.token);
    if (p instanceof Response) return p;
    const ip = ipDe(c);
    if (p.status === 'enviada') {
      const db = c.env.DB;
      const auditId = genId();
      await db.batch([
        db.prepare(`UPDATE propostas SET status = 'visualizada', visualizada_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'enviada'`).bind(p.id),
        trilha(db, auditId, 'proposta.visualizada', `Proposta ${ref(p)} aberta pelo cliente pelo link`, ip),
        notificar(db, p, auditId, `Proposta visualizada: ${p.cliente}`, `O cliente abriu a proposta ${p.numero} rev. ${p.revisao}.`, 'proposta_visualizada'),
      ]);
      p.status = 'visualizada';
    }
    switch (p.status) {
      // o HTML gravado, nunca remontado; nada de memória, margem, desconto ou consultor
      case 'visualizada': return c.json({ estado: 'visualizada', html: p.documento_html, numero: p.numero, revisao: p.revisao, validaAte: p.valida_ate });
      case 'aceita': return c.json({ estado: 'aceita', aceitaPor: p.aceite_nome, aceitaEm: p.aceite_em });
      case 'expirada': case 'recusada': case 'substituida': return c.json({ estado: p.status });
      default: return c.json(INVALIDO, 404);
    }
  } catch (e) { return erro500(c, 'Erro ao abrir a proposta', e); }
});

publicPropostasApp.post('/aceitar', async (c) => {
  try {
    const v = await validateBody(c, propostaAceiteLinkSchema);
    if (!v.success) return v.response;
    const p = await resolver(c, v.data.token);
    if (p instanceof Response) return p;
    const ip = ipDe(c);
    const dados = v.data;
    const f = await fecharVenda(c.env.DB, {
      // o e-mail digitado não é identidade: fica no aceite (aceite_email), não como autor da trilha
      propostaId: p.id, orgId: p.org_id, origem: 'link', atorEmail: ATOR_LINK, tokenHash: p.token_hash,
      aceite: { nome: dados.nome, cargo: dados.cargo, email: dados.email, ip },
    });
    // a mensagem do fecharVenda diz o estado: para o cliente, só o 409 do já aceita ou o 404 uniforme
    if (!f.ok) return f.motivo === 'ja_fechada' ? c.json(JA_RESPONDIDA, 409) : c.json(INVALIDO, 404);
    const l = await c.env.DB.prepare('SELECT aceite_em FROM propostas WHERE id = ?').bind(p.id).first<any>();
    return c.json({ ok: true, aceitaEm: l?.aceite_em ?? null });
  } catch (e) { return erro500(c, 'Erro ao registrar o aceite', e); }
});

publicPropostasApp.post('/recusar', async (c) => {
  try {
    const v = await validateBody(c, propostaRecusaSchema);
    if (!v.success) return v.response;
    const p = await resolver(c, v.data.token);
    if (p instanceof Response) return p;
    const ip = ipDe(c);
    const dados = v.data;
    if (!ABERTA.includes(p.status)) return c.json(INVALIDO, 404);
    const db = c.env.DB;
    const auditId = genId();
    const motivo = dados.motivo || null;
    const res = await db.batch([
      db.prepare(`UPDATE propostas SET status = 'recusada', recusa_motivo = ?, updated_at = CURRENT_TIMESTAMP WHERE ${AINDA_ABERTA}`)
        .bind(motivo, p.id, p.token_hash, diaEmBrasilia()),
      // o motivo fica na proposta e na notificação, não na trilha imutável
      trilha(db, auditId, 'proposta.recusada', `Proposta ${ref(p)} recusada pelo cliente pelo link`, ip),
      db.prepare(`UPDATE leads SET status = 'Lost', updated_at = datetime('now') WHERE id = ? AND ${DESTA}`).bind(p.lead_id, auditId),
      notificar(db, p, auditId, `Proposta recusada: ${p.cliente}`,
        `O cliente recusou a proposta ${p.numero} rev. ${p.revisao}.${motivo ? ` Motivo: ${motivo}` : ''}`, 'proposta_recusada'),
    ]);
    if (!res[0].meta.changes) return c.json(INVALIDO, 404);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Erro ao registrar a recusa', e); }
});

const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

publicPropostasApp.post('/ajuste', async (c) => {
  try {
    const v = await validateBody(c, propostaAjusteSchema);
    if (!v.success) return v.response;
    const p = await resolver(c, v.data.token);
    if (p instanceof Response) return p;
    const ip = ipDe(c);
    const dados = v.data;
    if (!ABERTA.includes(p.status)) return c.json(INVALIDO, 404);
    const db = c.env.DB;
    const auditId = genId();
    const entrada = `[${QUANDO.format(new Date()).replace(', ', ' ')}] ${dados.mensagem}`;
    const res = await db.batch([
      db.prepare(`UPDATE propostas SET ajuste_mensagem = substr(COALESCE(ajuste_mensagem || char(10) || char(10), '') || ?, -${TETO_AJUSTE}),
        updated_at = CURRENT_TIMESTAMP WHERE ${AINDA_ABERTA}`).bind(entrada, p.id, p.token_hash, diaEmBrasilia()),
      trilha(db, auditId, 'proposta.ajuste_pedido', `Ajuste pedido pelo cliente na proposta ${ref(p)}`, ip),
      notificar(db, p, auditId, `Pedido de ajuste: ${p.cliente}`, `Proposta ${p.numero} rev. ${p.revisao}: ${dados.mensagem.slice(0, 500)}`, 'proposta_ajuste'),
    ]);
    if (!res[0].meta.changes) return c.json(INVALIDO, 404);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Erro ao registrar o pedido de ajuste', e); }
});
