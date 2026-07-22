import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { authMiddleware } from './middleware/auth';
import { authApp } from './routes/auth';
import { usersApp } from './routes/users';
import { leadsApp } from './routes/leads';
import { proposalsApp } from './routes/proposals';
import { assessmentsApp } from './routes/assessments';
import { projectsApp, controlsApp } from './routes/projects';
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


import risks from './routes/risks';
import policies from './routes/policies';
import integrations from './routes/integrations';

export type Bindings = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  VECTOR_INDEX: VectorizeIndex;
  STORAGE: R2Bucket;
  AI: any;
  SETUP_KEY?: string;
  ENVIRONMENT?: string;
  ASSETS?: any;
};

export type Variables = {
  user: {
    id: string;
    email: string;
    name?: string;
    role: string;
    client_lead_id?: string | null;
    client_project_id?: string | null;
  };
};


const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 1. CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
}));

// 2. Health check (público)
app.get('/health', (c) => c.json({ status: 'ok' }));

// 3. Auth sub-router (público)
app.route('/api/v1/auth', authApp);

// 4. Public sub-router (público)
app.route('/api/v1/public', publicApp);

// 5. Auth Middleware para demais rotas /api/v1
app.use('/api/v1/*', authMiddleware);

// 6. Sub-rotas montadas
app.route('/api/v1/users', usersApp);
app.route('/api/v1/admin/users', usersApp);

app.route('/api/v1/leads', leadsApp);
app.route('/api/v1/proposals', proposalsApp);
app.route('/api/v1/assessments', assessmentsApp);
app.route('/api/v1/projects', projectsApp);
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

app.route('/api/v1/certification', certificationsApp);
app.route('/api/v1/projects/:projectId/certification', projectCertificationsApp);

app.route('/api/v1', aiApp);
app.route('/api/v1', governanceApp);
app.route('/api/v1', auditorApp);
app.route('/api/v1', platformApp);


app.route('', risks);
app.route('', policies);
app.route('', integrations);

// 7. Static Files Fallback (catch-all — deve ser a última rota)
app.get('/*', async (c) => {
  const path = new URL(c.req.url).pathname;
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

export default app;
