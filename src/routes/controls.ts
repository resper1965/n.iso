import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, requireResourceAccess, verifyPassword, erro500 } from '../helpers';
import { validateBody, controlUpdateSchema, maturitySchema, statusSchema, assinaturaSchema } from '../schemas';

// Sub-router de controles, montado em /api/v1/controls (FORA de
// /api/v1/projects/:projectId/*, portanto o projectAccessMiddleware não roda
// aqui — o isolamento de tenant é feito por requireResourceAccess em cada rota).
// Extraído de routes/projects.ts para reduzir aquele arquivo sem mudar rota.
export const controlsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

controlsApp.get('/', async (c) => {
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (!user.client_project_id) {
      return c.json([]);
    }
    const { results } = await c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ? ORDER BY id ASC').bind(user.client_project_id).all();
    return c.json(results || []);
  }
  const { results } = await c.env.DB.prepare('SELECT * FROM compliance_controls ORDER BY id ASC').all();
  return c.json(results || []);
});

controlsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // Este router está montado em /api/v1/controls, FORA de
    // /api/v1/projects/:projectId/*, então o projectAccessMiddleware nunca roda
    // aqui: sem esta linha o UPDATE abaixo casa por id apenas e um org_admin
    // reescreve controle de outro tenant.
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, controlUpdateSchema);
    if (!v.success) return v.response;
    const { status, title, description } = v.data as any;

    const atual = await c.env.DB.prepare(
      'SELECT project_id, description FROM compliance_controls WHERE id = ?'
    ).bind(id).first() as any;
    // requireResourceAccess devolve true sem checar existência para papéis de
    // staff, então o 404 precisa ser explícito.
    if (!atual) return c.json({ error: 'Controle não encontrado' }, 404);

    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);

    // `description` é onde mora o texto da política do controle. Um documento
    // aprovado cujo conteúdo mudou não está mais aprovado — manter o carimbo do
    // CISO/CEO sobre texto que eles nunca leram é falsear a trilha de auditoria.
    // O endpoint de edição de política (routes/policies.ts) já zerava; esta rota
    // não, e era por aqui que dava para contornar a invalidação.
    //
    // Compara com o valor gravado de propósito: reenviar o MESMO texto não é
    // mudança de conteúdo e não deve custar a aprovação de quem já assinou.
    const textoMudou = description !== undefined && description !== atual.description;
    if (textoMudou) {
      updates.push(
        'ciso_approved_by = NULL', 'ciso_approved_at = NULL',
        'ciso_approved_ip = NULL', 'ciso_approved_ua = NULL',
        'ceo_approved_by = NULL', 'ceo_approved_at = NULL',
        'ceo_approved_ip = NULL', 'ceo_approved_ua = NULL',
      );
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE compliance_controls SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

    const ator = c.get('user')?.email ?? 'system';
    await logAudit(c.env.DB, 'control.updated', ator, `Controle ${id} atualizado`, '', '', atual.project_id);
    // Evento próprio: a perda da aprovação é o que o auditor precisa enxergar,
    // e ela ficaria invisível dentro de um "controle atualizado" genérico.
    if (textoMudou) {
      await logAudit(c.env.DB, 'control.approvals_invalidated', ator, `Aprovações do controle ${id} invalidadas: o texto da política mudou`, '', '', atual.project_id);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao atualizar controle', e);
  }
});

controlsApp.put('/:id/maturity', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, maturitySchema);
    if (!v.success) return v.response;
    const { maturity } = v.data;

    if (maturity < 0 || maturity > 5) {
      return c.json({ error: 'Maturidade deve ser entre 0 e 5' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE compliance_controls SET maturity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(maturity, id).run();

    const projRow = await c.env.DB.prepare('SELECT project_id FROM compliance_controls WHERE id = ?').bind(id).first() as any;
    await logAudit(c.env.DB, 'control.maturity_updated', c.get('user')?.email || 'system', `Maturidade do controle ${id} atualizada para ${maturity}`, '', '', projRow?.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao atualizar maturidade', e);
  }
});

controlsApp.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    // Mesma exposição do PUT /:id — e aqui o estrago é pior, porque marcar
    // controle alheio como "Implemented" falseia o SGSI do outro tenant.
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, statusSchema);
    if (!v.success) return v.response;
    const { status } = v.data;

    await c.env.DB.prepare(
      'UPDATE compliance_controls SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, id).run();

    const projRow = await c.env.DB.prepare('SELECT project_id FROM compliance_controls WHERE id = ?').bind(id).first() as any;
    await logAudit(c.env.DB, 'control.status_updated', c.get('user')?.email || 'system', `Status do controle ${id} atualizado para ${status}`, '', '', projRow?.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao atualizar status do controle', e);
  }
});

const handleControlApprove = async (c: any) => {
  try {
    const controlId = c.req.param('id');
    const v = await validateBody(c, assinaturaSchema);
    if (!v.success) return v.response;
    const { password } = v.data as any;
    const user = c.get('user');

    if (!password) {
      return c.json({ error: 'Senha é obrigatória para assinatura eletrônica' }, 400);
    }

    // O escopo do UPDATE saía de `project_id` — um campo do CORPO da requisição.
    // O `AND project_id = ?` parecia isolamento de tenant mas não era: o valor
    // era do próprio chamador, então mandar o projeto alheio bastava para
    // assinar controle de outro tenant com a própria senha. E quando nem havia
    // `project_id`, o UPDATE caía no ramo sem escopo nenhum.
    //
    // Agora o projeto sai do próprio controle e a autorização é uma checagem
    // explícita, não um WHERE que se parecia com uma. O `project_id` do corpo
    // continua sendo aceito pelo schema para não quebrar quem já o envia, mas
    // não decide mais nada.
    const controlRow = await c.env.DB.prepare(
      'SELECT project_id FROM compliance_controls WHERE id = ?'
    ).bind(controlId).first() as any;
    if (!controlRow) return c.json({ error: 'Controle não encontrado' }, 404);
    await requireResourceAccess(c.env.DB, 'compliance_controls', controlId, user);
    const targetProjectId = controlRow.project_id;

    const dbUser = (await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first()) as any;

    if (!dbUser || !(await verifyPassword(password, dbUser.password_hash))) {
      return c.json({ error: 'Senha incorreta' }, 401);
    }

    await c.env.DB.prepare(
      `UPDATE compliance_controls SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(controlId).run();



    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';
    const approvedBy = dbUser.name || user.email;

    await logAudit(c.env.DB, 'control.approved', user.email, `Controle ${controlId} aprovado com assinatura por ${approvedBy} (IP: ${ip})`, '', '', targetProjectId);
    return c.json({ ok: true, approved_by: approvedBy, approved_at: now });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao assinar controle', e);
  }
};

controlsApp.post('/:id/approve', handleControlApprove);
controlsApp.put('/:id/approve', handleControlApprove);
