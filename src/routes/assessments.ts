import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, createNotification, escapeHtml } from '../helpers';
import { calculatePricing } from '../services/pricing';
import { BLOCK_QUESTIONS, PHASE_TITLES } from '../constants';

export const assessmentsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

async function seedPhasesLocal(db: D1Database, projectId: string) {
  const phaseStmt = db.prepare(
    `INSERT INTO project_phases (id, project_id, phase_number, title, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, '', datetime('now'))`
  );
  const evidenceStmt = db.prepare(
    `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, created_at)
     VALUES (?, ?, ?, 'pending_upload', 'none', 'system', datetime('now'))`
  );
  const batch: any[] = [];
  PHASE_TITLES.forEach((title, i) => {
    const status = i === 0 ? 'in_progress' : 'pending';
    batch.push(phaseStmt.bind(genId(), projectId, i, title, status));
  });
  await db.batch(batch);
}

assessmentsApp.post('/', async (c) => {
  try {
    const body = await c.req.json<{ client_name: string; lead_id?: string }>();
    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    const id = genId();
    const accessToken = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    await c.env.DB.prepare(
      `INSERT INTO assessments (id, lead_id, client_name, status, complexity, access_token, created_at)
       VALUES (?, ?, ?, 'in_progress', 'unknown', ?, datetime('now'))`
    ).bind(id, body.lead_id || null, body.client_name, accessToken).run();

    if (body.lead_id) {
      await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind('Assessment', body.lead_id).run();
    }

    await logAudit(c.env.DB, 'assessment.created', c.get('user')?.email ?? 'system', `Assessment ${id} criado para ${body.client_name}`);
    return c.json({ id, client_name: body.client_name, lead_id: body.lead_id, status: 'in_progress', access_token: accessToken }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar assessment', detail: e.message }, 500);
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
    return c.json({ error: e.message }, 500);
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

    const { block, answers } = await c.req.json<{ block: number; answers: Array<{ question_key: string; question: string; answer: string; notes?: string }> }>();
    if (!Array.isArray(answers) || block === undefined) return c.json({ error: 'block and answers required' }, 400);

    await c.env.DB.prepare('DELETE FROM assessment_answers WHERE assessment_id = ? AND block = ?').bind(assessment.id, block).run();

    const batch = answers.map(a =>
      c.env.DB.prepare(
        `INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(genId(), assessment.id, block, a.question_key, a.question, a.answer, a.notes || null)
    );
    if (batch.length) await c.env.DB.batch(batch);

    return c.json({ ok: true, saved: batch.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

assessmentsApp.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM assessments ORDER BY created_at DESC'
    ).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar assessments', detail: e.message }, 500);
  }
});

assessmentsApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);

    const progress = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT block) as answered_blocks FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).first<{ answered_blocks: number }>();

    return c.json({
      ...assessment,
      answered_blocks: progress?.answered_blocks ?? 0,
      total_blocks: 10,
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao buscar assessment', detail: e.message }, 500);
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
    return c.json({ error: 'Falha ao buscar respostas', detail: e.message }, 500);
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
    return c.json({ error: 'Falha ao buscar bloco', detail: e.message }, 500);
  }
});

assessmentsApp.post('/:id/block/:num', async (c) => {
  try {
    const id = c.req.param('id');
    const num = parseInt(c.req.param('num'), 10);
    const assessment = await c.env.DB.prepare('SELECT id, status FROM assessments WHERE id = ?').bind(id).first();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);
    if (num < 1 || num > 10) return c.json({ error: 'Bloco deve ser entre 1 e 10' }, 400);

    const body = await c.req.json<{
      answers: Array<{
        question_key: string;
        question: string;
        answer: string;
        complexity_impact?: string;
        gap_detected?: number;
        notes?: string;
      }>;
    }>();

    if (!body.answers || !Array.isArray(body.answers)) {
      return c.json({ error: 'answers (array) é obrigatório' }, 400);
    }

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
    return c.json({ error: 'Falha ao salvar respostas', detail: e.message }, 500);
  }
});

assessmentsApp.get('/:id/pricing', async (c) => {
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
    const configRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const configOverrides = configRow ? JSON.parse(configRow.value) : undefined;
    const pricing = calculatePricing(pricingAnswers, configOverrides);
    return c.json(pricing);
  } catch (e: any) {
    return c.json({ error: 'Falha na precificação', detail: e.message }, 500);
  }
});

assessmentsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ status?: string; client_name?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.status) { updates.push('status = ?'); values.push(body.status); }
    if (body.client_name) { updates.push('client_name = ?'); values.push(body.client_name); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'assessment.updated', c.get('user')?.email ?? 'system', `Assessment ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

assessmentsApp.put('/:id/pricing', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ precoFinal?: number; desconto?: number; notas?: string }>();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.precoFinal !== undefined) { updates.push('pricing_override = ?'); values.push(body.precoFinal || null); }
    if (body.desconto !== undefined) { updates.push('pricing_desconto = ?'); values.push(body.desconto || null); }
    if (body.notas !== undefined) { updates.push('pricing_notas = ?'); values.push(body.notas || null); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'assessment.pricing_override', c.get('user')?.email ?? 'system', `Pricing ajustado no assessment ${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

assessmentsApp.post('/:id/generate-proposal', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first<any>();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);

    const { results: answers } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).all<{ question_key: string; answer: string }>();

    const ansMap: Record<string, any> = {};
    for (const a of (answers || [])) ansMap[a.question_key] = a.answer;

    const pricingAnswers = buildPricingAnswers(ansMap);
    const configRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const configOverrides = configRow ? JSON.parse(configRow.value) : undefined;
    const pricing = calculatePricing(pricingAnswers, configOverrides);

    if (assessment.pricing_override) {
      pricing.precoFinal = assessment.pricing_override;
      const total = pricing.fases.reduce((a: number, f: any) => a + (f.valorFase || 0), 0);
      if (total > 0) pricing.fases.forEach((f: any) => { f.valorFase = Math.round((f.valorFase || 0) / total * pricing.precoFinal); });
    } else if (assessment.pricing_desconto && assessment.pricing_desconto > 0) {
      const factor = 1 - (assessment.pricing_desconto / 100);
      pricing.precoFinal = Math.ceil(pricing.precoFinal * factor / 1000) * 1000;
      pricing.fases.forEach((f: any) => { f.valorFase = Math.round((f.valorFase || 0) * factor); });
    }

    const clientName = assessment.client_name || 'Cliente';
    const now = new Date().toLocaleDateString('pt-BR');
    const body = await c.req.json().catch(() => ({}));
    const meta = {
      proposalNum: body.proposalNum || `PROP-${new Date().getFullYear()}-${Math.floor(Math.random()*900)+100}`,
      validade: body.validade || '30',
      razaoSocial: body.razaoSocial || clientName,
      cnpj: body.cnpj || '',
      respCliente: body.respCliente || '',
      cargoCliente: body.cargoCliente || '',
      respNess: body.respNess || 'ness.',
      cargoNess: body.cargoNess || 'Lead Consultant',
      condicaoPagamento: body.condicaoPagamento || '40/30/30',
      observacoes: body.observacoes || ''
    };

    const proposalId = genId();
    const contentHtml = `<p>Proposta ${escapeHtml(meta.proposalNum)} para ${escapeHtml(meta.razaoSocial)}</p>`; // HTML proposal template
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, content_html, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Draft', datetime('now'))`
    ).bind(proposalId, assessment.lead_id, id, contentHtml, pricing.precoFinal).run();

    await logAudit(c.env.DB, 'proposal.generated', user?.email ?? 'system', `Proposta ${proposalId} gerada automaticamente do assessment ${id}.`);
    await createNotification(c.env.DB, 'proposal_ready', `Proposta gerada: ${clientName}`, `Tier ${pricing.tier.name}`, user?.id, `/proposals/${proposalId}`);

    return c.json({ ok: true, proposal_id: proposalId, proposal_num: meta.proposalNum, tier: pricing.tier.name, preco: pricing.precoFinal, html: contentHtml });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar proposta', detail: e.message }, 500);
  }
});

assessmentsApp.post('/:id/convert', async (c) => {
  try {
    const id = c.req.param('id');
    const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first<any>();
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);
    if (assessment.converted_project_id) return c.json({ error: 'Assessment já foi convertido', project_id: assessment.converted_project_id }, 409);

    const { results: answers } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).all<{ question_key: string; answer: string }>();

    const answerMap = new Map((answers ?? []).map((a) => [a.question_key, a.answer]));
    const projectId = genId();
    const sector = answerMap.get('sector') ?? '';
    const scope = answerMap.get('scope_type') ?? '';
    const standards = answerMap.get('target_standard') ?? 'ISO 27001';
    const orgRole = answerMap.get('data_role') ?? '';

    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'))`
    ).bind(projectId, assessment.client_name, sector, scope, standards, orgRole, id).run();

    await seedPhasesLocal(c.env.DB, projectId);

    await c.env.DB.prepare(
      `UPDATE assessments SET status = 'converted', converted_project_id = ?, completed_at = datetime('now') WHERE id = ?`
    ).bind(projectId, id).run();

    await logAudit(c.env.DB, 'assessment.converted', c.get('user')?.email ?? 'system', `Assessment ${id} convertido em projeto ${projectId}`);
    return c.json({ ok: true, project_id: projectId }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao converter assessment', detail: e.message }, 500);
  }
});
