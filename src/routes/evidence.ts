import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, verifyPassword, validateUpload, autoridadeDeAssinatura, recusaDeAssinatura } from '../helpers';
import type { PapelAssinatura } from '../helpers';
import { EvidenceAgent } from '../agents/evidence';
import { listPaged } from '../helpers';
import { validateBody, evidenceContentSchema } from '../schemas';

export const evidenceApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectEvidenceApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// ─── Direct Evidence Router (/api/v1/evidence) ─────────────────────────────

evidenceApp.get('/:id/detail', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);
    return c.json(evidence);
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao buscar detalhe da evidência', detail: e.message }, 500);
  }
});

async function downloadEvidence(c: any, id: string) {
  try {
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first();
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidência não encontrada' }, 404);

    const obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) return c.json({ error: 'Arquivo da evidência não encontrado no R2' }, 404);

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(ev.file_name || 'evidencia')}"`);

    return new Response(obj.body, { headers });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao baixar evidência', detail: e.message }, 500);
  }
}

evidenceApp.get('/:id/download', async (c) => downloadEvidence(c, c.req.param('id')));
projectEvidenceApp.get('/:evidenceId/download', async (c) => downloadEvidence(c, c.req.param('evidenceId')));

evidenceApp.get('/:id/content', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidência não encontrada' }, 404);

    const obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) return c.json({ error: 'Conteúdo não encontrado no R2' }, 404);

    const content = await obj.text();
    return c.json({ ok: true, file_name: ev.file_name, content });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao buscar conteúdo da evidência', detail: e.message }, 500);
  }
});

evidenceApp.put('/:id/content', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const v = await validateBody(c, evidenceContentSchema);
    if (!v.success) return v.response;
    const { content } = v.data;
    if (content === undefined) return c.json({ error: 'Campo "content" é obrigatório' }, 400);

    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidência não encontrada' }, 404);

    const encoder = new TextEncoder();
    const arrayBuffer = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await c.env.STORAGE.put(ev.r2_key, arrayBuffer, {
      httpMetadata: { contentType: ev.file_type || 'text/markdown' }
    });

    await c.env.DB.prepare(
      'UPDATE evidence SET file_size = ?, file_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(arrayBuffer.byteLength, realSha256, id).run();

    const user = c.get('user');
    await logAudit(c.env.DB, 'evidence.content_updated', user?.email || 'system', `Conteúdo da evidência ${id} atualizado.`);
    return c.json({ ok: true, sha256: realSha256 });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao atualizar conteúdo da evidência', detail: e.message }, 500);
  }
});

evidenceApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT file_name, r2_key FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    if (ev.r2_key) {
      await c.env.STORAGE.delete(ev.r2_key).catch(() => {});
    }

    await c.env.DB.prepare('DELETE FROM evidence WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'evidence.deleted', c.get('user')?.email ?? 'system', `Evidência ${ev.file_name} excluída permanentemente.`);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Erro ao excluir evidência', detail: e.message }, 500);
  }
});

evidenceApp.post('/:id/evaluate', async (c) => {
  try {
    const evidenceId = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', evidenceId, c.get('user'));
    const body = await c.req.json<{ text: string }>().catch(() => ({ text: '' }));

    if (!body.text) {
      return c.json({ error: 'Campo "text" é obrigatório (texto extraído do documento)' }, 400);
    }

    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(evidenceId).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);

    let controlRef = '';
    if (evidence.control_id) {
      const ctrl = await c.env.DB.prepare('SELECT title, description FROM compliance_controls WHERE id = ?').bind(evidence.control_id).first<any>();
      if (ctrl) controlRef = `${evidence.control_id}: ${ctrl.title}. ${ctrl.description || ''}`;
    }

    const agent = new EvidenceAgent(c.env.AI, c.env.DB, c.env);
    const result = await agent.run(body.text, {
      organizationId: evidence.project_id || '',
      controlId: evidence.control_id || 'N/A',
      standardReference: controlRef || undefined,
    });

    if (!result.success) {
      return c.json({ error: 'Falha ao avaliar evidência', detail: result.content }, 500);
    }

    let evalStatus = 'pending';
    if (result.content.includes('CONFORME')) evalStatus = 'conforming';
    else if (result.content.includes('PARCIAL')) evalStatus = 'partial';
    else if (result.content.includes('NÃO CONFORME')) evalStatus = 'non_conforming';

    await c.env.DB.prepare(
      'UPDATE evidence SET evaluation_status = ?, evaluation_score = ?, evaluation_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(evalStatus, result.confidence || 0, result.content, evidenceId).run();

    await logAudit(c.env.DB, 'evidence.evaluated', c.get('user')?.email ?? 'system', `Evidência ${evidenceId} avaliada como ${evalStatus}.`);

    return c.json({
      ok: true,
      evaluation_status: evalStatus,
      evaluation_markdown: result.content,
      confidence: result.confidence,
      control: evidence.control_id,
      metadata: result.metadata
    });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao avaliar evidência', detail: e.message }, 500);
  }
});

async function handleApprove(c: any) {
  try {
    const id = c.req.param('id');
    // Isolamento de tenant ANTES de qualquer coisa. A checagem da matriz de
    // governança logo abaixo parece cobrir isto, mas não cobre: ela é pulada
    // inteira para `platform_admin`, `ciso` e `ceo`, e `users.role` é TEXT
    // livre (`createUserSchema.role` é `z.string()`). Um usuário com papel
    // `ciso` escopado ao projeto A assinava evidência do projeto B — sonda
    // devolveu 200 e gravou `ciso_approved_by` na linha do outro cliente.
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const evidence = (await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first()) as any;
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);

    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 401);

    const body = (await c.req.json().catch(() => ({}))) as any;
    const password = body.password;
    if (!password) return c.json({ error: 'Senha é obrigatória para assinatura eletrônica' }, 400);

    const dbUser = (await c.env.DB.prepare('SELECT password_hash, name FROM users WHERE id = ? OR email = ?').bind(user.id || '', user.email || '').first()) as any;
    if (!dbUser || !(await verifyPassword(password, dbUser.password_hash))) {
      return c.json({ error: 'Senha incorreta para assinatura eletrônica' }, 401);
    }

    const email = user.email || '';
    let targetRole = body.role;
    let approvedBy = dbUser.name;

    // A matriz de governança vale para TODO MUNDO, inclusive `platform_admin`.
    // Antes, papel de plataforma pulava esta checagem inteira e assinava como
    // Líder SGSI em qualquer projeto — mas papel de plataforma diz o que a
    // pessoa OPERA, não quem ela É num projeto específico. A mesma pessoa é DPO
    // num cliente, consultor noutro e nada num terceiro; é a matriz que sabe
    // disso, e por isso ela é a única fonte de autoridade de assinatura.
    const autoridade = await autoridadeDeAssinatura(c.env.DB, evidence.project_id, email);

    // Sem papel explícito no corpo, deduz do cargo designado.
    if (!targetRole) {
      if (autoridade.ehLiderSgsi) targetRole = 'ciso';
      else if (autoridade.ehDirecao) targetRole = 'ceo';
      else targetRole = 'ciso';
    }

    const recusa = recusaDeAssinatura(autoridade, targetRole as PapelAssinatura);
    if (recusa) return c.json({ error: recusa }, 403);

    // O carimbo leva o nome da matriz: é sob aquela designação que se assina.
    approvedBy = autoridade.nome || approvedBy;

    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';

    if (targetRole === 'ciso') {
      await c.env.DB.prepare(
        'UPDATE evidence SET ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ? WHERE id = ?'
      ).bind(approvedBy, now, ip, ua, id).run();
      await logAudit(c.env.DB, 'evidence.approved_ciso', email, `Evidência ${id} aprovada pelo Líder SGSI (${approvedBy})`);
    } else {
      await c.env.DB.prepare(
        'UPDATE evidence SET ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ? WHERE id = ?'
      ).bind(approvedBy, now, ip, ua, id).run();
      await logAudit(c.env.DB, 'evidence.approved_ceo', email, `Evidência ${id} aprovada pela Direção Executiva (${approvedBy})`);
    }

    return c.json({ ok: true, role: targetRole, approved_by: approvedBy, approved_at: now });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return c.json({ error: 'Falha ao assinar evidência', detail: e.message }, 500);
  }
}

evidenceApp.post('/:id/approve', handleApprove);
evidenceApp.put('/:id/approve', handleApprove);
evidenceApp.post('/:id/signatures/approve', handleApprove);
evidenceApp.put('/:id/signatures/approve', handleApprove);


// ─── Project Evidence Sub-Router (/api/v1/projects/:projectId/evidence) ────

projectEvidenceApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const p = await listPaged(c, 'SELECT * FROM evidence WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  return c.json({ ok: true, evidence: p.results }, 200, { 'X-Has-More': String(p.hasMore) });
});

projectEvidenceApp.post('/upload', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    const controlId = (body['control_id'] as string) || null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Recusa antes de ler o arquivo na memória: sem isto qualquer cliente
    // autenticado enche o R2, e HTML/SVG voltariam ao navegador como XSS.
    const invalido = validateUpload(file);
    if (invalido) return c.json({ error: invalido }, 400);

    const id = genId();
    const r2Key = `evidence/${projectId}/${id}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });

    const user = c.get('user');
    await c.env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
    ).bind(id, projectId, controlId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();

    await logAudit(c.env.DB, 'evidence.uploaded', user?.email || 'system', `Evidência ${file.name} (SHA-256: ${realSha256.substring(0, 8)}...) enviada para projeto ${projectId}`);

    return c.json({ ok: true, id, sha256: realSha256 }, 201);
  } catch (e: any) {
    return c.json({ error: 'Falha no upload de evidência', detail: e.message }, 500);
  }
});
