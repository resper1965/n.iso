import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, verifyPassword, validateUpload, autoridadeDeAssinatura, recusaDeAssinatura, erro500, registraErro, idDoControle } from '../helpers';
import type { PapelAssinatura } from '../helpers';
import { EvidenceAgent } from '../agents/evidence';
import { listPaged } from '../helpers';
import { validateBody, evidenceContentSchema, evidenciaVincularSchema, evidenciaTextoSchema, evidenciaAssinarSchema } from '../schemas';

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
    return erro500(c, 'Falha ao buscar detalhe da evidência', e);
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
    return erro500(c, 'Falha ao baixar evidência', e);
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
    return erro500(c, 'Falha ao buscar conteúdo da evidência', e);
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

    // Conteúdo novo é documento novo: a revisão e as assinaturas eram do texto anterior.
    // Sem isto o cliente (org_user pode editar) reescrevia documento já revisado e ele seguia conforme.
    await c.env.DB.prepare(
      `UPDATE evidence SET file_size = ?, file_hash = ?, evaluation_status = 'pending', evaluation_score = NULL, evaluation_notes = NULL,
         ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL,
         ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(arrayBuffer.byteLength, realSha256, id).run();

    const user = c.get('user');
    const assinaram = [ev.ciso_approved_by ? `Líder SGSI (${ev.ciso_approved_by})` : '', ev.ceo_approved_by ? `Direção (${ev.ceo_approved_by})` : ''].filter(Boolean).join(' e ') || 'ninguém';
    await logAudit(c.env.DB, 'evidence.content_updated', user?.email || 'system',
      `Conteúdo da evidência ${id} atualizado. Status anterior: ${ev.evaluation_status ?? 'pending'}; assinaturas apagadas de: ${assinaram}; hash ${ev.file_hash ?? '-'} -> ${realSha256}.`);
    return c.json({ ok: true, sha256: realSha256 });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar conteúdo da evidência', e);
  }
});

evidenceApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT file_name, r2_key, project_id FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    // Banco primeiro: se o DELETE falhar (ex.: FK do checklist), a linha e o
    // arquivo continuam juntos. Ao contrário, a linha sobrava apontando para um
    // objeto já apagado. Falha do R2 depois disso vira objeto órfão — vai ao log,
    // mas não desfaz a exclusão.
    await c.env.DB.prepare('DELETE FROM evidence WHERE id = ?').bind(id).run();
    if (ev.r2_key) {
      await c.env.STORAGE.delete(ev.r2_key).catch((e: unknown) => registraErro(c, e));
    }
    await logAudit(c.env.DB, 'evidence.deleted', c.get('user')?.email ?? 'system', `Evidência ${ev.file_name} excluída permanentemente.`, '', '', ev.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Erro ao excluir evidência', e);
  }
});

// Re-associa (ou desassocia) uma evidência a um controle. Faltava caminho de API
// para isso — o control_id só era definido no upload.
evidenceApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT id, project_id, control_id FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    const v = await validateBody(c, evidenciaVincularSchema);
    if (!v.success) return v.response;
    const body = v.data;
    if (!('control_id' in body)) {
      return c.json({ error: 'Envie control_id (id do controle, ou null para desassociar).' }, 400);
    }
    const novoControle = body.control_id ?? null;

    // Aterramento de tenant: só vincula a um controle DO MESMO projeto. Mesma
    // resposta para inexistente e de outro projeto (como no upload): um 403
    // distinto confirmava que o id existe em outro tenant.
    if (novoControle !== null) {
      const ctrl = await c.env.DB.prepare('SELECT 1 FROM compliance_controls WHERE id = ? AND project_id = ?').bind(novoControle, ev.project_id).first();
      if (!ctrl) return c.json({ error: 'Controle não encontrado neste projeto' }, 400);
    }

    // Mudar o controle-alvo invalida a avaliação anterior (foi feita contra outro
    // controle): volta a 'pending'. Sem efeito se o vínculo não mudou.
    const mudou = novoControle !== (ev.control_id ?? null);
    if (mudou) {
      await c.env.DB.prepare(
        "UPDATE evidence SET control_id = ?, evaluation_status = 'pending', evaluation_score = NULL, evaluation_notes = NULL, updated_at = datetime('now') WHERE id = ?"
      ).bind(novoControle, id).run();
      await logAudit(c.env.DB, 'evidence.relinked', c.get('user')?.email ?? 'system', `Evidência ${id} re-associada ao controle ${novoControle ?? '(nenhum)'} — avaliação resetada`, '', '', ev.project_id);
    }
    return c.json({ ok: true, control_id: novoControle, relinked: mudou });
  } catch (e: any) {
    return erro500(c, 'Erro ao re-associar evidência', e);
  }
});

evidenceApp.post('/:id/evaluate', async (c) => {
  try {
    const evidenceId = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', evidenceId, c.get('user'));
    const v = await validateBody(c, evidenciaTextoSchema);
    if (!v.success) return v.response;
    const body = v.data;

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
      // result.content traz o texto cru de cada provedor de IA: vai ao log, não ao cliente.
      return erro500(c, 'Falha ao avaliar evidência', new Error(result.content));
    }

    // O veredito vem na linha "Veredito:" (prompt do EvidenceAgent). Antes, includes('CONFORME')
    // casava também "NÃO CONFORME" e gravava conforming para evidência reprovada.
    // Duas opções na linha (ou o eco "[CONFORME | PARCIAL | NÃO CONFORME]" do template) = sem veredito.
    // A IA nunca grava conforming: conforme é a assinatura do Líder SGSI. CONFORME da IA fica pending.
    const linha = (/Veredito:[ \t]*([^\n]*)/i.exec(result.content)?.[1] ?? '')
      .toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sinais = linha.includes('|') ? [] : [
      /NAO\s+CONFORME/.test(linha) && 'non_conforming',
      /PARCIAL/.test(linha) && 'partial',
      /(?<!NAO\s)(?<!PARCIALMENTE\s)\bCONFORME/.test(linha) && 'pending',
    ].filter(Boolean) as string[];
    const evalStatus = sinais.length === 1 ? sinais[0] : 'pending';

    // Evidência já assinada pelo Líder SGSI mantém o status; a avaliação grava só nota e texto.
    await c.env.DB.prepare(
      `UPDATE evidence SET evaluation_status = CASE WHEN ciso_approved_by IS NOT NULL THEN evaluation_status ELSE ? END,
         evaluation_score = ?, evaluation_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(evalStatus, result.confidence || 0, result.content, evidenceId).run();

    await logAudit(c.env.DB, 'evidence.evaluated', c.get('user')?.email ?? 'system', `Evidência ${evidenceId} avaliada como ${evalStatus}.`);

    return c.json({
      ok: true,
      evaluation_status: evidence.ciso_approved_by ? evidence.evaluation_status : evalStatus,
      evaluation_markdown: result.content,
      confidence: result.confidence,
      control: evidence.control_id,
      metadata: result.metadata
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao avaliar evidência', e);
  }
});

const MUDOU = 'O conteúdo da evidência mudou desde que você abriu; recarregue e revise de novo';

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

    const v = await validateBody(c, evidenciaAssinarSchema);
    if (!v.success) return v.response;
    const body = v.data;
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
    const autoridade = await autoridadeDeAssinatura(c.env.DB, evidence.project_id, user);

    // Sem papel explícito no corpo, deduz do cargo designado.
    if (!targetRole) {
      if (autoridade.ehLiderSgsi) targetRole = 'ciso';
      else if (autoridade.ehDirecao) targetRole = 'ceo';
      else targetRole = 'ciso';
    }

    const recusa = recusaDeAssinatura(autoridade, targetRole as PapelAssinatura);
    if (recusa) return c.json({ error: recusa }, 403);

    // Quem enviou a evidência não a revisa (segregação de funções).
    if (targetRole === 'ciso' && evidence.uploaded_by && email && String(evidence.uploaded_by).toLowerCase() === email.toLowerCase()) {
      return c.json({ error: 'Quem enviou a evidência não pode revisá-la' }, 403);
    }
    // A assinatura vale para o conteúdo que a tela mostrou (hash), não para o que estiver lá depois.
    if (!body.file_hash) return c.json({ error: 'file_hash é obrigatório: assine o conteúdo que você revisou' }, 400);

    // O carimbo leva o nome da matriz: é sob aquela designação que se assina.
    approvedBy = autoridade.nome || approvedBy;

    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';

    if (targetRole === 'ciso') {
      // A assinatura do Líder SGSI é a revisão humana: leva a evidência pendente a conforme.
      // Não passa por cima de parcial/não conforme: essas voltam a pendente ao serem corrigidas.
      const r = await c.env.DB.prepare(
        `UPDATE evidence SET ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?,
           evaluation_status = CASE WHEN COALESCE(evaluation_status, 'pending') = 'pending' THEN 'conforming' ELSE evaluation_status END
         WHERE id = ? AND file_hash = ?`
      ).bind(approvedBy, now, ip, ua, id, body.file_hash).run();
      if (!r.meta.changes) return c.json({ error: MUDOU }, 409);
      const antes = evidence.evaluation_status || 'pending';
      const transicao = antes === 'pending' ? 'pending→conforming' : `status mantido: ${antes}`;
      await logAudit(c.env.DB, 'evidence.approved_ciso', email, `Evidência ${id} aprovada pelo Líder SGSI (${approvedBy}); ${transicao}`);
    } else {
      const r = await c.env.DB.prepare(
        'UPDATE evidence SET ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ? WHERE id = ? AND file_hash = ?'
      ).bind(approvedBy, now, ip, ua, id, body.file_hash).run();
      if (!r.meta.changes) return c.json({ error: MUDOU }, 409);
      await logAudit(c.env.DB, 'evidence.approved_ceo', email, `Evidência ${id} aprovada pela Direção Executiva (${approvedBy})`);
    }

    return c.json({ ok: true, role: targetRole, approved_by: approvedBy, approved_at: now });
  } catch (e: any) {
    return erro500(c, 'Falha ao assinar evidência', e);
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
    const projectId = c.req.param('projectId') as string;
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    const pedido = typeof body['control_id'] === 'string' ? body['control_id'] : '';
    const ref = typeof body['control_ref'] === 'string' ? body['control_ref'] : '';

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Recusa antes de ler o arquivo na memória: sem isto qualquer cliente
    // autenticado enche o R2, e HTML/SVG voltariam ao navegador como XSS.
    const invalido = validateUpload(file);
    if (invalido) return c.json({ error: invalido }, 400);

    // O controle precisa existir E ser deste projeto, conferido ANTES de tocar
    // no R2: sem isto a FK derrubava o INSERT depois do put (objeto órfão + 500)
    // e controle de outro projeto era aceito. Mesma resposta nos dois casos para
    // não revelar a existência de controle alheio. Aceita o id da linha ou o
    // código ("A.5.1", o que o modal pede).
    let controlId: string | null = null;
    if (pedido) {
      controlId = await idDoControle(c.env.DB, projectId, pedido);
      if (!controlId) return c.json({ error: 'Controle não encontrado neste projeto' }, 400);
    } else if (ref) {
      // ponytail: leniente de propósito — quem manda control_ref (o treinamento, A.6.3) é uma
      // sugestão; projeto sem esse controle recebe o arquivo sem vínculo em vez de recusar.
      controlId = await idDoControle(c.env.DB, projectId, ref);
    }

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
    try {
      await c.env.DB.prepare(
        `INSERT INTO evidence (id, project_id, control_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
      ).bind(id, projectId, controlId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();
    } catch (e) {
      // Compensação: sem a linha no banco, o objeto no R2 seria órfão. Se
      // a própria compensação falhar, o órfão fica registrado no log.
      await c.env.STORAGE.delete(r2Key).catch((e2: unknown) => registraErro(c, e2));
      throw e;
    }

    await logAudit(c.env.DB, 'evidence.uploaded', user?.email || 'system', `Evidência ${file.name} (SHA-256: ${realSha256.substring(0, 8)}...) enviada para projeto ${projectId}`);

    return c.json({ ok: true, id, sha256: realSha256 }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha no upload de evidência', e);
  }
});
