import { Hono } from 'hono';
import { seedPhases } from '../services/project-setup';
import { Bindings, Variables } from '../index';
import { genId, logAudit, createNotification, escapeHtml, somenteMsp, erro500, hidrataEscopo, resolveCliente, linhaDoFunilDaConta, AtorAutorizado } from '../helpers';
import { calculatePricing } from '../services/pricing';
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
  return somenteMsp(c, next);
});

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
    const body = await c.req.json<{ client_name: string; lead_id?: string }>();
    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    const operador = c.get('user') as AtorAutorizado | undefined;
    await hidrataEscopo(c.env.DB, c.get('user') ?? {});

    // Você só opera o funil da SUA conta. Antes desta correção, a criação em
    // si era permissiva de propósito (atribuía certo, mas deixava passar) —
    // e isso produzia um registro que o próprio criador não conseguia depois
    // operar: `/convert` e `/sign` já recusam (404) quem não é da conta de
    // origem, então um assessment criado sobre lead alheio nascia poluindo a
    // carteira do concorrente com o próximo passo travado. Fechado: lead de
    // OUTRA conta responde 404 (não 403 — confirmaria a existência do lead na
    // consultoria concorrente), com as MESMAS duas exceções que sempre
    // valeram para a regra de atribuição (Ruling 14, que continua viva, só
    // deixa de ser exercida por operador alheio):
    //   - `platform_admin`, o único papel global;
    //   - lead SEM DONO (`conta_id` nulo) — cai no operador, que é o
    //     fallback da própria fórmula de atribuição logo abaixo.
    const lead = body.lead_id
      ? await c.env.DB.prepare('SELECT conta_id FROM leads WHERE id = ?').bind(body.lead_id).first<{ conta_id: string | null }>()
      : null;
    if (
      body.lead_id && lead &&
      operador?.role !== 'platform_admin' &&
      lead.conta_id !== null &&
      lead.conta_id !== (operador?.conta_id ?? null)
    ) {
      return c.json({ error: 'Lead não encontrado' }, 404);
    }

    const id = genId();
    const accessToken = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const contaId = lead?.conta_id ?? (operador?.conta_id ?? null);
    await c.env.DB.prepare(
      `INSERT INTO assessments (id, lead_id, client_name, status, complexity, access_token, conta_id, created_at)
       VALUES (?, ?, ?, 'in_progress', 'unknown', ?, ?, datetime('now'))`
    ).bind(id, body.lead_id || null, body.client_name, accessToken, contaId).run();

    if (body.lead_id) {
      await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind('Assessment', body.lead_id).run();
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
    return erro500(c, 'Falha ao salvar respostas do assessment público', e);
  }
});

assessmentsApp.get('/', async (c) => {
  try {
    const user = c.get('user') as AtorAutorizado | undefined;
    const contaId = user?.role === 'platform_admin' ? null : (user?.conta_id ?? null);
    const { results } = contaId
      ? await c.env.DB.prepare('SELECT * FROM assessments WHERE conta_id = ? ORDER BY created_at DESC').bind(contaId).all()
      : await c.env.DB.prepare('SELECT * FROM assessments ORDER BY created_at DESC').all();
    // `conta_id` é escopo de tenancy interno, não campo de produto — fora da
    // listagem pela mesma razão de `GET /:id`.
    return c.json((results as any[]).map(({ conta_id, ...assessment }) => assessment));
  } catch (e: any) {
    return erro500(c, 'Falha ao listar assessments', e);
  }
});

assessmentsApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, c.get('user') as AtorAutorizado | undefined);
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);

    const progress = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT block) as answered_blocks FROM assessment_answers WHERE assessment_id = ?'
    ).bind(id).first<{ answered_blocks: number }>();

    // `conta_id` é escopo de tenancy interno, não campo de produto — fora da
    // resposta pela mesma razão de `GET /leads/:id` e `GET /proposals/:id`.
    const { conta_id, ...assessmentSemConta } = assessment;
    return c.json({
      ...assessmentSemConta,
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
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, c.get('user') as AtorAutorizado | undefined);
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);
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
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, c.get('user') as AtorAutorizado | undefined);
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
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, c.get('user') as AtorAutorizado | undefined);
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
    return erro500(c, 'Falha ao salvar respostas', e);
  }
});

assessmentsApp.get('/:id/pricing', async (c) => {
  try {
    const id = c.req.param('id');
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, c.get('user') as AtorAutorizado | undefined);
    if (!assessment) return c.json({ error: 'Assessment não encontrado' }, 404);
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
    return erro500(c, 'Falha na precificação', e);
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
    const user = c.get('user') as AtorAutorizado | undefined;
    values.push(id);
    let sql = `UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`;
    if (user?.role !== 'platform_admin') { sql += ' AND conta_id = ?'; values.push(user?.conta_id ?? null); }
    await c.env.DB.prepare(sql).bind(...values).run();
    await logAudit(c.env.DB, 'assessment.updated', c.get('user')?.email ?? 'system', `Assessment ${id} atualizado: ${updates.join(', ')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar assessment', e);
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
    const user = c.get('user') as AtorAutorizado | undefined;
    values.push(id);
    let sql = `UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`;
    if (user?.role !== 'platform_admin') { sql += ' AND conta_id = ?'; values.push(user?.conta_id ?? null); }
    await c.env.DB.prepare(sql).bind(...values).run();
    await logAudit(c.env.DB, 'assessment.pricing_override', c.get('user')?.email ?? 'system', `Pricing ajustado no assessment ${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao ajustar precificação do assessment', e);
  }
});

assessmentsApp.post('/:id/generate-proposal', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    // O operador tem de ser da MESMA conta que vendeu (ou `platform_admin`).
    // A Task 6 acertou a ATRIBUIÇÃO — a proposta gerada nasce na conta que
    // vendeu o assessment, nunca na do operador —, mas atribuição correta não
    // consertava a MUTAÇÃO em si: sem este gate, staff de outra consultoria
    // gerava proposta (preço, HTML) a partir do questionário alheio. Alheio
    // responde como inexistente, não 403: dizer 403 confirmaria a existência
    // do assessment na consultoria concorrente.
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, user as AtorAutorizado | undefined);
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
    // A proposta herda a conta de quem vendeu o assessment que a origina. Sem
    // isso, /sign teria só o operador de então como fonte de conta.
    await hidrataEscopo(c.env.DB, user ?? {});
    const contaId = assessment.conta_id ?? (user as AtorAutorizado | undefined)?.conta_id ?? null;
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, content_html, total_price, status, conta_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'Draft', ?, datetime('now'))`
    ).bind(proposalId, assessment.lead_id, id, contentHtml, pricing.precoFinal, contaId).run();

    await logAudit(c.env.DB, 'proposal.generated', user?.email ?? 'system', `Proposta ${proposalId} gerada automaticamente do assessment ${id}.`);
    await createNotification(c.env.DB, 'proposal_ready', `Proposta gerada: ${clientName}`, `Tier ${pricing.tier.name}`, user?.id, `/proposals/${proposalId}`);

    return c.json({ ok: true, proposal_id: proposalId, proposal_num: meta.proposalNum, tier: pricing.tier.name, preco: pricing.precoFinal, html: contentHtml });
  } catch (e: any) {
    return erro500(c, 'Falha ao gerar proposta', e);
  }
});

assessmentsApp.post('/:id/convert', async (c) => {
  try {
    const id = c.req.param('id');
    // Mesmo gate de `/generate-proposal` acima, e pela mesma razão: `/convert`
    // MUTA o assessment (`status = 'converted'`) e materializa cliente e
    // projeto — a atribuição da Task 6 garante que o projeto nasce na conta
    // que vendeu, mas não impedia um staff de OUTRA consultoria de disparar
    // essa mutação irreversível sobre o funil alheio. Alheio responde 404,
    // não 403 (mesma razão de sempre: 403 confirmaria a existência do
    // registro na consultoria concorrente).
    const assessment = await linhaDoFunilDaConta(c.env.DB, 'assessments', id, c.get('user') as AtorAutorizado | undefined);
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

    // A conta é a de quem CONDUZIU A VENDA, não a de quem clicou em converter:
    // este roteador não garante que o operador pertence à conta de origem
    // (`somenteMsp` exige papel de staff e conta tipo `msp`, mas não que seja
    // A MESMA conta da origem), então usuário primeiro materializaria a venda
    // de uma consultoria na carteira de outra. Origem primeiro; usuário só
    // entra quando a origem não tem conta gravada (assessment anterior à
    // Task 6 / migration 0031).
    await hidrataEscopo(c.env.DB, c.get('user') ?? {});
    const contaId = assessment.conta_id ?? (c.get('user') as AtorAutorizado | undefined)?.conta_id ?? null;
    if (!contaId) {
      return c.json({ error: 'conta_id é obrigatório para quem não é staff de uma conta' }, 400);
    }
    // CNPJ mora no lead (a um join de distância), não no assessment.
    const leadDoAssessment = assessment.lead_id
      ? await c.env.DB.prepare('SELECT cnpj FROM leads WHERE id = ?').bind(assessment.lead_id).first<{ cnpj: string | null }>()
      : null;
    const clienteId = await resolveCliente(c.env.DB, contaId, assessment.client_name, leadDoAssessment?.cnpj);

    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, cliente_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'))`
    ).bind(projectId, assessment.client_name, sector, scope, standards, orgRole, id, clienteId).run();

    await seedPhases(c.env.DB, projectId);

    await c.env.DB.prepare(
      `UPDATE assessments SET status = 'converted', converted_project_id = ?, completed_at = datetime('now') WHERE id = ?`
    ).bind(projectId, id).run();

    await logAudit(c.env.DB, 'assessment.converted', c.get('user')?.email ?? 'system', `Assessment ${id} convertido em projeto ${projectId}`);
    return c.json({ ok: true, project_id: projectId }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao converter assessment', e);
  }
});
