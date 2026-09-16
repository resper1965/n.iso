import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess, escapeHtml, erro500, registraErro, autoridadeDeAssinatura, recusaDeAssinatura, ehStaffDeConta, somenteStaff, hidrataEscopo, AtorAutorizado } from '../helpers';
import { validateBody, assetSchema, dpiaSchema } from '../schemas';
import { verificarCadeia } from '../trilha';
import { PHASE_TITLES, PHASE_CHECKLISTS } from '../constants';
import { DEFAULT_FINANCIAL_MODEL } from '../services/pricing';

export const platformApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// Assets standalone CRUD
platformApp.put('/assets/:id', async (c) => {
  // A guarda fica DENTRO do try, como em todo o resto do repositório: o `catch`
  // abaixo é o caminho PRIMÁRIO de tradução de `Forbidden: ...` em 403, e o
  // ramo equivalente no `app.onError` é a rede — existe para o handler que
  // esquecer o try, não para substituir este. Fora do try, a recusa escapava e
  // virava 500: sem vazar dado, mas com o contrato errado e com recusa de
  // rotina contando como erro de servidor na taxa de 5xx que a operação
  // monitora.
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'assets', id, c.get('user'));
    const user = c.get('user');
    if (user && user.role === 'org_user') {
      return c.json({ error: 'Forbidden: Cannot edit asset' }, 403);
    }
    const valid = await validateBody(c, assetSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    await c.env.DB.prepare(
      `UPDATE assets SET name=?, type=?, category=?, owner=?, criticality=?, description=? WHERE id=?`
    ).bind(body.name, body.type, body.category, body.owner, body.criticality, body.description, id).run();

    await logAudit(c.env.DB, 'asset.updated', user?.email || 'system', `Asset ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar ativo', e);
  }
});

platformApp.delete('/assets/:id', async (c) => {
  // Mesma correção do PUT acima: a guarda tem de estar dentro do try, que é
  // quem traduz a recusa em 403.
  const id = c.req.param('id');
  try {
    await requireResourceAccess(c.env.DB, 'assets', id, c.get('user'));
    const user = c.get('user');
    if (user && user.role === 'org_user') {
      return c.json({ error: 'Forbidden: Cannot delete asset' }, 403);
    }
    await c.env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'asset.deleted', user?.email || 'system', `Asset ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao deletar ativo', e);
  }
});

// DPIA standalone CRUD
platformApp.put('/dpia/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'dpia_assessments', id, c.get('user'));
    const valid = await validateBody(c, dpiaSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    await c.env.DB.prepare(
      `UPDATE dpia_assessments SET ropa_id=?, processing_name=?, data_category_risk=?, necessity_proportionality=?, technical_measures=?, residual_risk_level=?, dpo_recommendations=?, status=? WHERE id=?`
    ).bind(body.ropa_id || null, body.processing_name, body.data_category_risk, body.necessity_proportionality, body.technical_measures, body.residual_risk_level || 'Medium', body.dpo_recommendations || null, body.status || 'Draft', id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'dpia_updated', user?.email || 'system', `DPIA ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar DPIA', e);
  }
});

platformApp.post('/projects/:id/dpia/:assessmentId/approve', async (c) => {
  try {
    const projectId = c.req.param('id');
    const assessmentId = c.req.param('assessmentId');
    const user = c.get('user');

    // Aprovar DPIA é ato do DPO/Líder SGSI — a autoridade sai da matriz de
    // governança DESTE projeto, não do papel de plataforma. Sem esta checagem,
    // qualquer editor do projeto carimbava a aprovação (falha de segregação de
    // funções). Mesmo padrão de evidência, controles e ROPA.
    const autoridade = await autoridadeDeAssinatura(c.env.DB, projectId, user);
    const recusa = recusaDeAssinatura(autoridade, 'ciso');
    if (recusa) return c.json({ error: recusa }, 403);

    const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first<any>();
    // O nome da matriz vem primeiro: é sob aquela designação que a pessoa assina.
    const approvedBy = autoridade.nome || dbUser?.name || user.email;
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      'UPDATE dpia_assessments SET status = ?, dpo_approved_by = ?, dpo_approved_at = ? WHERE id = ? AND project_id = ?'
    ).bind('Approved', approvedBy, now, assessmentId, projectId).run();

    await logAudit(c.env.DB, 'dpia.approved', user.email, `DPIA ${assessmentId} aprovado pelo DPO (${approvedBy})`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Erro ao aprovar DPIA', e);
  }
});

platformApp.get('/projects/:id/dpia/:assessmentId/report', async (c) => {
  try {
    const projectId = c.req.param('id');
    const assessmentId = c.req.param('assessmentId');

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.html('<h3>Projeto não encontrado</h3>', 404);

    const dpia = await c.env.DB.prepare('SELECT * FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(assessmentId, projectId).first<any>();
    if (!dpia) return c.html('<h3>DPIA não encontrado</h3>', 404);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório RIPD / DPIA - ${project.client_name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Montserrat:wght@500;700&display=swap" rel="stylesheet">
        <style>
          body { background-color: #f1f5f9; color: #070b14; font-family: 'Inter', sans-serif; margin: 0; padding: 2rem; line-height: 1.6; }
          .container { max-width: 900px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; padding: 3rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          h1 { font-family: 'Montserrat', sans-serif; color: #0f172a; margin-top: 0; }
          .field-label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-top: 1rem; }
          .field-value { font-size: 0.95rem; color: #1e293b; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Relatório de Impacto à Proteção de Dados (RIPD / DPIA)</h1>
          <p style="color: #64748b;"><strong>Organização:</strong> ${project.client_name}</p>
          
          <div class="field-label">Atividade de Tratamento</div>
          <div class="field-value">${dpia.processing_name}</div>
          
          <div class="field-label">Riscos às Categorias de Dados</div>
          <div class="field-value">${dpia.data_category_risk}</div>
          
          <div class="field-label">Necessidade e Proporcionalidade</div>
          <div class="field-value">${dpia.necessity_proportionality}</div>
          
          <div class="field-label">Medidas Técnicas e de Segurança</div>
          <div class="field-value">${dpia.technical_measures}</div>
          
          <div class="field-label">Nível de Risco Residual</div>
          <div class="field-value"><strong>${dpia.residual_risk_level}</strong></div>
          
          <div class="field-label">Parecer do Encarregado (DPO)</div>
          <div class="field-value">${dpia.dpo_recommendations || 'Pendente de avaliação.'}</div>
          
          <div class="field-label">Status da Aprovação</div>
          <div class="field-value">${dpia.status === 'Approved' ? `✓ Aprovado por ${dpia.dpo_approved_by} em ${new Date(dpia.dpo_approved_at).toLocaleDateString()}` : 'Aguardando Aprovação do DPO'}</div>
        </div>
      </body>
      </html>
    `;
    return c.html(html);
  } catch (e: any) {
    // Relatório é HTML, então a correlação vai no corpo HTML em vez de JSON.
    return c.html(
      `<h3>Erro ao gerar relatório DPIA</h3><p>Informe o identificador ao suporte: ${escapeHtml(registraErro(c, e))}</p>`,
      500
    );
  }
});

/**
 * Verificação da cadeia da trilha arquivada (item 4.4 do plano).
 *
 * Existe como ROTA, e não só como teste, porque a pergunta "a trilha foi
 * adulterada?" aparece durante um incidente ou uma auditoria — momentos em que
 * ninguém vai rodar a suíte. A verificação percorre o R2 e RECALCULA cada
 * digest; comparar só metadado seria teatro, porque quem reescreve o objeto
 * reescreve o metadado junto.
 *
 * Restrita à equipe ness.: o resultado diz quantos dias existem e onde a cadeia
 * quebra, que é informação de operação da plataforma, não de um tenant.
 */
platformApp.get('/admin/trilha/verificar', somenteStaff, async (c) => {
  try {
    const r = await verificarCadeia(c.env);
    return c.json({ ok: true, ...r }, r.intacta ? 200 : 409);
  } catch (e: any) {
    return erro500(c, 'Falha ao verificar a cadeia da trilha', e);
  }
});

// Policy Templates & Marketplace
platformApp.get('/policy-templates', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM policy_templates ORDER BY iso_ref').all();
  return c.json({ ok: true, templates: results });
});

platformApp.get('/policy-templates/:id', async (c) => {
  const tpl = await c.env.DB.prepare('SELECT * FROM policy_templates WHERE id = ?').bind(c.req.param('id')).first();
  if (!tpl) return c.json({ error: 'Template not found' }, 404);
  return c.json({ ok: true, template: tpl });
});

platformApp.get('/marketplace/templates', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM policy_templates ORDER BY iso_ref').all();
  const marketplace = (results || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    category: t.category || 'Security Policy',
    description: `Policy template for ${t.iso_ref} (${t.title})`,
    iso_ref: t.iso_ref,
    difficulty: 'Intermediate',
    estimated_time: '15 mins',
    popularity: Math.floor(Math.random() * 50 + 50)
  }));
  return c.json({ ok: true, total: marketplace.length, templates: marketplace });
});

// Dashboard
platformApp.get('/dashboard', async (c) => {
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    return c.json({ error: 'Forbidden: Client role cannot access global platform dashboard' }, 403);
  }
  const [projects, leads, controls, evidence, risks] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM projects').first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as count FROM leads').first() as Promise<any>,
    c.env.DB.prepare("SELECT COUNT(*) as count FROM compliance_controls WHERE status = 'Completed'").first() as Promise<any>,
    c.env.DB.prepare("SELECT COUNT(*) as count FROM evidence WHERE evaluation_status = 'pending'").first() as Promise<any>,
    c.env.DB.prepare('SELECT COUNT(*) as count FROM risks WHERE impact * probability >= 15').first() as Promise<any>
  ]);
  return c.json({
    projects: projects?.count || 0,
    leads: leads?.count || 0,
    controls_done: controls?.count || 0,
    pending_evidence: evidence?.count || 0,
    critical_risks: risks?.count || 0
  });
});

platformApp.get('/dashboard/stats', async (c) => {
  try {
    const user = c.get('user');

    // Três ramos, na mesma ordem de prioridade do `/portfolio` acima:
    //
    // 1. `platform_admin` conta a plataforma inteira — sem WHERE nenhum.
    // 2. Staff de UMA conta (consultor/consultant) conta só a PRÓPRIA
    //    carteira. `leads` já carrega `conta_id` (Task 9) e filtra direto; os
    //    demais recursos não têm `conta_id` próprio e alcançam a conta via
    //    `project_id IN (projetos da conta)` — a mesma cadeia
    //    `projects.cliente_id → clientes.conta_id` do `/portfolio`.
    // 3. Qualquer outro papel — inclusive um fora da lista conhecida, e
    //    inclusive sem projeto — é escopado ao próprio `client_project_id`
    //    (que pode ser string VAZIA: `WHERE id = ''` não casa com nada, então
    //    cliente sem projeto conta zero em vez de contar a plataforma
    //    inteira). O funil comercial não é dele (`somenteMsp`), e a
    //    contagem de leads fica em 0 por construção, sem depender de mais uma
    //    checagem de papel.
    let leadsStmt: any;
    let projectsStmt: any;
    let resourceWhere: string;
    let resourceParams: unknown[];

    if (user?.role === 'platform_admin') {
      leadsStmt = c.env.DB.prepare('SELECT count(*) as count FROM leads');
      projectsStmt = c.env.DB.prepare('SELECT count(*) as count FROM projects');
      resourceWhere = '';
      resourceParams = [];
    } else if (ehStaffDeConta(user)) {
      await hidrataEscopo(c.env.DB, user as AtorAutorizado);
      const contaId = (user as AtorAutorizado)?.conta_id ?? '';
      const projetosDaConta = 'SELECT p.id FROM projects p LEFT JOIN clientes cl ON cl.id = p.cliente_id WHERE cl.conta_id = ?';
      leadsStmt = c.env.DB.prepare('SELECT count(*) as count FROM leads WHERE conta_id = ?').bind(contaId);
      projectsStmt = c.env.DB.prepare(`SELECT count(*) as count FROM (${projetosDaConta})`).bind(contaId);
      resourceWhere = `project_id IN (${projetosDaConta})`;
      resourceParams = [contaId];
    } else {
      const projectId = user?.client_project_id ?? '';
      leadsStmt = c.env.DB.prepare('SELECT 0 as count');
      projectsStmt = c.env.DB.prepare('SELECT count(*) as count FROM projects WHERE id = ?').bind(projectId);
      resourceWhere = 'project_id = ?';
      resourceParams = [projectId];
    }

    const comEscopo = (condicao: string) => (resourceWhere ? `${resourceWhere} AND ${condicao}` : condicao);

    const stats = await c.env.DB.batch<{ count: number }>([
      leadsStmt,
      projectsStmt,
      c.env.DB.prepare(`SELECT count(*) as count FROM compliance_controls WHERE ${comEscopo("status = 'Completed'")}`).bind(...resourceParams),
      c.env.DB.prepare(`SELECT count(*) as count FROM evidence WHERE ${comEscopo("evaluation_status = 'pending'")}`).bind(...resourceParams),
      c.env.DB.prepare(`SELECT count(*) as count FROM risks WHERE ${comEscopo('impact * probability >= 15')}`).bind(...resourceParams),
    ]);

    return c.json({
      leads: stats[0].results?.[0]?.count || 0,
      projects: stats[1].results?.[0]?.count || 0,
      controls_done: stats[2].results?.[0]?.count || 0,
      pending_evidence: stats[3].results?.[0]?.count || 0,
      critical_risks: stats[4].results?.[0]?.count || 0
    });
  } catch (e: any) {
    return erro500(c, 'Erro ao obter estatísticas do dashboard', e);
  }
});

// Client portal endpoints
platformApp.get('/client/dashboard', async (c) => {
  try {
    const user = c.get('user');
    if (!user.client_project_id) {
      return c.json({ error: 'Nenhum projeto associado a este usuário cliente' }, 404);
    }
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(user.client_project_id).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const [phases, controls] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(user.client_project_id).all(),
      c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(user.client_project_id).all()
    ]);

    const phaseList = (phases.results || []) as any[];
    const controlList = (controls.results || []) as any[];
    const totalPhases = phaseList.length || 41;
    const completedPhases = phaseList.filter(p => p.status === 'completed').length;
    const progressPercent = totalPhases ? Math.round((completedPhases / totalPhases) * 100) : 0;

    return c.json({
      ok: true,
      project,
      progress_percent: progressPercent,
      phases: phaseList,
      controls: controlList
    });
  } catch (e: any) {
    return erro500(c, 'Erro ao carregar dashboard do cliente', e);
  }
});

/*
 * PORTAL DO CLIENTE — o vínculo com o funil comercial.
 *
 * As duas rotas abaixo estavam MORTAS. As duas começavam com
 * `if (!user.client_lead_id) return 404`, e `users.client_lead_id` nunca
 * existiu: não está em `schema.sql` nem em nenhuma das 25 migrations, e o login
 * não seleciona a coluna. Respondiam 404 para todo mundo, sempre — inclusive
 * quando o assessment e a proposta existiam no banco.
 *
 * A correção NÃO é criar a coluna. Um `client_lead_id` em `users` seria um
 * terceiro lugar guardando um vínculo que o banco já tem, e que passaria a
 * poder divergir dos outros dois. O caminho já está gravado pelo próprio fluxo
 * de conversão:
 *
 *   users.client_project_id → projects.assessment_id → assessments.id
 *                                                    ↳ proposals.assessment_id
 *
 * `POST /api/v1/assessments/:id/convert` grava `projects.assessment_id`, e as
 * duas rotas que criam proposta gravam `proposals.assessment_id`. Derivar dali
 * é correto por construção e não tem o que sincronizar.
 *
 * O isolamento também sai de graça: o filtro é `projects.id = <projeto do
 * usuário>`, então não há id vindo do cliente para forjar. Conta de staff
 * (`client_project_id` nulo) não casa com projeto nenhum e recebe 404 — o
 * portal do cliente é do cliente.
 */

platformApp.get('/client/assessment', async (c) => {
  try {
    const user = c.get('user');
    const assessment = await c.env.DB.prepare(
      `SELECT a.id FROM assessments a
       JOIN projects p ON p.assessment_id = a.id
       WHERE p.id = ?`
    ).bind(user?.client_project_id ?? '').first() as any;
    if (!assessment) {
      return c.json({ error: 'Nenhum assessment associado a esta conta' }, 404);
    }
    return c.json({ assessment_id: assessment.id });
  } catch (e: any) {
    return erro500(c, 'Erro ao buscar assessment do cliente', e);
  }
});

platformApp.get('/client/proposal', async (c) => {
  try {
    const user = c.get('user');
    // `ORDER BY created_at DESC LIMIT 1`: o mesmo assessment pode gerar mais de
    // uma proposta (a geração automática e a manual usam a mesma tabela). A que
    // interessa ao cliente é a última.
    const proposal = await c.env.DB.prepare(
      `SELECT pr.id, pr.status FROM proposals pr
       JOIN projects p ON p.assessment_id = pr.assessment_id
       WHERE p.id = ?
       ORDER BY pr.created_at DESC LIMIT 1`
    ).bind(user?.client_project_id ?? '').first() as any;
    if (!proposal) {
      return c.json({ error: 'Nenhuma proposta associada a esta conta' }, 404);
    }
    return c.json({ proposal_id: proposal.id, status: proposal.status });
  } catch (e: any) {
    return erro500(c, 'Erro ao buscar proposta do cliente', e);
  }
});

// Notifications
platformApp.get('/notifications', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50'
  ).bind(user?.id || null).all();
  return c.json({ ok: true, notifications: results || [] });
});

platformApp.put('/notifications/:id/read', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  // Escopo ao dono: sem o filtro, qualquer autenticado marcaria como lida a
  // notificação de outro usuário (IDOR). Só o destinatário (ou broadcast) pode.
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)')
    .bind(id, user?.id || null).run();
  return c.json({ ok: true });
});

platformApp.get('/portfolio', async (c) => {
  try {
    const user = c.get('user');
    // Duas coisas erravam aqui, e as duas na mesma direção — abrindo:
    //
    // 1. a condição exigia `&& user.client_project_id`, então papel de cliente
    //    SEM projeto caía no ramo de plataforma (conta criável hoje:
    //    `createUserSchema` declara o campo `.nullable().optional()`);
    // 2. o ramo escopado era escolhido por allowlist de papel-CLIENTE, e
    //    `users.role` é TEXT livre — um papel fora da lista, como `ciso`
    //    (que a própria suíte usa), enxergava a carteira de TODOS os tenants.
    //
    // Quem decide é `ehStaffDeConta`, e o lado CLIENTE cai no lado seguro
    // (escopo ausente significa NADA, nunca TUDO — `WHERE id = ''` não casa
    // com nada). Isso resolvia quem entra no ramo de STAFF, mas não fechava o
    // ramo em si: `SELECT * FROM projects` sem `WHERE conta_id` devolvia o
    // portfólio de TODAS as consultorias para QUALQUER staff de QUALQUER
    // conta `msp` — vazamento real entre tenants, não decisão de produto (Task
    // 9 fecha isto, junto com a mesma lacuna em `/dashboard/stats`, abaixo).
    //
    // `platform_admin` é o ÚNICO papel global — ele opera o SaaS. Os demais
    // papéis de `PAPEIS_STAFF` (consultor/consultant) são staff de UMA conta e
    // veem só a própria carteira, pela cadeia que `requireProjectAccess` já
    // usa (Task 5): `projects.cliente_id → clientes.conta_id`. Não
    // desnormaliza `conta_id` em `projects` pelo mesmo motivo de lá — cliente
    // que troca de consultoria move `clientes.conta_id`, e uma cópia que não
    // acompanhe em transação deixaria a consultoria antiga enxergando o
    // projeto depois da troca.
    let stmt;
    if (user?.role === 'platform_admin') {
      stmt = c.env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    } else if (ehStaffDeConta(user)) {
      await hidrataEscopo(c.env.DB, user as AtorAutorizado);
      const contaId = (user as AtorAutorizado)?.conta_id ?? '';
      stmt = c.env.DB.prepare(
        `SELECT p.* FROM projects p LEFT JOIN clientes cl ON cl.id = p.cliente_id
         WHERE cl.conta_id = ? ORDER BY p.created_at DESC`
      ).bind(contaId);
    } else {
      stmt = c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(user?.client_project_id ?? '');
    }
    const { results } = await stmt.all();
    return c.json({ ok: true, portfolio: results || [], projects: results || [] });
  } catch (e: any) {
    return erro500(c, 'Erro ao buscar portfólio', e);
  }
});

platformApp.get('/phases/config', (c) => {
  return c.json({ ok: true, titles: PHASE_TITLES, checklists: PHASE_CHECKLISTS });
});

// Phase config & Auditor token
platformApp.get('/pricing-config', async (c) => {
  try {
    await c.env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME)").run();
    const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'pricing_config'").first<{value:string}>();
    const saved = row ? JSON.parse(row.value) : {};
    const merged = { ...DEFAULT_FINANCIAL_MODEL, ...saved,
      taxaVendaPD: { ...DEFAULT_FINANCIAL_MODEL.taxaVendaPD, ...(saved.taxaVendaPD || {}) },
      custoInternoPD: { ...DEFAULT_FINANCIAL_MODEL.custoInternoPD, ...(saved.custoInternoPD || {}) },
      tributos: { ...DEFAULT_FINANCIAL_MODEL.tributos, ...(saved.tributos || {}) },
      bufferRisco: { ...DEFAULT_FINANCIAL_MODEL.bufferRisco, ...(saved.bufferRisco || {}) },
    };
    return c.json(merged);
  } catch (e: any) {
    return c.json(DEFAULT_FINANCIAL_MODEL);
  }
});

platformApp.put('/pricing-config', async (c) => {
  try {
    await c.env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME)").run();
    const body = await c.req.json();
    const json = JSON.stringify(body);
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('pricing_config', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    ).bind(json, json).run();
    await logAudit(c.env.DB, 'pricing_config.updated', c.get('user')?.email ?? 'system', 'Config de precificação atualizada');
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar config', e);
  }
});

platformApp.get('/auditor/:token/project', async (c) => {
  const token = c.req.param('token');
  const t = await c.env.DB.prepare('SELECT project_id FROM auditor_tokens WHERE token = ? AND expires_at > datetime("now")').bind(token).first() as any;
  if (!t) return c.json({ error: 'Invalid or expired token' }, 401);

  const [project, phases, controls, evidence] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(t.project_id).first(),
    c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(t.project_id).all(),
    c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(t.project_id).all(),
    c.env.DB.prepare('SELECT id, file_name, file_size, evaluation_status, evaluation_notes, created_at FROM evidence WHERE project_id = ?').bind(t.project_id).all()
  ]);

  return c.json({
    ok: true,
    project,
    phases: phases.results || [],
    controls: controls.results || [],
    evidence: evidence.results || []
  });
});
