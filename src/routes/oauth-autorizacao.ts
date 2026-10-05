import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { verifyPassword, rateLimit, rateLimitD1, genId, genToken, logAudit, escapeHtml, PROJETOS_DO_CONSULTOR_SQL } from '../helpers';
import { clientIp, chavesTentativa, registrarFalhaLogin } from './auth';
import { mensagemBloqueio } from '../auth-policy';
import { verificarCodigoTotp } from '../services/totp';
import { NOME_CLIENTE_SQL, type PropsAgente } from '../middleware/agente';

/*
 * Tela de autorização do MCP remoto (spec 2026-09-29-receita-agentes-mcp-remoto).
 * Três passos, sem JavaScript (CSP script-src 'self'): pedido OAuth → credenciais
 * (senha + TOTP) → escolha de UM cliente onde a pessoa é consultora designada.
 * O estado entre passos fica no KV por 10 min, sob um token aleatório de uso único.
 */
export const oauthAutorizacao = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Só existe atrás do OAuthProvider, que injeta OAUTH_PROVIDER. O despacho de
// src/index.ts decide pelo caminho DECODIFICADO (ROTAS_OAUTH), então
// `/%6Fauth/...` também passa pelo provider. Esta guarda é defesa em
// profundidade e NÃO basta sozinha: o provider grava o helper no próprio objeto
// `env`, que o runtime reaproveita entre requisições — depois da primeira
// requisição OAuth, um caminho que escapasse do despacho já o encontraria aqui.
oauthAutorizacao.use('*', async (c, next) => (c.env.OAUTH_PROVIDER ? next() : c.notFound()));

const TTL_PEDIDO = 600;
const TTL_CONCESSAO_DIAS = 30;
const chave = (t: string) => `oauth_pedido:${t}`;

interface Pedido { oauth: unknown; clientName: string; destino: string; userId?: string; email?: string }

/** Loopback é o callback local do cliente MCP na máquina da pessoa. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function pagina(titulo: string, corpo: string, status = 200): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titulo)} · n.iso</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1326;color:#f1f5f9;font:16px/1.6 Inter,system-ui,sans-serif}
main{width:min(440px,100% - 32px);background:#162244;border:1px solid rgba(255,255,255,.1);padding:32px}
h1{font:600 22px Montserrat,system-ui,sans-serif;margin:0 0 8px}.marca{font:500 24px Montserrat,system-ui,sans-serif;margin-bottom:24px}
.marca span{color:#00ade8}label{display:block;font-size:13px;color:#cbd5e1;margin:16px 0 6px}
input[type=email],input[type=password],input[type=text]{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#f1f5f9;font:inherit}
button{margin-top:24px;width:100%;padding:12px;border:0;border-radius:10px;background:#00ade8;color:#04121c;font:500 15px Inter,system-ui,sans-serif;cursor:pointer}
.op{display:flex;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1)}
.erro{color:#fca5a5}.nota{font-size:13px;color:#94a3b8}
</style></head><body><main><div class="marca">n<span>.</span>iso</div>${corpo}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function lerPedido(c: any, token: string): Promise<Pedido | null> {
  if (!token) return null;
  const bruto = await c.env.SESSIONS.get(chave(token));
  return bruto ? (JSON.parse(bruto) as Pedido) : null;
}

oauthAutorizacao.get('/authorize', async (c) => {
  // Pedido malformado (client_id, redirect_uri, PKCE) faz a biblioteca lançar:
  // é erro do cliente, não do servidor — 400, sem contar na taxa de 5xx.
  const provedor = c.env.OAUTH_PROVIDER;
  if (!provedor) return c.notFound(); // o use('*') já barra; aqui só estreita o tipo
  let oauth, cliente;
  try {
    oauth = await provedor.parseAuthRequest(c.req.raw);
    cliente = await provedor.lookupClient(oauth.clientId);
  } catch {
    cliente = null;
  }
  if (!oauth || !cliente) return pagina('Pedido inválido', '<h1>Pedido de conexão inválido</h1><p>Volte ao seu cliente MCP e conecte de novo.</p>', 400);
  const token = genToken();
  // Registro de cliente é aberto (DCR): o nome é o que o cliente declarou. O
  // host do redirect é o que identifica quem recebe o acesso.
  const pedido: Pedido = { oauth, clientName: cliente.clientName || 'Cliente MCP', destino: new URL(oauth.redirectUri).host };
  await c.env.SESSIONS.put(chave(token), JSON.stringify(pedido), { expirationTtl: TTL_PEDIDO });
  return pagina('Conectar agente', `
<h1>Conectar agente</h1>
<p class="nota">${escapeHtml(pedido.clientName)} pede acesso ao n.iso em seu nome.</p>
<form method="post" action="/oauth/authorize/entrar">
<input type="hidden" name="pedido" value="${token}">
<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required>
<label for="codigo">Código do autenticador (se ativo)</label><input id="codigo" name="codigo" type="text" inputmode="numeric" autocomplete="one-time-code">
<button type="submit">Entrar</button></form>`);
});

oauthAutorizacao.post('/authorize/entrar', async (c) => {
  const f = await c.req.parseBody();
  const token = String(f.pedido || '');
  const pedido = await lerPedido(c, token);
  if (!pedido) return pagina('Pedido expirado', '<h1>Pedido expirado</h1><p>Volte ao seu cliente MCP e conecte de novo.</p>', 400);

  // Mesma contagem de falhas e mesmo bloqueio do login do app (routes/auth.ts):
  // errar aqui bloqueia lá e vice-versa. O desafio Turnstile fica de fora — o
  // widget exige script de terceiro e esta tela não roda JavaScript (CSP).
  const ip = clientIp(c);
  const email = String(f.email || '').trim().toLowerCase();
  const chaves = chavesTentativa(email, ip);
  const bloqueio = () => pagina('Muitas tentativas', `<h1>Muitas tentativas</h1><p class="erro">${escapeHtml(mensagemBloqueio())}</p>`, 429);
  if (!(await rateLimit(c.env.SESSIONS, `oauth-login:${ip}`, 20, 300))) {
    return pagina('Muitas tentativas', '<h1>Muitas tentativas</h1><p>Tente de novo em alguns minutos.</p>', 429);
  }
  if (await c.env.SESSIONS.get(chaves.bloqueio)) return bloqueio();
  if (!(await rateLimitD1(c.env.DB, `login:acct:${email}`, 10, 300))) {
    return pagina('Muitas tentativas', '<h1>Muitas tentativas</h1><p>Tente de novo em alguns minutos.</p>', 429);
  }
  const falhas = parseInt((await c.env.SESSIONS.get(chaves.falhas)) || '0', 10) || 0;

  const u = await c.env.DB.prepare(
    'SELECT id, email, role, password_hash, ativo, requires_password_change, totp_enabled, totp_secret, totp_last_window FROM users WHERE lower(email) = ?'
  ).bind(email).first<any>();
  // A senha é conferida sempre que a conta existe, e senha errada, conta
  // inativa e papel sem acesso dão a MESMA resposta e contam como falha: a
  // tela é pública, e responder diferente à senha certa de quem não é
  // consultor viraria oráculo de senha de qualquer conta, platform_admin inclusive.
  const senhaOk = u ? await verifyPassword(String(f.senha || ''), u.password_hash) : false;
  if (!senhaOk || u.ativo === 0 || (u.role !== 'consultor' && u.role !== 'consultant')) {
    await c.env.SESSIONS.delete(chave(token)); // falha consome o pedido
    const depois = await registrarFalhaLogin(c, chaves, falhas, false, ip);
    if (depois.bloqueado) return bloqueio();
    return pagina('Entrar', '<h1>Não foi possível entrar</h1><p class="erro">E-mail ou senha incorretos.</p>', 401);
  }
  await c.env.SESSIONS.delete(chaves.falhas);
  if (u.totp_enabled === 1) {
    const janela = await verificarCodigoTotp(u.totp_secret, String(f.codigo || ''));
    const avanco = janela === null ? null : await c.env.DB.prepare(
      `UPDATE users SET totp_last_window = ? WHERE id = ? AND (totp_last_window IS NULL OR totp_last_window < ?)`
    ).bind(janela, u.id, janela).run();
    if (!avanco || avanco.meta?.changes !== 1) {
      return pagina('Entrar', '<h1>Código inválido</h1><p class="erro">Informe o código atual do autenticador.</p>', 401);
    }
  }

  // Só depois de senha e segundo fator conferidos: aqui a mensagem já não
  // revela nada a quem não tem a credencial.
  if (u.requires_password_change === 1) {
    await c.env.SESSIONS.delete(chave(token));
    return pagina('Senha provisória', '<h1>Senha provisória</h1><p>Defina sua senha definitiva no n.iso antes de conectar um agente.</p>', 403);
  }

  const { results } = await c.env.DB.prepare(
    // A mesma definição de "designado" do consultor humano: só projetos da organização dele.
    `SELECT p.id, ${NOME_CLIENTE_SQL} AS client_name FROM projects p
      WHERE p.id IN (${PROJETOS_DO_CONSULTOR_SQL}) ORDER BY 2`
  ).bind(email).all<{ id: string; client_name: string }>();
  if (!results.length) {
    await c.env.SESSIONS.delete(chave(token));
    return pagina('Sem clientes', '<h1>Nenhum cliente</h1><p>Você não é consultor designado em nenhum cliente. Peça ao administrador do cliente ou ao platform_admin para designá-lo na governança do projeto.</p>');
  }

  await c.env.SESSIONS.put(chave(token), JSON.stringify({ ...pedido, userId: u.id, email: u.email }), { expirationTtl: TTL_PEDIDO });
  const opcoes = results.map((p) =>
    `<label class="op"><input type="radio" name="projeto" value="${escapeHtml(p.id)}" required> ${escapeHtml(p.client_name)}</label>`
  ).join('');
  return pagina('Escolha o cliente', `
<h1>Em qual cliente o agente vai atuar?</h1>
<p class="nota">${escapeHtml(pedido.clientName)} em ${escapeHtml(pedido.destino)}. Um cliente por conexão. Para outro cliente, conecte de novo.</p>
${LOOPBACK.has(new URL(`http://${pedido.destino}`).hostname) ? '' : `<p class="erro">Atenção: o acesso será entregue a ${escapeHtml(pedido.destino)}. Só autorize se você reconhece este endereço.</p>`}
<form method="post" action="/oauth/authorize/confirmar">
<input type="hidden" name="pedido" value="${token}">${opcoes}
<p class="nota">O agente tem o mesmo alcance que você tem neste cliente: lê tudo e grava adequação (políticas, SoA, evidências, controles, riscos). Com a sua confirmação a cada vez, também apaga registros, gera políticas em lote, elimina dados de titular e revoga aprovações de controle. Aprovação de ROPA e DPIA e análise crítica assinada só se desfazem pela interface, por quem administra. Não registra achado de auditoria, não gerencia usuários, SSO, chaves de API nem webhooks. O administrador do cliente vê e pode revogar este acesso.</p>
<button type="submit">Autorizar</button></form>`);
});

oauthAutorizacao.post('/authorize/confirmar', async (c) => {
  const f = await c.req.parseBody();
  const token = String(f.pedido || '');
  const pedido = await lerPedido(c, token);
  if (!pedido?.userId || !pedido.email) return pagina('Pedido expirado', '<h1>Pedido expirado</h1><p>Volte ao seu cliente MCP e conecte de novo.</p>', 400);
  await c.env.SESSIONS.delete(chave(token)); // uso único, antes de qualquer efeito

  const projectId = String(f.projeto || '');
  const alvo = await c.env.DB.prepare(
    `SELECT ${NOME_CLIENTE_SQL} AS client_name FROM projects p
      WHERE p.id = ? AND p.id IN (${PROJETOS_DO_CONSULTOR_SQL})`
  ).bind(projectId, pedido.email).first<{ client_name: string }>();
  if (!alvo) return pagina('Não autorizado', '<h1>Cliente fora da sua designação</h1>', 403);

  // Grant primeiro: se completeAuthorization falhar, não sobra concessão nem
  // trilha órfã. Se o INSERT falhar depois, o grant aponta para concessão
  // inexistente e resolverAgente o recusa — falha fechada.
  const concessaoId = genId();
  const clienteMcp = `${pedido.clientName} (${pedido.destino})`.slice(0, 120);
  const props: PropsAgente = { userId: pedido.userId, email: pedido.email, projectId, concessaoId };
  const provedor = c.env.OAUTH_PROVIDER;
  if (!provedor) return c.notFound(); // o use('*') já barra; aqui só estreita o tipo
  const { redirectTo } = await provedor.completeAuthorization({
    request: pedido.oauth as any, userId: pedido.userId,
    metadata: { clientName: pedido.clientName, projectId },
    // Escopo fixo: o que o agente pode é decidido aqui (papel consultor), não
    // pelo que o cliente MCP pediu na URL.
    scope: ['niso:consultor'],
    props, revokeExistingGrants: false,
  });

  await c.env.DB.prepare(
    `INSERT INTO agente_concessoes (id, user_id, project_id, cliente_mcp, expira_em) VALUES (?, ?, ?, ?, datetime('now', ?))`
  ).bind(concessaoId, pedido.userId, projectId, clienteMcp, `+${TTL_CONCESSAO_DIAS} days`).run();
  await logAudit(c.env.DB, 'agente.autorizado', pedido.email, `Agente ${clienteMcp} conectado ao cliente ${alvo.client_name}`, '', c.req.header('CF-Connecting-IP') || '', projectId);

  // Página com meta refresh, e não 302: o CSP `form-action 'self'` barra o
  // redirecionamento pós-formulário para o callback local do cliente MCP.
  const url = escapeHtml(redirectTo);
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><title>Conectado · n.iso</title></head><body style="background:#0b1326;color:#f1f5f9;font:16px Inter,system-ui,sans-serif;padding:32px">Agente conectado a ${escapeHtml(alvo.client_name)}. <a style="color:#00ade8" href="${url}">Voltar ao cliente MCP</a>.</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
});
