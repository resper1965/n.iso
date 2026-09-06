import { Hono } from 'hono';
import { Bindings } from '../index';
import { logAudit, genNumericCode, erro500, sendEmail, escapeHtml, rateLimit } from '../helpers';
import { validateBody, otpPedidoSchema, otpVerificacaoSchema, aceiteDePoliticaSchema, ssoInicioSchema } from '../schemas';
import {
  configPorDominio, descobrir, iniciarLogin, consumirState, trocarCodigo,
  validarIdToken, provisionar, segredoDoCliente,
} from '../sso';
import { resolveHostIsPublic } from './integrations';
import { genToken, SESSION_TTL_SEC } from '../helpers';

export const publicApp = new Hono<{ Bindings: Bindings }>();

publicApp.get('/pricing', async (c) => {
  // Texto em PT-BR: "Sem i18n. O produto é PT-BR." (AGENTS.md). Nenhum outro
  // consumidor no app lê este endpoint — só a landing pública — então
  // traduzir aqui não quebra nenhuma outra tela.
  const tiers = [
    { id: 'foundation', name: 'Foundation', price: 'R$25.000', features: ['Assessment pré-venda','Análise de gaps','Templates de política','Relatório básico'], max_controls: 30, max_users: 3 },
    { id: 'standard', name: 'Standard', price: 'R$55.000', features: ['Tudo do Foundation','Geração de política por IA','Avaliação de risco','Gestão de fornecedores','Módulo ROPA','Calendário de auditoria'], max_controls: 93, max_users: 10 },
    { id: 'enterprise', name: 'Enterprise', price: 'R$95.000', features: ['Tudo do Standard','Geração de política em lote','Migração para ISO 27701','Relatórios executivos','Chaves de API','Webhooks','Exportação CSV'], max_controls: 93, max_users: 25 },
    { id: 'critical', name: 'Critical Infrastructure', price: 'R$180.000', features: ['Tudo do Enterprise','Suporte dedicado','Templates customizados','Módulo CAPA','Acompanhamento de certificação','Assistente de compliance por IA','SLA 99,9%'], max_controls: 93, max_users: 50 },
  ];
  return c.json({ ok: true, tiers });
});

publicApp.get('/stats', async (c) => {
  const [projects, assessments, controls, risks, evidence, users] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM projects').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM assessments').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM compliance_controls').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM risks').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM evidence').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first() as Promise<any>,
  ]);
  return c.json({ ok: true, projects: projects?.cnt || 0, assessments: assessments?.cnt || 0, controls: controls?.cnt || 0, risks: risks?.cnt || 0, evidence_files: evidence?.cnt || 0, users: users?.cnt || 0 });
});

publicApp.post('/policies/request-otp', async (c) => {
  try {
    const v = await validateBody(c, otpPedidoSchema);
    if (!v.success) return v.response;
    const { project_id, name, email } = v.data;
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split('@')[0]).trim();

    // Esta rota é pública e montada ANTES do rateLimitMiddleware — sem trava
    // própria, vira relay de mail-bombing e queima a cota/reputação do Resend.
    // Limite por projeto+e-mail: 5 pedidos por hora.
    const permitido = await rateLimit(c.env.SESSIONS, `otp:${project_id}:${cleanEmail}`, 5, 3600);
    if (!permitido) {
      return c.json({ error: 'Muitas solicitações de código. Tente novamente mais tarde.' }, 429);
    }

    const otp = genNumericCode(6);

    const otpKey = `otp_${project_id}_${cleanEmail}`;
    const otpData = {
      otp,
      name: cleanName,
      email: cleanEmail,
      project_id,
      expires_at: Date.now() + 15 * 60 * 1000
    };

    await c.env.SESSIONS.put(otpKey, JSON.stringify(otpData), { expirationTtl: 900 });

    // O OTP é a ÚNICA credencial do portal público de políticas. Ele deve chegar
    // só ao dono do e-mail — nunca no corpo da resposta (isso derrubaria o 2º
    // fator: qualquer um que conheça o project_id leria as políticas do tenant).
    // Entrega por e-mail; o eco em `demo_otp` fica restrito a dev/test.
    // `cleanName` é controlado pelo chamador e vai no HTML enviado da identidade
    // confiável noreply@ness.lat → escapar para não virar relay de injeção/phishing.
    const enviado = await sendEmail(
      c,
      cleanEmail,
      'Seu código de acesso às políticas',
      `<p>Olá ${escapeHtml(cleanName)},</p><p>Seu código de verificação é <strong>${otp}</strong>. Ele expira em 15 minutos.</p>`
    );
    await logAudit(c.env.DB, 'policy.otp_requested', cleanEmail, `OTP de acesso às políticas solicitado para projeto ${project_id}`);

    const isDevOrTest = c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test';
    // Não anunciar sucesso se a entrega falhou. Em dev/test o eco supre o envio.
    if (!enviado && !isDevOrTest) {
      return c.json({ error: 'Não foi possível enviar o código no momento. Tente novamente.' }, 502);
    }
    return c.json({
      ok: true,
      message: `Código de verificação enviado para ${cleanEmail}.`,
      ...(isDevOrTest ? { demo_otp: otp } : {})
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao gerar código OTP', e);
  }
});

publicApp.post('/policies/verify-otp', async (c) => {
  try {
    const v = await validateBody(c, otpVerificacaoSchema);
    if (!v.success) return v.response;
    const { project_id, email, otp } = v.data;
    const cleanEmail = email.trim().toLowerCase();
    const otpKey = `otp_${project_id}_${cleanEmail}`;
    const stored = await c.env.SESSIONS.get(otpKey);

    if (!stored) {
      return c.json({ error: 'Código expirado ou inválido. Solicite um novo código.' }, 400);
    }

    const otpData = JSON.parse(stored);
    if (otpData.otp !== otp.trim()) {
      return c.json({ error: 'Código de verificação incorreto.' }, 400);
    }

    const sessionToken = `pubpol_${crypto.randomUUID().replace(/-/g, '')}`;
    const sessionData = {
      project_id,
      name: otpData.name,
      email: cleanEmail,
      authenticated_at: new Date().toISOString()
    };

    await c.env.SESSIONS.put(`pubpol_sess_${sessionToken}`, JSON.stringify(sessionData), { expirationTtl: 7200 });
    await c.env.SESSIONS.delete(otpKey);

    await logAudit(c.env.DB, 'policy.otp_verified', cleanEmail, `Acesso público a políticas liberado para ${cleanEmail}`);

    return c.json({
      ok: true,
      token: sessionToken,
      name: otpData.name,
      email: cleanEmail,
      project_id
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao verificar OTP', e);
  }
});

publicApp.get('/policies/list', async (c) => {
  try {
    const token = c.req.query('token') || c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'Token de acesso não fornecido' }, 401);

    const sessionRaw = await c.env.SESSIONS.get(`pubpol_sess_${token}`);
    if (!sessionRaw) return c.json({ error: 'Sessão expirada. Por favor, autentique-se novamente.' }, 401);

    const session = JSON.parse(sessionRaw);
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(session.project_id).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const { results: controls } = await c.env.DB.prepare(
      `SELECT id, standard, title, description, status FROM compliance_controls WHERE project_id = ? ORDER BY title ASC`
    ).bind(session.project_id).all<any>();

    const { results: acks } = await c.env.DB.prepare(
      `SELECT * FROM policy_acknowledgments WHERE project_id = ? AND user_email = ?`
    ).bind(session.project_id, session.email).all<any>();

    return c.json({
      ok: true,
      project: {
        id: project.id,
        client_name: project.client_name,
        project_name: project.project_name || project.client_name
      },
      user: {
        name: session.name,
        email: session.email
      },
      controls: controls || [],
      acknowledgments: acks || []
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao carregar políticas', e);
  }
});

publicApp.post('/policies/ack', async (c) => {
  try {
    const token = c.req.query('token') || c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'Token de acesso não fornecido' }, 401);

    const sessionRaw = await c.env.SESSIONS.get(`pubpol_sess_${token}`);
    if (!sessionRaw) return c.json({ error: 'Sessão expirada. Por favor, autentique-se novamente.' }, 401);

    const session = JSON.parse(sessionRaw);
    const v = await validateBody(c, aceiteDePoliticaSchema);
    if (!v.success) return v.response;
    const { policy_type, user_name, user_email } = v.data;

    const nameToRecord = user_name || session.name;
    const emailToRecord = user_email || session.email;
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';

    const ackId = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(ackId, session.project_id, policy_type, nameToRecord, emailToRecord, ipAddress, userAgent).run();

    await logAudit(c.env.DB, 'policy.acknowledged_public', emailToRecord, `Ciência registrada via portal público para ${policy_type} por ${nameToRecord}`);

    return c.json({
      ok: true,
      id: ackId,
      acknowledged_at: now,
      policy_type,
      user_name: nameToRecord,
      user_email: emailToRecord,
      ip_address: ipAddress
    });
  } catch (e: any) {
    return erro500(c, 'Erro ao registrar ciência eletrônica', e);
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  SSO por OIDC (item 4.1). Rotas PÚBLICAS — são o caminho de entrar.
// ═════════════════════════════════════════════════════════════════════════════

/** `https://host/api/v1/public/sso/callback`, derivado da própria requisição. */
function redirectUriDe(c: any): string {
  return `${new URL(c.req.url).origin}/api/v1/public/sso/callback`;
}

/**
 * Descobre se o e-mail entra por SSO e devolve para onde mandar o navegador.
 *
 * Responde JSON em vez de redirecionar: quem chama é a tela de login, que
 * precisa saber se DEVE seguir para o IdP ou pedir a senha. E responde a mesma
 * coisa — `sso: false` — para domínio desconhecido e para tenant sem SSO, sem
 * dizer se o e-mail existe: a rota é pública e enumerar contas por aqui seria
 * de graça.
 */
publicApp.post('/sso/iniciar', async (c) => {
  try {
    const v = await validateBody(c, ssoInicioSchema);
    if (!v.success) return v.response;
    const { email } = v.data as any;

    const cfg = await configPorDominio(c.env, email);
    if (!cfg) return c.json({ sso: false });

    const d = await descobrir(c.env, cfg.issuer, fetch, (host) => resolveHostIsPublic(host));
    const { url } = await iniciarLogin(c.env, cfg, d, redirectUriDe(c));
    return c.json({ sso: true, autorizacao: url });
  } catch (e: any) {
    return erro500(c, 'Falha ao iniciar o login federado', e);
  }
});

/**
 * Retorno do IdP. Valida tudo e devolve a sessão no FRAGMENTO da URL.
 *
 * Fragmento (`#`) e não query (`?`): o fragmento não é enviado ao servidor nem
 * vai no cabeçalho `Referer`, então o token de sessão não termina em log de
 * proxy nem no analytics de terceiro. É a mesma razão de o fluxo implícito do
 * OAuth usar fragmento.
 */
publicApp.get('/sso/callback', async (c) => {
  const falha = (motivo: string) =>
    c.redirect(`/#sso_erro=${encodeURIComponent(motivo)}`, 302);

  try {
    const erroIdp = c.req.query('error');
    if (erroIdp) return falha(erroIdp);

    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) return falha('resposta do IdP incompleta');

    // Uso único: lê e apaga. Replay do callback não pode virar sessão nova.
    const guardado = await consumirState(c.env, state);
    if (!guardado) return falha('pedido de login expirado ou já usado');

    const cfg = await c.env.DB.prepare('SELECT * FROM project_sso WHERE project_id = ? AND ativo = 1')
      .bind(guardado.project_id).first<any>();
    if (!cfg) return falha('SSO não está ativo para este cliente');

    const d = await descobrir(c.env, cfg.issuer, fetch, (host) => resolveHostIsPublic(host));
    const segredo = await segredoDoCliente(c.env, cfg);

    const { id_token } = await trocarCodigo(
      d, { client_id: cfg.client_id, client_secret: segredo },
      code, guardado.verifier, guardado.redirectUri
    );

    const jwksRes = await fetch(d.jwks_uri);
    if (!jwksRes.ok) return falha('não foi possível obter as chaves do IdP');
    const jwks = (await jwksRes.json()) as { keys: any[] };

    const claims = await validarIdToken(id_token, {
      jwks, issuer: cfg.issuer, clientId: cfg.client_id, nonce: guardado.nonce,
    });

    const usuario = await provisionar(c.env, cfg, claims);

    const token = genToken();
    const sessao = {
      id: usuario.id,
      email: usuario.email,
      name: claims.name ?? usuario.email,
      role: usuario.role,
      client_project_id: usuario.client_project_id,
      iat: Date.now(),
    };
    await c.env.SESSIONS.put(`session_${token}`, JSON.stringify(sessao), { expirationTtl: SESSION_TTL_SEC });
    await c.env.SESSIONS.put(token, JSON.stringify(sessao), { expirationTtl: SESSION_TTL_SEC });

    await logAudit(
      c.env.DB, usuario.criado ? 'auth.sso_provisioned' : 'auth.sso_login', usuario.email,
      `Login federado via ${cfg.issuer}${usuario.criado ? ' (conta criada no primeiro acesso)' : ''}`,
      '', '', usuario.client_project_id
    );

    return c.redirect(`/#sso_token=${encodeURIComponent(token)}`, 302);
  } catch (e: any) {
    // A mensagem do erro vai para a TRILHA, não para a URL: ela distingue
    // "assinatura inválida" de "nonce errado", e isso ajuda quem ataca mais do
    // que quem tenta entrar.
    await logAudit(c.env.DB, 'auth.sso_failed', 'anonimo', `Falha no callback de SSO: ${e?.message ?? e}`);
    return falha('falha na autenticação federada');
  }
});
