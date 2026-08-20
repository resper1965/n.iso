import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { authMiddleware } from './middleware/auth';
import { projectAccessMiddleware } from './middleware/project-access';
import { log, requestId, metrica, resumoErro } from './observability';
import { queryCapMiddleware } from './middleware/query-cap';
import { bodyGuard } from './middleware/body-guard';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { authApp } from './routes/auth';
import { usersApp } from './routes/users';
import { leadsApp } from './routes/leads';
import { proposalsApp } from './routes/proposals';
import { assessmentsApp } from './routes/assessments';
import { projectsApp } from './routes/projects';
import { controlsApp } from './routes/controls';
import { evidenceApp, projectEvidenceApp } from './routes/evidence';
import { vendorsApp, projectVendorsApp } from './routes/vendors';
import { trainingApp, projectTrainingApp } from './routes/training';
import { ropaApp, projectRopaApp } from './routes/ropa';
import { auditsApp, projectAuditsApp } from './routes/audits';
import { capaApp, projectCapaApp } from './routes/capa';
import { certificationsApp, projectCertificationsApp } from './routes/certifications';
import { publicApp } from './routes/public';
import { aiApp } from './routes/ai';
import { governanceApp } from './routes/governance';
import { auditorApp } from './routes/auditor';
import { platformApp } from './routes/platform';
import { mfaApp } from './routes/mfa';
import { dataSubjectApp } from './routes/data-subject';


import { readinessApp } from './routes/readiness';
import { phaseQuestionsApp, projectPhaseAnswersApp } from './routes/phase-questionnaire';
import { journeyDossierApp } from './routes/journey-dossier';
import { controlAdequacaoApp } from './routes/control-adequacao';
import risks from './routes/risks';
import policies from './routes/policies';
import integrations from './routes/integrations';

export type Bindings = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  VECTOR_INDEX: VectorizeIndex;
  STORAGE: R2Bucket;
  AI: Ai;
  SETUP_KEY?: string;
  /** Chave para cifrar segredos em repouso (repository_token). Secret:
   *  `npx wrangler secret put TOKEN_ENC_KEY`. Sem ela, tokens são gravados em
   *  texto claro (fallback legado) — configure em produção. */
  TOKEN_ENC_KEY?: string;
  ENVIRONMENT?: string;
  ASSETS?: Fetcher;
  /** Conta/gateway do AI Gateway (opcionais: há default em agents/types.ts).
   *  Os agentes roteiam pelo binding (env.AI.run + gateway n-iso) — sem secret;
   *  GPT-4.1 usa Unified Billing. Só troque se a conta/gateway mudar. */
  CF_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  RESEND_API_KEY?: string;
  /** Analytics Engine. Opcional: sem o binding, a métrica é ignorada. */
  ANALYTICS?: AnalyticsEngineDataset;
};

export type Variables = {
  /** Token bruto da sessão, para que /auth/mfa/verify reescreva a própria sessão. */
  sessionId?: string;
  /** Correlaciona log de acesso e log de erro da mesma requisição. */
  requestId?: string;
  user: {
    id: string;
    email: string;
    name?: string;
    role: string;
    client_lead_id?: string | null;
    client_project_id?: string | null;
    /** Sessão autenticada por senha mas ainda sem o segundo fator. */
    mfa_pending?: boolean;
    /** Instante de emissão, usado para revogação. */
    iat?: number;
  };
};


const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 0. Cabecalhos de seguranca. Vem antes de tudo para valer inclusive nos erros
// e no catch-all estatico. O middleware ja aplica por padrao nosniff,
// X-Frame-Options, Referrer-Policy e Cross-Origin-*; abaixo so o que diverge.
app.use('*', secureHeaders({
  // 1 ano, o minimo exigido para elegibilidade a lista de preload do HSTS.
  // Nao emitimos a diretiva `preload`: entrar na lista e um caminho so de ida
  // (remocao leva meses) e e decisao de quem opera o dominio, nao do codigo.
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',

  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    // ponytail: 'unsafe-inline' em script-src e uma concessao real, nao um
    // descuido. O frontend tem ~324 handlers `onclick=` inline; sem ela a
    // aplicacao inteira para. Com ela, o CSP NAO protege contra XSS injetado —
    // as diretivas abaixo e que entregam valor hoje. Caminho de upgrade:
    // migrar os onclick para addEventListener e trocar por nonce.
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    // Estas valem mesmo com 'unsafe-inline': fecham injecao de <base>, de
    // plugin, exfiltracao por <form action> e clickjacking por iframe.
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
}));

// 0b. security.txt (RFC 9116). `Expires` e calculado, nao fixo: arquivo com data
// vencida e o modo de falha classico aqui, e ninguem lembra de renovar.
app.get('/.well-known/security.txt', (c) => {
  const expira = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return c.text(
    [
      'Contact: mailto:security@ness.lat',
      'Contact: https://github.com/resper1965/nISO/security/advisories/new',
      `Expires: ${expira}`,
      'Preferred-Languages: pt-BR, en',
      'Canonical: https://niso.ness.workers.dev/.well-known/security.txt',
      'Policy: https://github.com/resper1965/nISO/blob/main/SECURITY.md',
      '',
    ].join('\n'),
    200,
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  );
});

// 1. CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
}));

// 1b. Log de acesso estruturado. Uma linha JSON por requisição, filtrável no
// `wrangler tail` — antes não havia nenhuma, e o erro só aparecia quando o
// cliente ligava. Nunca inclui corpo nem valor de campo (PII sob LGPD).
app.use('*', async (c, next) => {
  const inicio = Date.now();
  const rid = requestId(c);
  c.set('requestId', rid);
  await next();
  const duracao = Date.now() - inicio;
  const rota = new URL(c.req.url).pathname;
  const nivel = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info';
  log(nivel, {
    msg: 'request',
    request_id: rid,
    metodo: c.req.method,
    rota,
    status: c.res.status,
    duracao_ms: duracao,
    ator: c.get('user')?.email,
  });
  metrica(c.env, [String(c.res.status)], [c.req.method, rota], [duracao]);
});

// 2. Health check (público)
app.get('/health', (c) => c.json({ status: 'ok' }));

// 2c. Teto automático de linhas em SELECT sem LIMIT. Antes de tudo que consulta.
app.use('*', queryCapMiddleware);
// 2b. Guarda genérica de corpo: teto de 1 MB, recusa corpo que não é objeto e
// bloqueia poluição de protótipo. Vem antes do auth para valer também no login.
app.use('*', bodyGuard);

// 3. Auth sub-router (público)
app.route('/api/v1/auth', authApp);

// 4. Public sub-router (público)
app.route('/api/v1/public', publicApp);

// 5. Auth Middleware para demais rotas /api/v1
app.use('/api/v1/*', authMiddleware);

// 5b. Isolamento multi-tenant: reforça acesso ao projeto em rotas com escopo de projeto
app.use('/api/v1/projects/:projectId/*', projectAccessMiddleware);

// 5c. Rate limit das rotas caras (IA, upload, export). Depois do authMiddleware
// porque o limite é por usuário, não por IP.
app.use('/api/v1/*', rateLimitMiddleware);

// 6. Sub-rotas montadas
app.route('/api/v1/users', usersApp);
app.route('/api/v1/admin/users', usersApp);

// MFA fica DEPOIS do authMiddleware: exige sessão de senha já estabelecida.
app.route('/api/v1/auth/mfa', mfaApp);

app.route('/api/v1/leads', leadsApp);
app.route('/api/v1/proposals', proposalsApp);
app.route('/api/v1/assessments', assessmentsApp);
app.route('/api/v1/projects', projectsApp);
app.route('/api/v1/projects/:projectId/readiness-check', readinessApp);
app.route('/api/v1/phase-questions', phaseQuestionsApp);
app.route('/api/v1/projects/:projectId/phase-answers', projectPhaseAnswersApp);
app.route('/api/v1/projects/:projectId/journey-dossier', journeyDossierApp);
app.route('/api/v1/projects/:projectId/control-adequacao', controlAdequacaoApp);
app.route('/api/v1/controls', controlsApp);

app.route('/api/v1/evidence', evidenceApp);
app.route('/api/v1/projects/:projectId/evidence', projectEvidenceApp);

app.route('/api/v1/vendors', vendorsApp);
app.route('/api/v1/projects/:projectId/vendors', projectVendorsApp);

app.route('/api/v1/training', trainingApp);
app.route('/api/v1/projects/:projectId/training', projectTrainingApp);

app.route('/api/v1/ropa', ropaApp);
app.route('/api/v1/projects/:projectId/ropa', projectRopaApp);

app.route('/api/v1/audits', auditsApp);
app.route('/api/v1/projects/:projectId/audits', projectAuditsApp);

app.route('/api/v1/capa', capaApp);
app.route('/api/v1/projects/:projectId/capa', projectCapaApp);

app.route('/api/v1/projects/:projectId/data-subject', dataSubjectApp);

app.route('/api/v1/certification', certificationsApp);
app.route('/api/v1/projects/:projectId/certification', projectCertificationsApp);

app.route('/api/v1', aiApp);
app.route('/api/v1', governanceApp);
app.route('/api/v1', auditorApp);
app.route('/api/v1', platformApp);


app.route('', risks);
app.route('', policies);
app.route('', integrations);

// 7. Static Files Fallback (catch-all — deve ser a última rota).
// `dist/index.html` é a landing pública; `dist/login.html` é o shell do app
// (login + SPA). Rota desconhecida cai na landing (fallback abaixo), não no
// login — mostrar a home pública para link quebrado é mais correto que
// derrubar em uma tela de autenticação sem contexto.
app.get('/*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) {
    return c.json({ error: `API route not found: ${path}` }, 404);
  }
  if (path.includes('.') && !path.endsWith('.html')) {
    if (c.env.ASSETS) {
      return await c.env.ASSETS.fetch(c.req.raw);
    }
    return c.text('Not found', 404);
  }
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404) {
      const fallbackRequest = new Request(new URL('/', c.req.url).toString());
      return await c.env.ASSETS.fetch(fallbackRequest);
    }
    return res;
  }
  return c.text('Not found', 404);
});

// 8. Handler de erro global: garante corpo JSON consistente em erros não capturados
// e evita vazar detalhes internos ao cliente (o detalhe só é incluído se ENVIRONMENT for EXPLICITAMENTE 'development' ou 'test').
app.onError((err, c) => {
  // Tudo aqui é defensivo de propósito: um handler de erro que estoura
  // substitui um 500 informativo por um erro sem corpo. O contexto pode estar
  // incompleto justamente porque a falha aconteceu cedo.
  try {
    log('error', {
      msg: 'erro_nao_tratado',
      request_id: (c as any).get?.('requestId'),
      metodo: c.req?.method,
      rota: c.req?.url ? new URL(c.req.url).pathname : undefined,
      ator: (c as any).get?.('user')?.email,
      erro: resumoErro(err),
    });
  } catch {
    console.error('[nISO] erro nao tratado (log estruturado indisponivel):', resumoErro(err));
  }
  const isDevOrTest = c.env?.ENVIRONMENT === 'development' || c.env?.ENVIRONMENT === 'test';
  const detail = isDevOrTest ? (err as Error).message : undefined;
  return c.json({ error: 'Erro interno do servidor', ...(detail ? { detail } : {}) }, 500);
});

export default app;
