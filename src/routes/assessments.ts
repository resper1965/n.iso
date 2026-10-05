import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, somenteNess, somenteComercial, ehComercial, erro500 } from '../helpers';
import { validateBody, assessmentCriarSchema, assessmentAtualizarSchema, assessmentPrecoSchema, assessmentRespostasPublicasSchema, assessmentBlocoSchema } from '../schemas';
import { calculatePricing } from '../services/pricing';
import { exigirOrg, ORG_NESS } from '../services/organizacao';
import { BLOCK_QUESTIONS, PHASE_TITLES } from '../constants';

export const assessmentsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Assessment é pré-venda e não tem `project_id`. Sonda: o `org_admin` de um
// cliente lia e renomeava o assessment de outro com 200.
//
// `/public/:token` é a exceção: o token no caminho é a credencial e
// `authMiddleware` já isenta esse prefixo — não há sessão para checar papel,
// e o handler valida o `access_token` por conta própria.
assessmentsApp.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/v1/assessments/public/')) return next();
  // O comercial precisa do assessment para precificar e gerar a proposta —
  // e só disso: por isso entra aqui, e não em `somenteNess` (SSO, SCIM, política).
  if (ehComercial(c.get('user'))) return next();
  return somenteNess(c, next);
});
// Organização da equipe (multiconsultoria): sem ela, 403. As rotas públicas não têm sessão.
assessmentsApp.use('*', (c, next) =>
  c.req.path.startsWith('/api/v1/assessments/public/') ? next() : exigirOrg(c, next));
// Toda rota por id confere a organização ANTES do handler: id de outra organização é 404 (não 403,
// que revelaria a existência). Um lugar só, para nenhuma rota nova esquecer o filtro.
// Os dois caminhos aposentados (410) não tocam dado nenhum: respondem igual para qualquer id.
const APOSENTADAS = /\/(convert|generate-proposal)$/;
const daOrganizacao = async (c: any, next: () => Promise<void>) => {
  const id = c.req.param('id');
  if (id === 'public' || APOSENTADAS.test(c.req.path)) return next();
  const achado = await c.env.DB.prepare('SELECT 1 FROM assessments WHERE id = ? AND org_id = ?').bind(id, c.get('orgId')).first();
  if (!achado) return c.json({ error: 'Assessment não encontrado' }, 404);
  await next();
};
// Preço é do comercial: o papel é conferido ANTES da existência (consultor ouve 403, não 404).
assessmentsApp.use('/:id/pricing', somenteComercial);
assessmentsApp.use('/:id', daOrganizacao);
assessmentsApp.use('/:id/*', daOrganizacao);

/** Preço é do comercial: quem não é, recebe a linha sem nenhuma coluna `pricing_*`. */
function semPreco<T extends Record<string, unknown>>(row: T, user: { role?: string | null } | null | undefined): T {
  if (ehComercial(user)) return row;
  return Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('pricing_'))) as T;
}

/** Traduz respostas do assessment para as chaves esperadas pelo SCORE_MAP */
function mapAnswerToScore(field: string, value: string): string {
  if (!value) return value;
  const maps: Record<string, Record<string, string>> = {
    infraestrutura: {
      'AWS': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Azure': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Google Cloud': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Multi-cloud': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Oracle Cloud': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Cloudflare': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'DigitalOcean': 'Nuvem Pública 100% (AWS/Azure/GCP)',
      'Híbrido': 'Híbrido (Nuvem + On-premise/Legacy)',
      'Híbrido (cloud + on-premise)': 'Híbrido (Nuvem + On-premise/Legacy)',
      'Data center próprio': 'Data Center Local (On-Premise)',
      'On-premises': 'Data Center Local (On-Premise)',
    },
    arquitetura: {
      '1 (produção)': 'Monolitos (VMs/Containers grandes)',
      'Apenas produção': 'Monolitos (VMs/Containers grandes)',
      '2 (staging + prod)': 'Monolitos (VMs/Containers grandes)',
      'Dev + Prod': 'Monolitos (VMs/Containers grandes)',
      '3 (dev + staging + prod)': 'Microsserviços / Cloud Native',
      'Dev + Staging + Prod': 'Microsserviços / Cloud Native',
      '4+ ambientes': 'Microsserviços / Cloud Native',
      'Dev + QA + Staging + Prod': 'Microsserviços / Cloud Native',
    },
    repositorio: {
      'GitHub': 'Git Moderno (GitHub/GitLab)',
      'GitLab': 'Git Moderno (GitHub/GitLab)',
      'Bitbucket': 'Git Moderno (GitHub/GitLab)',
      'Azure DevOps': 'Git Moderno (GitHub/GitLab)',
      'Sem versionamento': 'Sem versionamento formal',
      'Outro': 'Repositórios Legados (SVN/Subversion)',
    },
    deploy: {
      'GitHub Actions': 'CI/CD Automatizado',
      'GitLab CI': 'CI/CD Automatizado',
      'Jenkins': 'CI/CD Automatizado',
      'Pipeline básico (build + test)': 'CI/CD Automatizado',
      'Pipeline completo (build + test + scan + deploy)': 'CI/CD Automatizado',
      'GitOps / deploy automatizado': 'CI/CD Automatizado',
      'Sem CI/CD': 'Deploy Misto ou Manual (FTP/SSH)',
      'Manual (FTP/SSH/SCP)': 'Deploy Misto ou Manual (FTP/SSH)',
      'Inexistente': 'Deploy Misto ou Manual (FTP/SSH)',
      'Manual / ad-hoc': 'Deploy Misto ou Manual (FTP/SSH)',
    },
    seguranca_codigo: {
      'Sim, SAST (Semgrep, SonarQube)': 'Review Rigoroso + Automação (SAST)',
      'SAST (análise estática)': 'Review Rigoroso + Automação (SAST)',
      'Sim, SCA (Snyk, Dependabot)': 'Review Rigoroso + Automação (SAST)',
      'SCA (dependências)': 'Review Rigoroso + Automação (SAST)',
      'DAST (dinâmico)': 'Review Rigoroso + Automação (SAST)',
      'Secret scanning': 'Review Rigoroso + Automação (SAST)',
      'Container scanning': 'Review Rigoroso + Automação (SAST)',
      'IaC scanning': 'Review Rigoroso + Automação (SAST)',
      'Não': 'Sem validação formal',
      'Nenhuma': 'Sem validação formal',
    },
    gestao_identidade: {
      'SSO corporativo (Azure AD, Okta, Google)': 'SSO e MFA Centralizado',
      'SSO implementado': 'SSO e MFA Centralizado',
      'SSO + MFA obrigatório': 'SSO e MFA Centralizado',
      'IdP dedicado (Okta, Auth0, Azure AD)': 'SSO e MFA Centralizado',
      'MFA sem SSO': 'MFA ativo sem SSO',
      'IAM do cloud provider': 'MFA ativo sem SSO',
      'Senhas individuais sem política': 'Senhas isoladas / Sem política estrita',
      'Sem IAM centralizado': 'Senhas isoladas / Sem política estrita',
    },
    continuidade: {
      'Backups automatizados e testados': 'Backups Imutáveis Testados + Vendor Risk',
      'Backup automático com teste de restore': 'Backups Imutáveis Testados + Vendor Risk',
      'Backup + DR documentado e testado': 'Backups Imutáveis Testados + Vendor Risk',
      'Backups automáticos sem teste formal': 'Backups regulares sem testes formais',
      'Backup automático sem teste de restore': 'Backups regulares sem testes formais',
      'Backups manuais': 'Processos de Backup/Terceiros Informais',
      'Backup manual / ocasional': 'Processos de Backup/Terceiros Informais',
      'Sem backup formal': 'Processos de Backup/Terceiros Informais',
      'Sem backup': 'Processos de Backup/Terceiros Informais',
    },
    motivador: {
      'Certificação completa': 'Exigência Contratual/B2B',
      'Gap assessment apenas': 'Auditoria e Segurança Interna',
      'Implementação e certificação': 'Exigência Contratual/B2B',
      'Auditoria interna': 'Auditoria e Segurança Interna',
    },
  };
  const fieldMap = maps[field];
  if (!fieldMap) return value;
  if (value.includes(',')) {
    const parts = value.split(',').map(p => p.trim());
    for (const part of parts) {
      if (fieldMap[part]) return fieldMap[part];
    }
  }
  return fieldMap[value] || value;
}

function buildPricingAnswers(ansMap: Record<string, any>) {
  return {
    ...ansMap,
    scope_type: ansMap['scope_type'] || '',
    headcount: ansMap['headcount'] || ansMap['tech_people'] || '',
  };
}

assessmentsApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, assessmentCriarSchema);
    if (!v.success) return v.response;
    const body = v.data;
    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    if (body.lead_id && !(await c.env.DB.prepare('SELECT 1 FROM leads WHERE id = ? AND org_id = ?').bind(body.lead_id, c.get('orgId')).first())) {
      return c.json({ error: 'Lead não encontrado' }, 404);
    }
    const id = genId();
    const accessToken = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    await c.env.DB.prepare(
      `INSERT INTO assessments (id, lead_id, client_name, status, complexity, access_token, org_id, created_at)
       VALUES (?, ?, ?, 'in_progress', 'unknown', ?, ?, datetime('now'))`
    ).bind(id, body.lead_id || null, body.client_name, accessToken, c.get('orgId')).run();

    if (body.lead_id) {
      await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ? AND org_id = ?').bind('Assessment', body.lead_id, c.get('orgId')).run();
    }

    await logAudit(c.env.DB, 'assessment.created', c.get('user')?.email ?? 'system', `Assessment ${id} criado para ${body.client_name}`);
    return c.json({ id, client_name: body.client_name, lead_id: body.lead_id, status: 'in_progress', access_token: accessToken }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar assessment', e);
  }
});

assessmentsApp.get('/public/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const assessment = await c.env.DB.prepare(
      'SELECT id, client_name, status FROM assessments WHERE access_token = ?'
    ).bind(token).first<any>();
    if (!assessment) return c.json({ error: 'Token invalido' }, 404);
    if (assessment.status === 'converted') return c.json({ error: 'Assessment ja foi convertido' }, 410);

    const { results: answers } = await c.env.DB.prepare(
      'SELECT block, question_key, question, answer, notes FROM assessment_answers WHERE assessment_id = ? ORDER BY block, question_key'
    ).bind(assessment.id).all();

    return c.json({ id: assessment.id, client_name: assessment.client_name, status: assessment.status, answers });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar assessment público', e);
  }
});

assessmentsApp.post('/public/:token/answers', async (c) => {
  try {
    const token = c.req.param('token');
    const assessment = await c.env.DB.prepare(
      'SELECT id, status FROM assessments WHERE access_token = ?'
    ).bind(token).first<any>();
    if (!assessment) return c.json({ error: 'Token invalido' }, 404);
    if (assessment.status === 'converted') return c.json({ error: 'Assessment ja foi convertido' }, 410);

    const v = await validateBody(c, assessmentRespostasPublicasSchema);
    if (!v.success) return v.response;
    const { block, answers } = v.data;

    await c.env.DB.prepare('DELETE FROM assessment_answers WHERE assessment_id = ? AND block = ?').bind(assessment.id, block).run();

    const batch = answers.map(a =>
      c.env.DB.prepare(
        `INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(genId(), assessment.id, block, a.question_key, a.question, a.answer, a.notes || null)
    );
    if (batch.length) await c.env.DB.batch(batch);

    return c.json({ ok: true, saved: batch.length });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar respostas do assessment público', e);
  }
});

assessmentsApp.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE org_id = ? ORDER BY created_at DESC'
    ).bind(c.get('orgId')).all();
    const user = c.get('user');
    return c.json(results.map((r) => semPreco(r, user)));
  } catch (e: any) {
    return erro500(c, 'Falha ao listar assessments', e);
  }
});

assessmentsApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ? AND org_id = ?').bind(id, c.get('orgId')).first();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);

    const progress = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT block) as answered_blocks FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).first<{ answered_blocks: number }>();

    return c.json({
      ...semPreco(assessment, c.get('user')),
      answered_blocks: progress?.answered_blocks ?? 0,
      total_blocks: 10,
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar assessment', e);
  }
});

assessmentsApp.get('/:id/answers', async (c) => {
  try {
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      'SELECT block, question_key, answer, notes FROM assessment_answers WHERE assessment_id = ? ORDER BY block ASC'
    ).bind(id).all();
    return c.json(results);
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar respostas', e);
  }
});

assessmentsApp.get('/:id/block/:num', async (c) => {
  try {
    const id = c.req.param('id');
    const num = parseInt(c.req.param('num'), 10);
    const assessment = await c.env.DB.prepare('SELECT id FROM assessments WHERE id = ?').bind(id).first();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);
    if (num < 1 || num > 10) return c.json({ error: 'Bloco deve ser entre 1 e 10' }, 400);

    const questions = BLOCK_QUESTIONS[num];
    const { results: existing } = await c.env.DB.prepare(
      'SELECT question_key, answer, notes FROM assessment_answers WHERE assessment_id = ? AND block = ?'
    ).bind(id, num).all();

    const answersMap = new Map((existing ?? []).map((r: any) => [r.question_key, { answer: r.answer, notes: r.notes }]));

    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      answer: answersMap.get(q.key)?.answer ?? null,
      notes: answersMap.get(q.key)?.notes ?? null,
    }));

    return c.json({ block: num, questions: questionsWithAnswers });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar bloco', e);
  }
});

assessmentsApp.post('/:id/block/:num', async (c) => {
  try {
    const id = c.req.param('id');
    const num = parseInt(c.req.param('num'), 10);
    const assessment = await c.env.DB.prepare('SELECT id, status FROM assessments WHERE id = ?').bind(id).first();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);
    if (num < 1 || num > 10) return c.json({ error: 'Bloco deve ser entre 1 e 10' }, 400);

    const v = await validateBody(c, assessmentBlocoSchema);
    if (!v.success) return v.response;
    const body = v.data;

    await c.env.DB.prepare('DELETE FROM assessment_answers WHERE assessment_id = ? AND block = ?').bind(id, num).run();

    const stmt = c.env.DB.prepare(
      `INSERT INTO assessment_answers
         (id, assessment_id, block, question_key, question, answer, complexity_impact, gap_detected, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const batch = body.answers.map((a) =>
      stmt.bind(genId(), id, num, a.question_key, a.question, a.answer, a.complexity_impact ?? null, a.gap_detected ?? 0, a.notes ?? null)
    );

    await c.env.DB.batch(batch);
    await logAudit(c.env.DB, 'assessment.block_saved', c.get('user')?.email ?? 'system', `Bloco ${num} salvo para assessment ${id} (${body.answers.length} respostas)`);

    return c.json({ ok: true, block: num, saved: body.answers.length });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar respostas', e);
  }
});

// Preço do assessment é ato comercial, como gerar a proposta abaixo.
assessmentsApp.get('/:id/pricing', somenteComercial, async (c) => {
  try {
    const id = c.req.param('id');
    const { results: answers } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).all<{ question_key: string; answer: string }>();

    if (!answers || answers.length === 0) {
      return c.json({ error: 'Sem respostas para precificar' }, 400);
    }

    const ansMap: Record<string, any> = {};
    for (const a of answers) ansMap[a.question_key] = a.answer;

    const pricingAnswers = buildPricingAnswers(ansMap);
    // `settings.pricing_config` é a tabela antiga da ness. (global): outra organização calcula com o padrão.
    const configRow = c.get('orgId') === ORG_NESS
      ? await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>()
      : null;
    const configOverrides = configRow ? JSON.parse(configRow.value) : undefined;
    const pricing = calculatePricing(pricingAnswers, configOverrides);
    return c.json(pricing);
  } catch (e: any) {
    return erro500(c, 'Falha na precificação', e);
  }
});

assessmentsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const v = await validateBody(c, assessmentAtualizarSchema);
    if (!v.success) return v.response;
    const body = v.data;
    const updates: string[] = [];
    const values: any[] = [];
    if (body.status) { updates.push('status = ?'); values.push(body.status); }
    if (body.client_name) { updates.push('client_name = ?'); values.push(body.client_name); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`).bind(...values, c.get('orgId')).run();
    await logAudit(c.env.DB, 'assessment.updated', c.get('user')?.email ?? 'system', `Assessment ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar assessment', e);
  }
});

assessmentsApp.put('/:id/pricing', somenteComercial, async (c) => {
  try {
    const id = c.req.param('id');
    const v = await validateBody(c, assessmentPrecoSchema);
    if (!v.success) return v.response;
    const body = v.data;
    const updates: string[] = [];
    const values: any[] = [];
    if (body.precoFinal !== undefined) { updates.push('pricing_override = ?'); values.push(body.precoFinal || null); }
    if (body.desconto !== undefined) { updates.push('pricing_desconto = ?'); values.push(body.desconto || null); }
    if (body.notas !== undefined) { updates.push('pricing_notas = ?'); values.push(body.notas || null); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`).bind(...values, c.get('orgId')).run();
    await logAudit(c.env.DB, 'assessment.pricing_override', c.get('user')?.email ?? 'system', `Pricing ajustado no assessment ${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao ajustar precificação do assessment', e);
  }
});

// O gerador antigo (tabela proposals, preço por tier) deu lugar à tela Propostas (fatia 3/4).
assessmentsApp.post('/:id/generate-proposal', (c) =>
  c.json({ error: 'O gerador antigo foi substituído pela tela Propostas' }, 410));

// O projeto nasce do aceite da proposta (fecharVenda); este caminho criava projeto em dobro.
assessmentsApp.post('/:id/convert', (c) =>
  c.json({ error: 'Converter levantamento em projeto foi substituído pelo aceite da proposta (tela Propostas)' }, 410));
