import { Hono } from 'hono';
import { Bindings } from '../index';
import { logAudit, genNumericCode, erro500, sendEmail, escapeHtml, rateLimit } from '../helpers';

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
    const { project_id, name, email } = await c.req.json();
    if (!project_id || !email) {
      return c.json({ error: 'Projeto e E-mail são obrigatórios' }, 400);
    }
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
    const { project_id, email, otp } = await c.req.json();
    if (!project_id || !email || !otp) {
      return c.json({ error: 'Projeto, E-mail e Código OTP são obrigatórios' }, 400);
    }
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
    const { policy_type, user_name, user_email } = await c.req.json();
    if (!policy_type) return c.json({ error: 'Tipo/Nome da Política é obrigatório' }, 400);

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
