import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { semRastros, logAudit, requireResourceAccess, escapeHtml, autoridadeDeAssinatura, recusaDeAssinatura, erro500, registraErro, PODE_REVOGAR_APROVACAO, setParcial, refForaDoProjeto } from '../helpers';
import { COLUNAS_REVOGACAO } from './controls';
import { validateBody, ropaSchema, ropaApprovalSchema, revogarRopaSchema, ropaImportarSchema, tratamentoItensSchema, tratamentoDepartamentosSchema, tratamentoTransferenciaSchema } from '../schemas';
import { criarTransferencia, definirLigacao, diagramaDoTratamento, lerLigacoes, removerTransferencia } from '../services/tratamentos';
import { aprovacoesDoProjeto } from '../services/documentos';
import { importarTratamentos } from '../services/tratamentos-importar';
import { conferirPedidosDoDocumento } from './pedidos';

export const ropaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectRopaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** A base legal é um requisito do catálogo global (fatia 4.1): existe ou não, sem tenant. */
const baseLegalInexistente = async (db: D1Database, id: unknown) =>
  typeof id === 'string' && id !== '' && !(await db.prepare('SELECT 1 FROM requisitos WHERE id = ?').bind(id).first());

// Direct ROPA operations (/api/v1/ropa)
ropaApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'ropa_records', id, c.get('user'));
    const valid = await validateBody(c, ropaSchema);
    if (!valid.success) return valid.response;
    // Ausente preserva o valor gravado (setParcial); o transform de boolLike deixa a chave com undefined.
    const body = Object.fromEntries(Object.entries(valid.data as Record<string, unknown>).filter(([, v]) => v !== undefined)) as any;
    const atual = await c.env.DB.prepare('SELECT status, project_id FROM ropa_records WHERE id = ?').bind(id).first<{ status: string | null; project_id: string | null }>();
    // O projeto vem do ROPA gravado, nunca do corpo.
    const fora = await refForaDoProjeto(c.env.DB, atual?.project_id, body, ['owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    if (await baseLegalInexistente(c.env.DB, body.base_legal_id)) return c.json({ error: 'base_legal_id inexistente no catálogo de requisitos' }, 400);
    // Sair de 'Approved' pelo PUT deixaria as assinaturas na linha sem motivo nem trilha: é revogação.
    if (atual?.status === 'Approved' && Object.hasOwn(body, 'status')) {
      return c.json({ error: 'ROPA aprovado não muda de status pela edição. Para reabrir, use "Revogar aprovação" (motivo obrigatório).' }, 400);
    }
    for (const k of ['international_transfers', 'dpia_required']) if (k in body && body[k] !== null) body[k] = body[k] ? 1 : 0;
    const p = setParcial(body, {
      processing_purpose: null, data_categories: null, data_subjects: null, legal_basis: null, consent_details: null,
      data_subject_rights_details: null, retention_period: null, recipients: null, international_transfers: 0,
      transfer_safeguards: null, dpia_required: 0, status: 'Draft', owner: null, owner_parte_id: null, base_legal_id: null,
    });
    if (p.sql) await c.env.DB.prepare(`UPDATE ropa_records SET ${p.sql}, updated_at=? WHERE id=?`).bind(...p.binds, new Date().toISOString(), id).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_updated', user?.email || 'system', `ROPA ${id} updated`);
    if (atual?.project_id) await conferirPedidosDoDocumento(c, 'tratamento', id, atual.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar ROPA', e);
  }
});

ropaApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'ropa_records', id, c.get('user'));
    // As ligações caem por FK; os vínculos de parte não têm FK (alvo polimórfico) e saem aqui, junto.
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM parte_vinculos WHERE alvo_tipo = 'tratamento' AND alvo_id = ?").bind(id),
      c.env.DB.prepare('DELETE FROM ropa_records WHERE id = ?').bind(id),
    ]);
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_deleted', user?.email || 'system', `ROPA ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao excluir ROPA', e);
  }
});

// Project ROPA operations (/api/v1/projects/:projectId/ropa)
projectRopaApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare(
    `SELECT r.*, pa.nome AS owner_parte_nome FROM ropa_records r
     LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
     WHERE r.project_id = ? ORDER BY r.created_at DESC`
  ).bind(projectId).all();
  const aprovacoes = await aprovacoesDoProjeto(c.env.DB, projectId!, undefined, 'tratamento');
  const records = semRastros(result.results as Record<string, unknown>[]).map((r) => ({ ...r, aprovacao_pedido: aprovacoes.get(String(r.id)) ?? { ciso: null, ceo: null } }));
  return c.json({ ok: true, records });
});

projectRopaApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const valid = await validateBody(c, ropaSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    const fora = await refForaDoProjeto(c.env.DB, projectId, body, ['owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    if (await baseLegalInexistente(c.env.DB, body.base_legal_id)) return c.json({ error: 'base_legal_id inexistente no catálogo de requisitos' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, legal_basis, consent_details, data_subject_rights_details, retention_period, recipients, international_transfers, transfer_safeguards, dpia_required, status, owner, owner_parte_id, base_legal_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`
    ).bind(
      id, projectId, body.processing_purpose, body.data_categories ?? null, body.data_subjects ?? null,
      body.legal_basis ?? null, body.consent_details ?? null, body.data_subject_rights_details ?? null,
      body.retention_period ?? null, body.recipients ?? null, body.international_transfers ? 1 : 0,
      body.transfer_safeguards ?? null, body.dpia_required ? 1 : 0, body.owner ?? null, body.owner_parte_id || null, body.base_legal_id || null, now, now
    ).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_created', user?.email || 'system', `ROPA ${id} created`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar ROPA', e);
  }
});

// Importação por planilha (fatia 4.4): cria `Draft`, devolve as linhas recusadas, reimportar não duplica.
projectRopaApp.post('/importar', async (c) => {
  try {
    const v = await validateBody(c, ropaImportarSchema);
    if (!v.success) return v.response;
    const r = await importarTratamentos(c.env.DB, c.req.param('projectId')!, c.get('user')?.email || 'system', v.data.csv);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json(r);
  } catch (e) { return erro500(c, 'Falha ao importar o RoPA', e); }
});

// ─── Ligações do tratamento (fatia 4.1): itens, departamentos, transferências; partes por parte_vinculos ───

projectRopaApp.get('/:recordId/ligacoes', async (c) => {
  const r = await lerLigacoes(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.get('/:recordId/diagrama', async (c) => {
  const mermaid = await diagramaDoTratamento(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return mermaid === null ? c.json({ error: 'Registro do RoPA não encontrado' }, 404) : c.json({ mermaid });
});

projectRopaApp.put('/:recordId/itens', async (c) => {
  try {
    const v = await validateBody(c, tratamentoItensSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirLigacao(c.env.DB, projectId, c.req.param('recordId'), 'itens', v.data.itens);
    if (!r) return c.json({ error: 'Registro do RoPA não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Item inexistente ou de outro projeto', invalidos: r.invalidos }, 400);
    await logAudit(c.env.DB, 'ropa.itens', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ${r.total} itens ligados`, '', '', projectId);
    await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os itens', e); }
});

projectRopaApp.put('/:recordId/departamentos', async (c) => {
  try {
    const v = await validateBody(c, tratamentoDepartamentosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirLigacao(c.env.DB, projectId, c.req.param('recordId'), 'departamentos', v.data.departamentos);
    if (!r) return c.json({ error: 'Registro do RoPA não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Departamento inexistente ou de outro projeto', invalidos: r.invalidos }, 400);
    await logAudit(c.env.DB, 'ropa.departamentos', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ${r.total} departamentos ligados`, '', '', projectId);
    await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os departamentos', e); }
});

projectRopaApp.post('/:recordId/transferencias', async (c) => {
  try {
    const v = await validateBody(c, tratamentoTransferenciaSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await criarTransferencia(c.env.DB, projectId, c.req.param('recordId'), v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'ropa.transferencia', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: transferência para ${v.data.pais}`, '', '', projectId);
    await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao registrar a transferência', e); }
});

projectRopaApp.delete('/:recordId/transferencias/:transferenciaId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const ok = await removerTransferencia(c.env.DB, projectId, c.req.param('recordId'), c.req.param('transferenciaId'));
    if (ok) await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return ok ? c.json({ ok: true }) : c.json({ error: 'Transferência não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao remover a transferência', e); }
});

// Revogar a aprovação (F6, decisão D1): ato do humano, pela interface, de platform_admin e do
// administrador do cliente. NÃO pede a senha do aprovador (como a revogação de controle), mas o
// motivo é obrigatório e vai para a trilha com o projeto. Sem assinatura nenhuma sobrando, o ROPA
// volta a rascunho; com uma sobrando (a aprovação grava `Approved` já na primeira), continua aprovado.
projectRopaApp.post('/:recordId/revoke-approval', async (c) => {
  try {
    const user = c.get('user');
    if (!PODE_REVOGAR_APROVACAO.has(user?.role ?? '')) {
      return c.json({ error: 'Forbidden: revogar aprovação é do administrador do cliente ou da plataforma' }, 403);
    }
    const projectId = c.req.param('projectId');
    const recordId = c.req.param('recordId');
    const valid = await validateBody(c, revogarRopaSchema);
    if (!valid.success) return valid.response;
    const { role, reason } = valid.data;

    const atual = await c.env.DB.prepare('SELECT ciso_approved_by, ceo_approved_by FROM ropa_records WHERE id = ? AND project_id = ?')
      .bind(recordId, projectId).first<{ ciso_approved_by: string | null; ceo_approved_by: string | null }>();
    if (!atual) return c.json({ error: 'ROPA não encontrado' }, 404);

    const limpaCiso = role !== 'ceo';
    const limpaCeo = role !== 'ciso';
    const sobra = (!limpaCiso && !!atual.ciso_approved_by) || (!limpaCeo && !!atual.ceo_approved_by);
    const colunas = [limpaCiso ? COLUNAS_REVOGACAO.ciso : '', limpaCeo ? COLUNAS_REVOGACAO.ceo : ''].filter(Boolean).join(', ');
    await c.env.DB.prepare(`UPDATE ropa_records SET ${colunas}, status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`)
      .bind(sobra ? 'Approved' : 'Draft', recordId, projectId).run();

    const quais = role === 'todas' ? 'todas as aprovações' : role === 'ciso' ? 'a aprovação do Líder SGSI' : 'a aprovação da Direção Executiva';
    await logAudit(c.env.DB, 'ropa.approval_revoked', user.email, `ROPA ${recordId}: revogada ${quais}${sobra ? '' : '; voltou a Draft'}.`, reason, c.req.header('CF-Connecting-IP') ?? '', projectId);
    return c.json({ ok: true, role, status: sobra ? 'Approved' : 'Draft' });
  } catch (e: any) {
    return erro500(c, 'Erro ao revogar aprovação do ROPA', e);
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

    // A autoridade sai da matriz de governança DESTE projeto — nunca do papel
    // de plataforma. Antes, quem não estava na matriz caía num `if (userGov)`
    // e passava sem checagem nenhuma: assinava os dois papéis do mesmo ROPA.
    const autoridade = await autoridadeDeAssinatura(c.env.DB, projectId || '', user);
    const recusa = recusaDeAssinatura(autoridade, role);
    if (recusa) return c.json({ error: recusa }, 403);

    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(user.email).first<any>();

    // O nome da matriz vem primeiro: é sob aquela designação que a pessoa
    // assina, e é ele que o auditor confere contra o organograma do projeto.
    let approvedBy = autoridade.nome || dbUser?.name || user.email;
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
    return erro500(c, 'Erro ao aprovar ROPA', e);
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
        <title>Relatório ROPA - ${escapeHtml(project.client_name || 'Projeto GRC')}</title>
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
        <h1 style="font-family: 'Montserrat', sans-serif; color: #0f172a;">Relatório ROPA — ${escapeHtml(project.client_name)}</h1>
        <p style="color: #64748b;">Registro das Atividades de Tratamento de Dados Pessoais (Art. 37 LGPD / ISO 27701)</p>
        ${rowsHtml || '<p>Nenhum registro ROPA cadastrado neste projeto.</p>'}
      </body>
      </html>
    `;
    return c.html(html);
  } catch (e) {
    return c.html(
      `<h3>Erro ao gerar relatório ROPA</h3><p>Informe o identificador ao suporte: ${escapeHtml(registraErro(c, e))}</p>`,
      500
    );
  }
});
