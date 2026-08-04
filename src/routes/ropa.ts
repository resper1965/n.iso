import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, verifyPassword, escapeHtml } from '../helpers';
import { validateBody, ropaSchema, ropaApprovalSchema } from '../schemas';

export const ropaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectRopaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Direct ROPA operations (/api/v1/ropa)
ropaApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'ropa_records', id, c.get('user'));
    const valid = await validateBody(c, ropaSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE ropa_records SET processing_purpose=?, data_categories=?, data_subjects=?, legal_basis=?, consent_details=?, data_subject_rights_details=?, retention_period=?, recipients=?, international_transfers=?, transfer_safeguards=?, dpia_required=?, status=?, owner=?, updated_at=? WHERE id=?`
    ).bind(
      body.processing_purpose ?? null, body.data_categories ?? null, body.data_subjects ?? null,
      body.legal_basis ?? null, body.consent_details ?? null, body.data_subject_rights_details ?? null,
      body.retention_period ?? null, body.recipients ?? null, body.international_transfers ? 1 : 0,
      body.transfer_safeguards ?? null, body.dpia_required ? 1 : 0, body.status || 'Draft', body.owner ?? null, now, id
    ).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_updated', user?.email || 'system', `ROPA ${id} updated`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar ROPA', detail: e.message }, 500);
  }
});

ropaApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'ropa_records', id, c.get('user'));
    await c.env.DB.prepare('DELETE FROM ropa_records WHERE id = ?').bind(id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_deleted', user?.email || 'system', `ROPA ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao excluir ROPA', detail: e.message }, 500);
  }
});

// Project ROPA operations (/api/v1/projects/:projectId/ropa)
projectRopaApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare('SELECT * FROM ropa_records WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, records: result.results });
});

projectRopaApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const valid = await validateBody(c, ropaSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, legal_basis, consent_details, data_subject_rights_details, retention_period, recipients, international_transfers, transfer_safeguards, dpia_required, status, owner, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`
    ).bind(
      id, projectId, body.processing_purpose, body.data_categories ?? null, body.data_subjects ?? null,
      body.legal_basis ?? null, body.consent_details ?? null, body.data_subject_rights_details ?? null,
      body.retention_period ?? null, body.recipients ?? null, body.international_transfers ? 1 : 0,
      body.transfer_safeguards ?? null, body.dpia_required ? 1 : 0, body.owner ?? null, now, now
    ).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_created', user?.email || 'system', `ROPA ${id} created`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha ao criar ROPA', detail: e.message }, 500);
  }
});

projectRopaApp.post('/:recordId/approve', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const recordId = c.req.param('recordId');
    const valid = await validateBody(c, ropaApprovalSchema);
    if (!valid.success) return valid.response;
    const { role } = valid.data;
    const user = c.get('user');

    if (role !== 'ciso' && role !== 'ceo') {
      return c.json({ error: 'Papel de aprovação inválido' }, 400);
    }

    const userGov = await c.env.DB.prepare(
      'SELECT * FROM project_governance WHERE project_id = ? AND email = ?'
    ).bind(projectId, user.email).first<any>();

    // Quem pode assinar cada papel sai do cargo declarado na matriz de
    // governança do projeto — não de um e-mail no código. Havia dois endereços
    // fixos aqui: um que PROIBIA aquela pessoa de assinar como Direção, e outro
    // que a ISENTAVA da checagem de cargo do CISO. Os dois diziam a mesma coisa
    // ("esta pessoa é o Líder SGSI"), e é isso que `project_governance` existe
    // para dizer — com a diferença de que o dado acompanha troca de gente,
    // enquanto o e-mail no código acompanha o deploy.
    const cargo = (userGov?.job_title || '').toLowerCase();
    const ehLiderSgsi = cargo.includes('sgsi') || cargo.includes('dpo') || cargo.includes('ciso');
    const ehDirecao = cargo.includes('ceo') || cargo.includes('diret') || cargo.includes('execut');

    // Segregação de funções: quem assina como Líder SGSI não assina também como
    // Direção Executiva. Duas assinaturas da mesma pessoa não são duas
    // aprovações — é a mesma aprovação carimbada duas vezes.
    if (role === 'ceo' && ehLiderSgsi) {
      return c.json({ error: 'Operação proibida: O Líder SGSI não pode assinar como Direção Executiva (Segregação de Funções).' }, 403);
    }

    if (userGov) {
      if (role === 'ciso' && !ehLiderSgsi) {
        return c.json({ error: 'Apenas o Líder SGSI / DPO designado pode realizar esta assinatura. Verifique o cargo registrado na matriz de Governança do projeto.' }, 403);
      }
      if (role === 'ceo' && !ehDirecao) {
        return c.json({ error: 'Apenas a Direção Executiva designada pode realizar esta assinatura. Verifique o cargo registrado na matriz de Governança do projeto.' }, 403);
      }
    }

    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(user.email).first<any>();

    let approvedBy = dbUser?.name || user.email;
    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';

    if (role === 'ciso') {
      await c.env.DB.prepare(
        'UPDATE ropa_records SET ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?, status = ? WHERE id = ? AND project_id = ?'
      ).bind(approvedBy, now, ip, ua, 'Approved', recordId, projectId).run();
      await logAudit(c.env.DB, 'ropa.approved_ciso', user.email, `ROPA ${recordId} aprovado pelo Líder SGSI (${approvedBy})`);
    } else {
      await c.env.DB.prepare(
        'UPDATE ropa_records SET ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ?, status = ? WHERE id = ? AND project_id = ?'
      ).bind(approvedBy, now, ip, ua, 'Approved', recordId, projectId).run();
      await logAudit(c.env.DB, 'ropa.approved_ceo', user.email, `ROPA ${recordId} aprovado pela Direção Executiva (${approvedBy})`);
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Erro ao aprovar ROPA', detail: e.message }, 500);
  }
});

projectRopaApp.get('/report', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.html('<h3>Projeto não encontrado</h3>', 404);

    const { results: records } = await c.env.DB.prepare(
      'SELECT * FROM ropa_records WHERE project_id = ? ORDER BY created_at ASC'
    ).bind(projectId).all<any>();

    let rowsHtml = '';
    for (const r of (records || [])) {
      const cisoSig = r.ciso_approved_by ? `<span style="color:#10b981; font-weight:600">✓ Assinado por ${escapeHtml(r.ciso_approved_by)} em ${new Date(r.ciso_approved_at).toLocaleDateString()}</span>` : '<span style="color:#d97706">Aguardando Líder SGSI</span>';
      const ceoSig = r.ceo_approved_by ? `<span style="color:#10b981; font-weight:600">✓ Assinado por ${escapeHtml(r.ceo_approved_by)} em ${new Date(r.ceo_approved_at).toLocaleDateString()}</span>` : '<span style="color:#d97706">Aguardando Direção Executiva</span>';
      
      rowsHtml += `
        <div class="ropa-card">
          <div class="ropa-card-header">
            <h3>${escapeHtml(r.processing_purpose)}</h3>
            <span class="ropa-status status-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
          </div>
          <div class="ropa-card-body">
            <div class="ropa-field">
              <div class="ropa-label">Categorias de Dados</div>
              <div class="ropa-value">${escapeHtml(r.data_categories || '-')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Titulares</div>
              <div class="ropa-value">${escapeHtml(r.data_subjects || '-')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Base Legal</div>
              <div class="ropa-value">${escapeHtml(r.legal_basis)}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Tempo de Retenção</div>
              <div class="ropa-value">${escapeHtml(r.retention_period || '-')}</div>
            </div>
            <div class="ropa-field full-width">
              <div class="ropa-label">Destinatários / Compartilhamento</div>
              <div class="ropa-value">${escapeHtml(r.recipients || '-')}</div>
            </div>
          </div>
          <div class="ropa-card-footer">
            <div><strong>Líder SGSI:</strong> ${cisoSig}</div>
            <div style="margin-top: 4px;"><strong>Direção Executiva:</strong> ${ceoSig}</div>
          </div>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório ROPA - ${project.client_name || 'Projeto GRC'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Montserrat:wght@500;700&display=swap" rel="stylesheet">
        <style>
          body { background-color: #f1f5f9; color: #070b14; font-family: 'Inter', sans-serif; margin: 0; padding: 2rem; line-height: 1.6; }
          .ropa-card { background: #ffffff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .ropa-card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1rem; }
          .ropa-card-header h3 { font-family: 'Montserrat', sans-serif; margin: 0; font-size: 1.1rem; color: #0f172a; }
          .ropa-status { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
          .status-Approved { background: #d1fae5; color: #065f46; }
          .status-Draft { background: #feefc3; color: #b45309; }
          .ropa-card-body { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
          .ropa-field { display: flex; flex-direction: column; }
          .ropa-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; margin-bottom: 2px; }
          .ropa-value { font-size: 0.9rem; color: #334155; }
          .ropa-field.full-width { grid-column: 1 / -1; }
          .ropa-card-footer { border-top: 1px dashed #e2e8f0; margin-top: 1rem; padding-top: 1rem; font-size: 0.85rem; color: #475569; }
        </style>
      </head>
      <body>
        <h1 style="font-family: 'Montserrat', sans-serif; color: #0f172a;">Relatório ROPA — ${project.client_name}</h1>
        <p style="color: #64748b;">Registro das Atividades de Tratamento de Dados Pessoais (Art. 37 LGPD / ISO 27701)</p>
        ${rowsHtml || '<p>Nenhum registro ROPA cadastrado neste projeto.</p>'}
      </body>
      </html>
    `;
    return c.html(html);
  } catch (e: any) {
    return c.html(`<h3>Erro ao gerar relatório ROPA: ${e.message}</h3>`, 500);
  }
});
