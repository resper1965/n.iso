// Ciência por link com código (acesso de stakeholders, fatia 3). Sem sessão, na internet: a
// credencial é o token pessoal do link, que chega no CORPO (nunca no caminho nem na query, que vão
// para o log de requisição) e é procurado pelo SHA-256 em pedido_destinatarios.token_hash; o
// segundo fator é um código de 6 dígitos enviado ao e-mail do destinatário. O token nunca vai para
// trilha, log nem resposta.
//
// Token desconhecido, vencido, trocado por reenvio, de pedido substituído/cancelado/concluído ou
// de pedido que não é de ciência: o MESMO 404. Montado antes do authMiddleware (index.ts).
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings } from '../index';
import { sha256Hex, rateLimitD1, erro500, genNumericCode, sendEmail, escapeHtml, constantTimeEqual, logAudit } from '../helpers';
import { validateBody, pedidoTokenSchema, pedidoCienciaLinkSchema } from '../schemas';
import { conferirVigencia, registrarDecisao, type PedidoRow } from '../services/pedidos';

export const publicPedidosApp = new Hono<{ Bindings: Bindings }>();
type Ctx = Context<{ Bindings: Bindings }>;

const INVALIDO = { error: 'Link inválido ou expirado' };
const MUITAS = { error: 'Muitas tentativas. Tente novamente mais tarde.' };
const CODIGO_INVALIDO = { error: 'Código incorreto ou expirado. Peça um novo código.' };
const JANELA_SEG = 600; // src/manutencao.ts (MAIOR_JANELA_SEG) acompanha esta janela
const OTP_SEG = 900;
const MAX_CODIGOS_POR_JANELA = 5;
const MAX_TENTATIVAS_POR_CODIGO = 5;

const ipDe = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? '';
const chaveOtp = (destId: string) => `pedido_otp_${destId}`;
/** `fulano@empresa.com` vira `f*****@empresa.com`: a pessoa reconhece, quem só tem o link não ganha o e-mail. */
const mascarar = (email: string) => email.replace(/^(.)[^@]*/, (_m, a) => `${a}*****`);

// Limite por IP antes de ler o corpo: variar o corpo não contorna. Teto largo de propósito: um lote
// de até 200 pessoas da mesma empresa sai por um IP só (NAT), e cada uma faz ver + código + ciência.
// Contra adivinhar token, quem segura é o espaço de 256 bits e o limite por token (20/10 min).
const MAX_POR_IP = 600;
publicPedidosApp.use('*', async (c, next) => {
  if (!(await rateLimitD1(c.env.DB, `pedido-publico:ip:${ipDe(c) || 'sem-ip'}`, MAX_POR_IP, JANELA_SEG))) return c.json(MUITAS, 429);
  await next();
});

type Dest = { id: string; email: string; nome: string | null; status: string; decidido_em: string | null; hash_lido: string | null; token_hash: string };

/**
 * Limite por token (chave com o hash, nunca o token) e o destinatário + pedido do token. Só pedido
 * de ciência, link no prazo. Pedido aberto é conferido contra o documento: se mudou, vira
 * substituído aqui mesmo e o link morre (404).
 */
async function resolver(c: Ctx, token: string): Promise<Response | { d: Dest; p: PedidoRow }> {
  const db = c.env.DB;
  const hash = await sha256Hex(token);
  if (!(await rateLimitD1(db, `pedido-publico:token:${hash}`, 20, JANELA_SEG))) return c.json(MUITAS, 429);
  const row = await db.prepare(
    `SELECT d.id AS d_id, d.email AS d_email, d.nome AS d_nome, d.status AS d_status, d.decidido_em AS d_decidido_em,
            d.hash_lido AS d_hash_lido, d.token_hash AS d_token_hash, p.*
       FROM pedido_destinatarios d JOIN pedidos p ON p.id = d.pedido_id
      WHERE d.token_hash = ? AND d.token_expira_em > datetime('now') AND p.papel_exigido = 'ciente'`
  ).bind(hash).first<any>();
  if (!row) return c.json(INVALIDO, 404);
  const { d_id, d_email, d_nome, d_status, d_decidido_em, d_hash_lido, d_token_hash, ...p } = row;
  const d: Dest = { id: d_id, email: d_email, nome: d_nome, status: d_status, decidido_em: d_decidido_em, hash_lido: d_hash_lido, token_hash: d_token_hash };
  if (p.status === 'substituido' || p.status === 'cancelado') return c.json(INVALIDO, 404);
  if (d.status === 'pendente') {
    if (p.status !== 'aberto' || !(await conferirVigencia(db, p)).vigente) return c.json(INVALIDO, 404);
  }
  return { d, p };
}

publicPedidosApp.post('/ver', async (c) => {
  try {
    const v = await validateBody(c, pedidoTokenSchema);
    if (!v.success) return v.response;
    const r = await resolver(c, v.data.token);
    if (r instanceof Response) return r;
    const { d, p } = r;
    if (d.status !== 'pendente') return c.json({ estado: d.status, titulo: p.titulo, decidido_em: d.decidido_em, hash_lido: d.hash_lido });
    await c.env.DB.prepare(`UPDATE pedido_destinatarios SET aberto_em = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pendente' AND aberto_em IS NULL`)
      .bind(d.id).run();
    // Só o documento congelado e o hash da versão: nada de org, autor, outros destinatários.
    return c.json({
      estado: 'pendente', tipo: p.tipo, titulo: p.titulo, conteudo: JSON.parse(p.conteudo_json), hash: p.hash,
      nome: d.nome, email: mascarar(d.email), criado_em: p.criado_em,
    });
  } catch (e) { return erro500(c, 'Erro ao abrir o documento', e); }
});

publicPedidosApp.post('/codigo', async (c) => {
  try {
    const v = await validateBody(c, pedidoTokenSchema);
    if (!v.success) return v.response;
    const r = await resolver(c, v.data.token);
    if (r instanceof Response) return r;
    const { d, p } = r;
    if (d.status !== 'pendente') return c.json(INVALIDO, 404);
    // O código vai SÓ ao e-mail do destinatário: limitar evita relay de spam pelo link.
    if (!(await rateLimitD1(c.env.DB, `pedido-otp:envio:${d.id}`, MAX_CODIGOS_POR_JANELA, 3600))) return c.json(MUITAS, 429);
    const codigo = genNumericCode(6);
    await c.env.SESSIONS.put(chaveOtp(d.id), JSON.stringify({ h: await sha256Hex(codigo), exp: Date.now() + OTP_SEG * 1000 }), { expirationTtl: OTP_SEG });
    const enviado = await sendEmail(c, d.email, 'Seu código para dar ciência',
      `<p>Seu código para confirmar a ciência de <strong>${escapeHtml(p.titulo)}</strong>:</p><p><strong>${codigo}</strong></p><p>Ele expira em 15 minutos. Se você não pediu, ignore este e-mail.</p>`);
    if (!enviado) return c.json({ error: 'Não foi possível enviar o código no momento. Tente novamente.' }, 502);
    return c.json({ ok: true, enviado_para: mascarar(d.email) });
  } catch (e) { return erro500(c, 'Erro ao enviar o código', e); }
});

publicPedidosApp.post('/ciencia', async (c) => {
  try {
    const v = await validateBody(c, pedidoCienciaLinkSchema);
    if (!v.success) return v.response;
    const r = await resolver(c, v.data.token);
    if (r instanceof Response) return r;
    const { d, p } = r;
    if (d.status !== 'pendente') return c.json({ error: 'A ciência deste documento já foi registrada.' }, 409);
    // Toda tentativa conta, certa ou errada: 6 dígitos não aguentam força bruta sem teto.
    if (!(await rateLimitD1(c.env.DB, `pedido-otp:tentativa:${d.id}`, MAX_TENTATIVAS_POR_CODIGO, OTP_SEG))) return c.json(MUITAS, 429);
    const guardado = await c.env.SESSIONS.get(chaveOtp(d.id));
    const otp = guardado ? JSON.parse(guardado) as { h: string; exp: number } : null;
    if (!otp || otp.exp < Date.now() || !constantTimeEqual(otp.h, await sha256Hex(v.data.codigo))) return c.json(CODIGO_INVALIDO, 400);

    const ip = ipDe(c) || null;
    const pegou = await registrarDecisao(c.env.DB, {
      pedido: p, destId: d.id, status: 'ciente', ip, ua: c.req.header('User-Agent') || null, mfa: false,
      nome: v.data.nome, motivo: null, canal: 'link', tokenHash: d.token_hash,
    });
    if (!pegou) return c.json(INVALIDO, 404); // decidido por outra chamada, documento mudou ou link trocado no meio
    await c.env.SESSIONS.delete(chaveOtp(d.id));
    const prova = await c.env.DB.prepare('SELECT decidido_em, hash_lido FROM pedido_destinatarios WHERE id = ?').bind(d.id).first<any>();
    await logAudit(c.env.DB, 'pedido.ciente_link', d.email,
      `Pedido ${p.id} (${p.tipo} ${p.ref_id}): ciente pelo link por ${v.data.nome}; hash lido ${p.hash}`, '', ip ?? '', p.project_id);
    return c.json({ ok: true, decidido_em: prova?.decidido_em ?? null, hash_lido: p.hash });
  } catch (e) { return erro500(c, 'Erro ao registrar a ciência', e); }
});
