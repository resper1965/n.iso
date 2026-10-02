import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { logAudit, requireResourceAccess, escapeHtml, erro500, registraErro, autoridadeDeAssinatura, recusaDeAssinatura, ehComercial, projetosVisiveis, somenteNess, somenteComercial, PODE_REVOGAR_APROVACAO } from '../helpers';
import { validateBody, assetSchema, dpiaSchema, revogarDpiaSchema, dpiaApprovalSchema } from '../schemas';
import { verificarCadeia } from '../trilha';
import { PHASE_TITLES, PHASE_CHECKLISTS } from '../constants';
import { DEFAULT_FINANCIAL_MODEL } from '../services/pricing';
import { exigirOrg, somenteOrgNess, resolverOrg, orgDoUsuario, ORG_NESS } from '../services/organizacao';

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

// Revogar a aprovação do DPIA (F6, decisão D1): humano, pela interface, platform_admin e administrador
// do cliente. Limpa assinaturas e aprovação do DPO e volta o DPIA a rascunho; o motivo é obrigatório
// e vai para a trilha com o projeto.
platformApp.post('/projects/:id/dpia/:assessmentId/revoke-approval', async (c) => {
  try {
    const user = c.get('user');
    if (!PODE_REVOGAR_APROVACAO.has(user?.role ?? '')) {
      return c.json({ error: 'Forbidden: revogar aprovação é do administrador do cliente ou da plataforma' }, 403);
    }
    const projectId = c.req.param('id');
    const assessmentId = c.req.param('assessmentId');
    const valid = await validateBody(c, revogarDpiaSchema);
    if (!valid.success) return valid.response;

    const existe = await c.env.DB.prepare('SELECT 1 FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(assessmentId, projectId).first();
    if (!existe) return c.json({ error: 'DPIA não encontrado' }, 404);

    await c.env.DB.prepare(
      `UPDATE dpia_assessments SET dpo_signature = NULL, ceo_signature = NULL, dpo_approved_by = NULL, dpo_approved_at = NULL, status = 'Draft' WHERE id = ? AND project_id = ?`
    ).bind(assessmentId, projectId).run();
    await logAudit(c.env.DB, 'dpia.approval_revoked', user.email, `DPIA ${assessmentId}: aprovação e assinaturas revogadas; voltou a Draft.`, valid.data.reason, c.req.header('CF-Connecting-IP') ?? '', projectId);
    return c.json({ ok: true, status: 'Draft' });
  } catch (e: any) {
    return erro500(c, 'Erro ao revogar aprovação do DPIA', e);
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
    const valid = await validateBody(c, dpiaApprovalSchema);
    if (!valid.success) return valid.response;
    const { role } = valid.data;

    const autoridade = await autoridadeDeAssinatura(c.env.DB, projectId, user);
    const recusa = recusaDeAssinatura(autoridade, role);
    if (recusa) return c.json({ error: recusa }, 403);

    const atual = await c.env.DB.prepare('SELECT dpo_signature, ceo_signature FROM dpia_assessments WHERE id = ? AND project_id = ?')
      .bind(assessmentId, projectId).first<{ dpo_signature: string | null; ceo_signature: string | null }>();
    if (!atual) return c.json({ error: 'DPIA não encontrado' }, 404);

    const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first<any>();
    // O nome da matriz vem primeiro: é sob aquela designação que a pessoa assina.
    const approvedBy = autoridade.nome || dbUser?.name || user.email;
    const now = new Date().toISOString();

    // O DPO assina e o DPIA segue em análise; só com as duas assinaturas ele vira Approved.
    if (role === 'ciso') {
      await c.env.DB.prepare('UPDATE dpia_assessments SET dpo_signature = ?, dpo_approved_by = ?, dpo_approved_at = ?, status = ? WHERE id = ? AND project_id = ?')
        .bind(approvedBy, approvedBy, now, atual.ceo_signature ? 'Approved' : 'Under Review', assessmentId, projectId).run();
    } else {
      await c.env.DB.prepare('UPDATE dpia_assessments SET ceo_signature = ?, status = ? WHERE id = ? AND project_id = ?')
        .bind(approvedBy, atual.dpo_signature ? 'Approved' : 'Under Review', assessmentId, projectId).run();
    }

    const quem = role === 'ciso' ? 'pelo DPO / Líder SGSI' : 'pela Direção Executiva';
    await logAudit(c.env.DB, 'dpia.approved', user.email, `DPIA ${assessmentId} aprovado ${quem} (${approvedBy}); papel: ${role}`, '', c.req.header('CF-Connecting-IP') ?? '', projectId);
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
 * Restrita à equipe da ness. (`somenteOrgNess`: a cadeia é da plataforma inteira, e a equipe de
 * outra consultoria, inclusive o consultoria_admin, não a lê): o resultado diz quantos dias existem e onde a cadeia
 * quebra, que é informação de operação da plataforma, não de um tenant.
 */
platformApp.get('/admin/trilha/verificar', somenteNess, exigirOrg, somenteOrgNess, async (c) => {
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
  // Consultor conta só os projetos em que está designado (D5); lead, só o comercial.
  const v = projetosVisiveis(user);
  const doProjeto = v ? `AND project_id IN (${v.sql})` : '';
  const conta = (sql: string) => (v ? c.env.DB.prepare(sql).bind(v.bind) : c.env.DB.prepare(sql)).first() as Promise<any>;
  // Leads: só o comercial, e só os da organização dele (sem organização, nenhum).
  const orgLeads = ehComercial(user) ? await resolverOrg(c) : null;
  const [projects, leads, controls, evidence, risks] = await Promise.all([
    conta(`SELECT COUNT(*) as count FROM projects WHERE 1=1 ${v ? `AND id IN (${v.sql})` : ''}`),
    (orgLeads ? c.env.DB.prepare('SELECT COUNT(*) as count FROM leads WHERE org_id = ?').bind(orgLeads) : c.env.DB.prepare('SELECT 0 as count')).first() as Promise<any>,
    conta(`SELECT COUNT(*) as count FROM compliance_controls WHERE status = 'Completed' ${doProjeto}`),
    conta(`SELECT COUNT(*) as count FROM evidence WHERE evaluation_status = 'pending' ${doProjeto}`),
    conta(`SELECT COUNT(*) as count FROM risks WHERE impact * probability >= 15 ${doProjeto}`),
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

    // Mesma inversão do `/portfolio` acima, pelos mesmos dois motivos: só a
    // equipe ness. conta a plataforma inteira; qualquer outro papel — inclusive
    // um fora da lista conhecida, e inclusive sem projeto — é escopado.
    //
    // UMA variável decide tudo: `null` é o ramo da ness. (sem WHERE), string é
    // o escopo do cliente. A string pode ser VAZIA, e é esse o ponto —
    // `WHERE id = ''` não casa com nada, então cliente sem projeto conta zero
    // em vez de contar a plataforma inteira.
    //
    // Desde a D5 a decisão é de `projetosVisiveis`: o consultor conta só os
    // projetos em que está designado; só o platform_admin conta tudo.
    const v = projetosVisiveis(user);

    const whereResource = v ? `WHERE project_id IN (${v.sql})` : '';
    const whereProject = v ? `WHERE id IN (${v.sql})` : '';
    const params = v ? [v.bind] : [];
    const orgLeads = ehComercial(user) ? await resolverOrg(c) : null;

    const stats = await c.env.DB.batch<{ count: number }>([
      // O funil comercial é do comercial da ness. (ver `somenteComercial` em
      // helpers.ts): cliente e consultor não veem lead — nem o conteúdo, nem
      // quantos existem. O `SELECT 0` mantém o alinhamento posicional do
      // batch, para os índices abaixo não dependerem do papel de quem pergunta.
      orgLeads
        ? c.env.DB.prepare('SELECT count(*) as count FROM leads WHERE org_id = ?').bind(orgLeads)
        : c.env.DB.prepare('SELECT 0 as count'),
      c.env.DB.prepare(`SELECT count(*) as count FROM projects ${whereProject}`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM compliance_controls ${whereResource} ${whereResource ? "AND" : "WHERE"} status = 'Completed'`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM evidence ${whereResource} ${whereResource ? "AND" : "WHERE"} evaluation_status = 'pending'`).bind(...params),
      c.env.DB.prepare(`SELECT count(*) as count FROM risks ${whereResource} ${whereResource ? "AND" : "WHERE"} impact * probability >= 15`).bind(...params)
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
  // Notificação é do destinatário. A de difusão (`user_id` nulo) é legado da era só-ness. (nenhum
  // caminho a cria hoje): fica para a equipe da ness. e o platform_admin, não para outra consultoria.
  const veDifusao = orgDoUsuario(user) === ORG_NESS ? 1 : 0;
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? OR (user_id IS NULL AND ? = 1) ORDER BY created_at DESC LIMIT 50'
  ).bind(user?.id || null, veDifusao).all();
  return c.json({ ok: true, notifications: results || [] });
});

platformApp.put('/notifications/:id/read', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  // Escopo ao dono: sem o filtro, qualquer autenticado marcaria como lida a
  // notificação de outro usuário (IDOR). Só o destinatário (ou broadcast) pode.
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR (user_id IS NULL AND ? = 1))')
    .bind(id, user?.id || null, orgDoUsuario(user) === ORG_NESS ? 1 : 0).run();
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
    // Agora quem decide é `projetosVisiveis`: só o platform_admin vê a
    // plataforma inteira; o consultor, os projetos em que está designado (D5);
    // todo o resto, o próprio projeto. Papel desconhecido cai no lado seguro.
    // Com o escopo vazio, `IN (SELECT '')` não casa com nada — escopo ausente
    // significa NADA, nunca TUDO.
    const v = projetosVisiveis(user);
    const stmt = v
      ? c.env.DB.prepare(`SELECT * FROM projects WHERE id IN (${v.sql}) ORDER BY created_at DESC`).bind(v.bind)
      : c.env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC');
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
// Tabela de preços da ness. (custo interno, tributos, margem): comercial apenas.
// Estava sem trava nenhuma — qualquer sessão, inclusive de cliente, lia com 200.
platformApp.get('/pricing-config', somenteComercial, exigirOrg, somenteOrgNess, async (c) => {
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

platformApp.put('/pricing-config', somenteComercial, exigirOrg, somenteOrgNess, async (c) => {
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
