import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess, erro500, PODE_REVOGAR_APROVACAO, genId, genToken, hashPassword, invalidateUserSessions, revogarAgentesPorTrocaDeSenha } from '../helpers';
import { enviarBoasVindas, nomeDaOrg } from './users';
import { validateBody, stakeholderSchema, governanceMemberSchema, companyProfileSchema, contextSchema, auditFindingSchema, auditFindingUpdateSchema } from '../schemas';

export const governanceApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// Stakeholders
governanceApp.get('/projects/:id/stakeholders', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

governanceApp.post('/projects/:id/stakeholders', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, stakeholderSchema);
    if (!v.success) return v.response;
    const { name, type, category, requirements, influence, communication_method } = v.data as any;
    if (!name) return c.json({ error: 'name is required' }, 400);
    await c.env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name, type, category, requirements, influence, communication_method)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`).bind(
        projectId, name, type || 'external', category || null, requirements || null, influence || 'Medium', communication_method || null
      ).run();
    await logAudit(c.env.DB, 'stakeholder.created', c.get('user')?.email || 'system', `Stakeholder ${name} criado para projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao criar stakeholder', e);
  }
});

governanceApp.put('/stakeholders/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'stakeholders', id, c.get('user'));
    const { name, type, category, requirements, influence, communication_method } = await c.req.json();
    await c.env.DB.prepare(`UPDATE stakeholders SET name = COALESCE(?, name), type = COALESCE(?, type), category = COALESCE(?, category),
      requirements = COALESCE(?, requirements), influence = COALESCE(?, influence), communication_method = COALESCE(?, communication_method),
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
        name || null, type || null, category || null, requirements || null, influence || null, communication_method || null, id
      ).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar stakeholder', e);
  }
});

governanceApp.delete('/stakeholders/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'stakeholders', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM stakeholders WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao deletar stakeholder', e);
  }
});

// Governance Team
governanceApp.get('/projects/:id/governance', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM project_governance WHERE project_id = ? ORDER BY created_at ASC').bind(projectId).all();
  return c.json(rows.results || []);
});

/*
 * Designar o consultor de um projeto é ato de quem contrata (o `org_admin`
 * daquele cliente) ou de quem opera a plataforma (`platform_admin`) — nunca do
 * próprio consultor. A governança é a fonte de "em quais clientes este
 * consultor atua" — do agente e, desde a D5, do próprio consultor humano
 * (`consultorDesignado` em helpers.ts); se ele pudesse se incluir, o escopo
 * seria decorativo.
 *
 * Vale para criar, alterar (inclusive trocar o e-mail, que é designar outra
 * pessoa, e rebaixar o papel) e remover. Os demais papéis seguem livres.
 * O isolamento entre projetos já vem do `projectAccessMiddleware`.
 */
// `consultoria_admin`: só chega aqui em projeto da PRÓPRIA organização (`projectAccessMiddleware` →
// `requireProjectAccess`), e e-mail de outra organização na governança não dá acesso (D5 com org).
const PODE_DESIGNAR_CONSULTOR = new Set(['platform_admin', 'org_admin', 'consultoria_admin']);

/**
 * Revoga a conta `stakeholder` deste projeto cujo e-mail é `email`: desativa, derruba as sessões (marco
 * no KV) e os agentes. Devolve se havia conta. Usada pelo "Revogar acesso" e quando a linha da matriz
 * que originou o convite muda de e-mail ou some (senão a conta ficaria órfã, ativa e sem dono).
 */
async function revogarContaStakeholder(c: any, projectId: string, email: string | null | undefined, ator: string): Promise<boolean> {
  const alvo = email?.trim().toLowerCase();
  if (!alvo) return false;
  const conta = await c.env.DB.prepare(`SELECT id FROM users WHERE lower(email) = ? AND role = 'stakeholder' AND client_project_id = ?`)
    .bind(alvo, projectId).first() as { id: string } | null;
  if (!conta) return false;
  await c.env.DB.prepare('UPDATE users SET ativo = 0 WHERE id = ?').bind(conta.id).run();
  // As sessões vivem no KV sob token aleatório e não se enumeram: o marco de invalidação as derruba.
  await invalidateUserSessions(c.env.SESSIONS, conta.id);
  await revogarAgentesPorTrocaDeSenha(c.env.DB, conta.id);
  await logAudit(c.env.DB, 'stakeholder.revogado', ator, `Acesso de stakeholder de ${alvo} revogado no projeto ${projectId}`, '', '', projectId);
  return true;
}

/** Outra linha da matriz do projeto ainda usa este e-mail? Então o acesso continua justificado. */
const emailAindaNaMatriz = async (db: D1Database, projectId: string, email: string, exceto?: string) =>
  !!(await db.prepare('SELECT 1 FROM project_governance WHERE project_id = ? AND lower(email) = ? AND id IS NOT ?')
    .bind(projectId, email.trim().toLowerCase(), exceto ?? null).first());

async function mexeEmConsultor(db: D1Database, projectId: string, memberId: string | undefined, novoPapel?: string): Promise<boolean> {
  if (novoPapel === 'consultor') return true;
  if (!memberId) return false;
  const atual = await db.prepare('SELECT role_category FROM project_governance WHERE id = ? AND project_id = ?')
    .bind(memberId, projectId).first<{ role_category: string }>();
  return atual?.role_category === 'consultor';
}

const recusaDesignacao = { error: 'Forbidden: designar consultor é do platform_admin, do administrador da consultoria ou do administrador do cliente' };

governanceApp.post('/projects/:id/governance', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, governanceMemberSchema);
    if (!v.success) return v.response;
    const { id, name, email, role_category, job_title, is_primary } = v.data as any;
    if (!name) return c.json({ error: 'name is required' }, 400);
    if (!role_category) return c.json({ error: 'role_category is required' }, 400);
    if (!job_title) return c.json({ error: 'job_title is required' }, 400);

    if (!PODE_DESIGNAR_CONSULTOR.has(c.get('user')?.role ?? '') && await mexeEmConsultor(c.env.DB, projectId, id, role_category)) {
      return c.json(recusaDesignacao, 403);
    }

    // O DPO / Líder do SGSI é UM por projeto: marcar alguém desmarca os demais,
    // no mesmo batch da gravação (a tela nunca vê dois líderes).
    const desmarcaOutros = c.env.DB.prepare(
      `UPDATE project_governance SET is_primary = 0 WHERE project_id = ? AND is_primary = 1 AND id IS NOT ?`
    ).bind(projectId, id ?? null);

    if (id) {
      const emailAntigo = (await c.env.DB.prepare('SELECT email FROM project_governance WHERE id = ? AND project_id = ?')
        .bind(id, projectId).first<{ email: string | null }>())?.email;
      const grava = c.env.DB.prepare(`
        UPDATE project_governance
        SET name = ?, email = ?, role_category = ?, job_title = ?, is_primary = ?
        WHERE id = ? AND project_id = ?
      `).bind(name, email || null, role_category, job_title, is_primary ? 1 : 0, id, projectId);
      await c.env.DB.batch(is_primary ? [desmarcaOutros, grava] : [grava]);
      if (emailAntigo && emailAntigo.trim().toLowerCase() !== (email || '').trim().toLowerCase()
        && !(await emailAindaNaMatriz(c.env.DB, projectId, emailAntigo))) {
        await revogarContaStakeholder(c, projectId, emailAntigo, c.get('user')?.email || 'system');
      }
      await logAudit(c.env.DB, 'governance.updated', c.get('user')?.email || 'system', `Membro da governança ${name} atualizado para projeto ${projectId}`);
    } else {
      const grava = c.env.DB.prepare(`
        INSERT INTO project_governance (id, project_id, name, email, role_category, job_title, is_primary)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
      `).bind(projectId, name, email || null, role_category, job_title, is_primary ? 1 : 0);
      await c.env.DB.batch(is_primary ? [desmarcaOutros, grava] : [grava]);
      await logAudit(c.env.DB, 'governance.created', c.get('user')?.email || 'system', `Membro da governança ${name} criado para projeto ${projectId}`);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar governança', e);
  }
});

governanceApp.delete('/projects/:id/governance/:memberId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const memberId = c.req.param('memberId');
    if (!PODE_DESIGNAR_CONSULTOR.has(c.get('user')?.role ?? '') && await mexeEmConsultor(c.env.DB, projectId, memberId)) {
      return c.json(recusaDesignacao, 403);
    }
    const emailAntigo = (await c.env.DB.prepare('SELECT email FROM project_governance WHERE id = ? AND project_id = ?')
      .bind(memberId, projectId).first<{ email: string | null }>())?.email;
    await c.env.DB.prepare('DELETE FROM project_governance WHERE id = ? AND project_id = ?').bind(memberId, projectId).run();
    if (emailAntigo && !(await emailAindaNaMatriz(c.env.DB, projectId, emailAntigo))) {
      await revogarContaStakeholder(c, projectId, emailAntigo, c.get('user')?.email || 'system');
    }
    await logAudit(c.env.DB, 'governance.deleted', c.get('user')?.email || 'system', `Membro da governança id ${memberId} deletado do projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao deletar governança', e);
  }
});

/*
 * Acesso de stakeholder (papel `stakeholder`, só perfil/senha/MFA/pedidos): nasce da linha da
 * matriz e morre nela. O vínculo é por `client_project_id`, como os papéis de cliente. Quem
 * convida e revoga: `org_admin` do projeto, consultor designado, `consultoria_admin` da org e
 * `platform_admin` (o corte de projeto/organização vem do `projectAccessMiddleware`); o resto,
 * inclusive o próprio stakeholder, recebe 403. A conta nova não vale sem a troca da senha provisória.
 */
const PODE_CONVIDAR = new Set(['platform_admin', 'consultoria_admin', 'consultor', 'org_admin']);
const recusaConvite = { error: 'Forbidden: convidar e revogar acesso é do administrador do cliente, do consultor designado ou da consultoria' };

const membroDaMatriz = (db: D1Database, projectId: string, memberId: string) =>
  db.prepare('SELECT id, name, email, role_category FROM project_governance WHERE id = ? AND project_id = ?')
    .bind(memberId, projectId).first<{ id: string; name: string; email: string | null; role_category: string }>();

governanceApp.post('/projects/:id/governance/:memberId/convidar', async (c) => {
  try {
    const projectId = c.req.param('id');
    const ator = c.get('user');
    if (!PODE_CONVIDAR.has(ator?.role ?? '')) return c.json(recusaConvite, 403);
    const membro = await membroDaMatriz(c.env.DB, projectId, c.req.param('memberId'));
    if (!membro) return c.json({ error: 'Membro da governança não encontrado' }, 404);
    // Consultor tem conta de equipe, não de stakeholder: o e-mail dele ficaria preso pelo UNIQUE.
    if (membro.role_category === 'consultor') return c.json({ error: 'Consultoria não é convidada como stakeholder' }, 422);
    const email = membro.email?.trim().toLowerCase();
    if (!email) return c.json({ error: 'A linha da matriz não tem e-mail: preencha antes de convidar' }, 400);

    const conta = await c.env.DB.prepare('SELECT id, role, client_project_id, ativo FROM users WHERE lower(email) = ?')
      .bind(email).first<{ id: string; role: string; client_project_id: string | null; ativo: number | null }>();
    // E-mail que já é outra conta (equipe, cliente, outro projeto) não é tocado: convite não vira promoção.
    if (conta && !(conta.role === 'stakeholder' && conta.client_project_id === projectId)) {
      return c.json({ error: 'Este e-mail já tem conta no n.iso com outro acesso' }, 409);
    }
    if (conta && conta.ativo !== 0) return c.json({ ok: true, ja_convidado: true });

    const org = (await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>())?.org_id;
    if (!org) return c.json({ error: 'Projeto não encontrado' }, 404);
    const senha = genToken().slice(0, 24); // vale para um login: a troca é obrigatória
    const hash = await hashPassword(senha);
    // Reativação (conta revogada): senha provisória nova e troca obrigatória de novo.
    if (conta) {
      await c.env.DB.prepare('UPDATE users SET ativo = 1, password_hash = ?, requires_password_change = 1 WHERE id = ?').bind(hash, conta.id).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, requires_password_change) VALUES (?, ?, ?, ?, 'stakeholder', ?, ?, 1)`
      ).bind(genId(), email, hash, membro.name, projectId, org).run();
    }
    await logAudit(c.env.DB, 'stakeholder.convidado', ator.email, `Acesso de stakeholder para ${email} no projeto ${projectId}`, '', '', projectId);
    const emailEnviado = await enviarBoasVindas(c, email, membro.name, senha, await nomeDaOrg(c.env.DB, org)).catch(() => false);
    return c.json({ ok: true, emailEnviado }, conta ? 200 : 201);
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) return c.json({ error: 'Este e-mail já tem conta no n.iso' }, 409);
    return erro500(c, 'Falha ao convidar stakeholder', e);
  }
});

governanceApp.post('/projects/:id/governance/:memberId/revogar-acesso', async (c) => {
  try {
    const projectId = c.req.param('id');
    const ator = c.get('user');
    if (!PODE_CONVIDAR.has(ator?.role ?? '')) return c.json(recusaConvite, 403);
    const membro = await membroDaMatriz(c.env.DB, projectId, c.req.param('memberId'));
    if (!(await revogarContaStakeholder(c, projectId, membro?.email, ator.email))) {
      return c.json({ error: 'Esta pessoa não tem acesso de stakeholder neste projeto' }, 404);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao revogar acesso', e);
  }
});

// Company Profile & Context Analysis
governanceApp.put('/projects/:id/company-profile', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, companyProfileSchema);
    if (!v.success) return v.response;
    const { cnpj, employee_count, scope, sector, client_name } = v.data as any;
    
    await c.env.DB.prepare(`
      UPDATE projects 
      SET cnpj = ?, employee_count = ?, scope = ?, sector = ?,
          -- Campo ausente ou em branco MANTÉM o nome atual: gravar '' apagava o
          -- nome do cliente de quem salvava o perfil sem ele (3 projetos em
          -- produção ficaram assim, e o login do agente mostrava cliente vazio).
          client_name = COALESCE(NULLIF(trim(?), ''), client_name)
      WHERE id = ?
    `).bind(
      cnpj || null, 
      // `0` é valor legítimo: o truthy check gravava null para empresa sem
      // funcionários declarados. E `parseInt` é redundante — o schema já valida número.
      employee_count ?? null, 
      scope || null, 
      sector || null, 
      client_name ?? '',
      projectId
    ).run();

    await logAudit(c.env.DB, 'company_profile.updated', c.get('user')?.email || 'system', `Perfil corporativo do projeto ${projectId} atualizado`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar perfil corporativo', e);
  }
});

governanceApp.get('/projects/:id/context', async (c) => {
  const projectId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM context_analysis WHERE project_id = ?').bind(projectId).first();
  return c.json(row || {});
});

governanceApp.put('/projects/:id/context', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, contextSchema);
    if (!v.success) return v.response;
    const { internal_strengths, internal_weaknesses, external_opportunities, external_threats, legal_requirements, contractual_requirements, notes } = v.data as any;
    
    await c.env.DB.prepare(`INSERT INTO context_analysis (id, project_id, internal_strengths, internal_weaknesses, external_opportunities, external_threats, legal_requirements, contractual_requirements, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        internal_strengths = excluded.internal_strengths,
        internal_weaknesses = excluded.internal_weaknesses,
        external_opportunities = excluded.external_opportunities,
        external_threats = excluded.external_threats,
        legal_requirements = excluded.legal_requirements,
        contractual_requirements = excluded.contractual_requirements,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP`).bind(
          projectId, internal_strengths || null, internal_weaknesses || null, external_opportunities || null, external_threats || null, legal_requirements || null, contractual_requirements || null, notes || null
        ).run();
        
    await logAudit(c.env.DB, 'context.updated', c.get('user')?.email || 'system', `Contexto atualizado para projeto ${projectId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar contexto', e);
  }
});

// Audit Findings & Management Reviews
governanceApp.get('/audits/:auditId/findings', async (c) => {
  try {
    const auditId = c.req.param('auditId');
    // A auditoria é o que carrega o tenant aqui: sem esta checagem, qualquer
    // sessão autenticada lia os achados de qualquer projeto só sabendo o id da
    // auditoria (sonda: 200 com o achado do outro cliente no corpo).
    await requireResourceAccess(c.env.DB, 'audit_schedule', auditId, c.get('user'));
    const rows = await c.env.DB.prepare('SELECT * FROM audit_findings WHERE audit_id = ? ORDER BY created_at DESC').bind(auditId).all();
    return c.json(rows.results || []);
  } catch (e: any) {
    return erro500(c, 'Falha ao listar achados de auditoria', e);
  }
});

governanceApp.post('/audits/:auditId/findings', async (c) => {
  try {
    const auditId = c.req.param('auditId');
    await requireResourceAccess(c.env.DB, 'audit_schedule', auditId, c.get('user'));
    const v = await validateBody(c, auditFindingSchema);
    if (!v.success) return v.response;
    const { control_id, finding_type, description, evidence_reviewed, auditor_notes } = v.data as any;
    if (!description) return c.json({ error: 'description is required' }, 400);

    // O projeto vem da auditoria, NUNCA do corpo. O `project_id` do payload
    // parecia escopo, mas era um valor escolhido pelo próprio chamador: a sonda
    // enviou o id do outro cliente e o achado foi gravado no projeto dele.
    // O campo continua no schema por compatibilidade e é deliberadamente
    // ignorado.
    const audit = await c.env.DB.prepare('SELECT project_id FROM audit_schedule WHERE id = ?').bind(auditId).first<any>();
    if (!audit) return c.json({ error: 'Auditoria não encontrada' }, 404);
    const project_id = audit.project_id;

    const findingId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    let capaId: string | null = null;
    
    if (finding_type === 'minor_nc' || finding_type === 'major_nc') {
      capaId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(`
        INSERT INTO corrective_actions (id, project_id, audit_id, control_id, title, description, severity, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        capaId, project_id, auditId, control_id || null, 
        `NC (${finding_type === 'major_nc' ? 'Maior' : 'Menor'}): ${description.substring(0, 50)}`, 
        description, finding_type === 'major_nc' ? 'High' : 'Medium'
      ).run();
      
      await logAudit(c.env.DB, 'capa.created_from_audit', c.get('user')?.email || 'system', `Ação corretiva ${capaId} criada a partir da NC de auditoria ${auditId}`);
    }
    
    await c.env.DB.prepare(`
      INSERT INTO audit_findings (id, audit_id, project_id, control_id, finding_type, description, evidence_reviewed, auditor_notes, capa_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')
    `).bind(
      findingId, auditId, project_id, control_id || null, finding_type || 'observation', description, evidence_reviewed || null, auditor_notes || null, capaId
    ).run();
    
    await logAudit(c.env.DB, 'audit_finding.created', c.get('user')?.email || 'system', `Achado ${findingId} criado para auditoria ${auditId}`);
    return c.json({ ok: true, id: findingId, capa_id: capaId });
  } catch (e: any) {
    return erro500(c, 'Falha ao criar achado de auditoria', e);
  }
});

governanceApp.put('/audit-findings/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'audit_findings', id, c.get('user'));
    const v = await validateBody(c, auditFindingUpdateSchema);
    if (!v.success) return v.response;
    const { description, auditor_notes, status } = v.data as any;
    await c.env.DB.prepare(`
      UPDATE audit_findings 
      SET description = COALESCE(?, description), 
          auditor_notes = COALESCE(?, auditor_notes), 
          status = COALESCE(?, status) 
      WHERE id = ?
    `).bind(description || null, auditor_notes || null, status || null, id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar achado de auditoria', e);
  }
});

governanceApp.delete('/audit-findings/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'audit_findings', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM audit_findings WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao deletar achado de auditoria', e);
  }
});

governanceApp.get('/projects/:id/management-reviews', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM management_reviews WHERE project_id = ? ORDER BY review_date DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

governanceApp.post('/projects/:id/management-reviews', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { review_date, attendees } = await c.req.json();
    if (!review_date) return c.json({ error: 'review_date is required' }, 400);
    
    const [controls, capas, risks, training] = await Promise.all([
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM compliance_controls WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM corrective_actions WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM risks WHERE project_id = ? GROUP BY status').bind(projectId).all(),
      c.env.DB.prepare('SELECT status, COUNT(*) as cnt FROM training_records WHERE project_id = ? GROUP BY status').bind(projectId).all()
    ]);
    
    const agenda = {
      items: [
        { topic: '1. Status das ações da revisão anterior', data: 'Ações tomadas com base nas atas passadas.' },
        { topic: '2. Mudanças em questões internas/externas', data: 'Revisar SWOT e requisitos legais de segurança.' },
        { topic: '3. Desempenho e eficácia do SGSI', data: controls.results || [] },
        { topic: '4. Resultados de auditorias e achados', data: 'Ver histórico de NCs do módulo de auditoria.' },
        { topic: '5. Status das ações corretivas (CAPAs)', data: capas.results || [] },
        { topic: '6. Monitoramento de riscos e eficácia', data: risks.results || [] },
        { topic: '7. Desempenho de fornecedores', data: 'Ver trust scores e DPAs dos suboperadores.' },
        { topic: '8. Cobertura de conscientização e treinamento', data: training.results || [] },
        { topic: '9. Feedback de partes interessadas', data: 'Revisar matriz de stakeholders.' },
        { topic: '10. Adequação de recursos para o ISMS', data: 'Orçamento, ferramentas e equipe CISO.' },
        { topic: '11. Oportunidades de melhoria contínua', data: 'Identificar novos projetos de conformidade.' }
      ]
    };
    
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(`
      INSERT INTO management_reviews (id, project_id, review_date, attendees, agenda_json, status)
      VALUES (?, ?, ?, ?, ?, 'Planned')
    `).bind(
      id, projectId, review_date, attendees || null, JSON.stringify(agenda)
    ).run();
    
    await logAudit(c.env.DB, 'management_review.created', c.get('user')?.email || 'system', `Reunião de análise crítica registrada para o projeto ${projectId}`);
    return c.json({ ok: true, id });
  } catch (e: any) {
    return erro500(c, 'Falha ao criar reunião de análise crítica', e);
  }
});

// Excluir análise crítica (F6, decisão D1): humano, pela interface, platform_admin e administrador do
// cliente. Não existia rota nenhuma, nem para o humano. Além da linha central `registro.excluido`
// (src/trilha-exclusao.ts), grava o texto específico com a data e o status da análise. As colunas de
// assinatura (`ciso_signed_by`...) existem em produção mas NÃO em schema.sql nem em migration (achado
// no plano de fechamento): ler daqui quebraria banco novo e staging, por isso a rota não depende delas.
governanceApp.delete('/management-reviews/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!PODE_REVOGAR_APROVACAO.has(user?.role ?? '')) {
      return c.json({ error: 'Forbidden: excluir análise crítica é do administrador do cliente ou da plataforma' }, 403);
    }
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'management_reviews', id, user);
    const r = await c.env.DB.prepare('SELECT project_id, review_date, status FROM management_reviews WHERE id = ?')
      .bind(id).first<{ project_id: string; review_date: string; status: string | null }>();
    if (!r) return c.json({ error: 'Análise crítica não encontrada' }, 404);
    await c.env.DB.prepare('DELETE FROM management_reviews WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'management_review.deleted', user.email,
      `Análise crítica ${id} (${r.review_date}, ${r.status ?? 'sem status'}) excluída.`, '', '', r.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao excluir análise crítica', e);
  }
});

governanceApp.put('/management-reviews/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'management_reviews', id, c.get('user'));
    const { decisions, action_items, status, minutes_url, attendees } = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE management_reviews 
      SET decisions = COALESCE(?, decisions), 
          action_items = COALESCE(?, action_items), 
          status = COALESCE(?, status),
          minutes_url = COALESCE(?, minutes_url),
          attendees = COALESCE(?, attendees),
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(
      decisions !== undefined ? decisions : null,
      action_items !== undefined ? action_items : null,
      status !== undefined ? status : null,
      minutes_url !== undefined ? minutes_url : null,
      attendees !== undefined ? attendees : null,
      id
    ).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar reunião de análise crítica', e);
  }
});

// Performance Metrics
governanceApp.get('/projects/:id/metrics', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM performance_metrics WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all();
  return c.json(results || []);
});

governanceApp.post('/projects/:id/metrics', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { metric_name, target_value, current_value, frequency, last_measured_at, owner, status } = await c.req.json();
    if (!metric_name) return c.json({ error: 'Metric Name is required' }, 400);

    const metricId = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB.prepare(
      'INSERT INTO performance_metrics (id, project_id, metric_name, target_value, current_value, frequency, last_measured_at, owner, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(metricId, projectId, metric_name, target_value !== undefined ? target_value : null, current_value !== undefined ? current_value : null, frequency || 'Monthly', last_measured_at || null, owner || null, status || 'On Track').run();

    return c.json({ ok: true, id: metricId });
  } catch (e: any) {
    return erro500(c, 'Error creating metric', e);
  }
});

governanceApp.put('/metrics/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'performance_metrics', id, c.get('user'));
    const { metric_name, target_value, current_value, frequency, last_measured_at, owner, status } = await c.req.json();
    
    await c.env.DB.prepare(
      'UPDATE performance_metrics SET metric_name = COALESCE(?, metric_name), target_value = COALESCE(?, target_value), current_value = COALESCE(?, current_value), frequency = COALESCE(?, frequency), last_measured_at = COALESCE(?, last_measured_at), owner = COALESCE(?, owner), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(metric_name || null, target_value !== undefined ? target_value : null, current_value !== undefined ? current_value : null, frequency || null, last_measured_at || null, owner || null, status || null, id).run();

    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Error updating metric', e);
  }
});

governanceApp.delete('/metrics/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'performance_metrics', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM performance_metrics WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Error deleting metric', e);
  }
});

// Policy Acknowledgments
governanceApp.get('/projects/:id/policy-acknowledgments', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM policy_acknowledgments WHERE project_id = ? ORDER BY acknowledged_at DESC'
  ).bind(projectId).all();
  return c.json(results || []);
});

governanceApp.post('/projects/:id/policy-acknowledgments', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { policy_type, user_name, user_email } = await c.req.json();
    if (!policy_type || !user_name || !user_email) return c.json({ error: 'Policy Type, User Name and Email are required' }, 400);

    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';

    const ackId = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB.prepare(
      'INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(ackId, projectId, policy_type, user_name, user_email, ipAddress, userAgent).run();

    return c.json({ ok: true, id: ackId });
  } catch (e: any) {
    return erro500(c, 'Error recording policy acknowledgment', e);
  }
});
