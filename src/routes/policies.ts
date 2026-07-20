import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { PHASE_CHECKLISTS, ChecklistItem } from '../checklists';
import { genId, logAudit, escapeHtml } from '../helpers';
import { PolicyAgent } from '../agents/policy';
import { MemoryService } from '../services/memory';
import { PolicyGeneratorService } from '../services/policy-generator';

const policies = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ═══════════════════════════════════════════════════════════════════════════════
//  POLICY AGENT — Geração Automática de Políticas
// ═══════════════════════════════════════════════════════════════════════════════

policies.post('/api/v1/projects/:id/generate-policy', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ control_id?: string; phase_number?: number }>().catch(() => ({} as any));

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const controlId = body.control_id || 'A.5.1';

    // Buscar respostas do assessment para memória organizacional
    let orgMemory = '';
    if (project.assessment_id) {
      const { results: answers } = await c.env.DB.prepare(
        'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ? AND answer IS NOT NULL'
      ).bind(project.assessment_id).all<{ question_key: string; answer: string }>();
      orgMemory = (answers || []).map(a => `${a.question_key}: ${a.answer}`).join('\n');
    }

    // ponytail: RAG memory — retrieve prior policies + client documents for context
    let ragContext = '';
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      const policyCtx = await memory.retrieveContext(projectId, `policy ${controlId}`, 'policy', 3);
      const clientCtx = await memory.retrieveContext(projectId, `${controlId} organograma sistemas ativos seguranca`, 'client_doc', 3);
      ragContext = [policyCtx, clientCtx].filter(Boolean).join('\n---\n');
    } catch(e) { /* vectorize may not be populated yet */ }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const result = await agent.run(
      `Gere uma política completa para o controle ${controlId} da organização ${project.client_name} (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).`,
      {
        organizationId: projectId,
        controlId,
        organizationalMemory: [orgMemory, ragContext].filter(Boolean).join('\n---\n') || undefined,
      }
    );

    if (!result.success) {
      return c.json({ error: 'Falha ao gerar política', detail: result.content }, 500);
    }

    // ponytail: store generated policy in RAG for future context
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      await memory.storeFact(projectId, `Política ${controlId}: ${result.content.substring(0, 500)}`, 'policy', { controlId });
    } catch(e) { /* non-blocking */ }

    // Save policy markdown directly to compliance_controls.description
    const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(result.content, normId, controlId, projectId).run();

    // Insert new version in policy_versions
    try {
      const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
      ).bind(projectId, normId, controlId).first<{ count: number }>();
      const nextVer = (countRow?.count || 0) + 1;
      const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(
        'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(versionId, projectId, normId, nextVer, result.content, c.get('user')?.email || 'system').run();
    } catch (e) {
      console.error("Erro ao registrar versão da política", e);
    }

    await logAudit(c.env.DB, 'policy.generated', c.get('user')?.email ?? 'system', `Política gerada para controle ${controlId}, projeto ${projectId}`);

    return c.json({
      ok: true,
      policy_markdown: result.content,
      control: controlId,
      confidence: result.confidence,
      metadata: result.metadata
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar política', detail: e.message }, 500);
  }
});

// Helper para encontrar item de checklist
function findChecklistItem(itemId: string): { item: ChecklistItem; phaseNumber: number } | null {
  for (const phaseStr in PHASE_CHECKLISTS) {
    const phaseNumber = parseInt(phaseStr);
    const item = PHASE_CHECKLISTS[phaseNumber].find(i => i.id === itemId);
    if (item) return { item, phaseNumber };
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DOCUMENT WIZARD — Guided Document Generation with Field Context
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/projects/:id/generate-document
policies.post('/api/v1/projects/:id/generate-document', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ itemId: string; fields: Record<string, string> }>().catch(() => ({} as any));
    const { itemId, fields } = body;
    if (!itemId || !fields) return c.json({ error: 'itemId and fields are required' }, 400);

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const found = findChecklistItem(itemId);
    if (!found) return c.json({ error: 'Item de checklist não encontrado' }, 404);
    const { item } = found;

    // Build context from fields
    const fieldsSummary = Object.entries(fields)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    // ponytail: load answers from project_interviews to feed into the prompt context for p2_3 and p2_4
    let interviewsSummary = '';
    if (itemId === 'p2_3' || itemId === 'p2_4') {
      try {
        const { results: interviews } = await c.env.DB.prepare(
          'SELECT track, question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ?'
        ).bind(projectId).all<any>();
        if (interviews && interviews.length > 0) {
          interviewsSummary = '\nRESPOSTAS DAS ENTREVISTAS POR TRILHA:\n' + interviews.map((i: any) => 
            `[Trilha: ${i.track}] P: ${i.question} | R: ${i.answer} (Entrevistado: ${i.interviewee || 'N/A'}) | ${i.gap_detected ? '⚠️ LACUNA DETECTADA' : '✅ CONFORME'}`
          ).join('\n') + '\n';
        }
      } catch(e) { /* ignore database error */ }
    }

    // ponytail: RAG context for richer generation
    let ragContext = '';
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      ragContext = await memory.retrieveContext(projectId, `${item.text} ${fieldsSummary.substring(0, 200)}`, 'policy', 3) || '';
    } catch(e) { /* vectorize may not be populated yet */ }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento completo em formato markdown para "${item.text}" da organização "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).

DADOS FORNECIDOS PELO USUÁRIO:
${fieldsSummary}

${interviewsSummary ? '\nDADOS COLETADOS NAS ENTREVISTAS POR TRILHA:\n' + interviewsSummary + '\n' : ''}

${ragContext ? 'CONTEXTO ADICIONAL DA ORGANIZAÇÃO:\n' + ragContext + '\n' : ''}

REQUISITOS:
- Documento profissional, completo e pronto para auditoria ISO 27001:2022
- Use os dados fornecidos acima para personalizar o conteúdo
- Incluir seções de: Objetivo, Escopo, Definições, Conteúdo Principal, Responsabilidades, Revisões
- Formato markdown limpo, sem placeholders
- Tom formal e executivo
- Incluir referências às cláusulas ISO relevantes`;

    const result = await agent.run(prompt, { organizationId: projectId });
    const content = result.success ? result.content : `# ${item.text}\n\nDocumento gerado para ${project.client_name}.\n\n${fieldsSummary}`;

    return c.json({ ok: true, content });
  } catch (e: any) {
    return c.json({ error: 'Erro ao gerar documento', detail: e.message }, 500);
  }
});

// POST /api/v1/projects/:id/approve-document
policies.post('/api/v1/projects/:id/approve-document', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<{ itemId: string; content: string }>().catch(() => ({} as any));
    const { itemId, content } = body;
    if (!itemId || !content) return c.json({ error: 'itemId and content are required' }, 400);
    
    // ponytail: validate document size maximum limit (2MB) to prevent Edge memory exhaustion
    if (content.length > 2 * 1024 * 1024) {
      return c.json({ error: 'Document size exceeds 2MB limit' }, 400);
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const found = findChecklistItem(itemId);
    if (!found) return c.json({ error: 'Item não encontrado' }, 404);
    const { item, phaseNumber } = found;
    const userEmail = c.get('user')?.email ?? 'system';
    const userId = c.get('user')?.id ?? null;

    // Save to R2
    const r2Key = `projects/${projectId}/evidence/${itemId}.md`;
    await c.env.STORAGE.put(r2Key, content, { httpMetadata: { contentType: 'text/markdown' } });

    // Hash
    const data = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Create evidence record
    const evidenceId = crypto.randomUUID();
    const fileName = `${item.text}.md`;
    await c.env.DB.prepare(
      'INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evidenceId, projectId, fileName, r2Key, hashHex, 'text/markdown', data.byteLength, userEmail, 'conforme', 'Documento gerado e aprovado via wizard guiado.').run();

    // Auto-check checklist item
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id, notes)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, 'Aprovado via wizard guiado')
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
         is_checked = 1, checked_by = EXCLUDED.checked_by, checked_at = CURRENT_TIMESTAMP,
         evidence_id = EXCLUDED.evidence_id, notes = EXCLUDED.notes`
    ).bind(projectId, phaseNumber, itemId, userId, evidenceId).run();

    // Store in RAG
    try {
      const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
      await memory.storeFact(projectId, `Doc aprovado ${item.text}: ${content.substring(0, 500)}`, 'policy', { itemId });
    } catch(e) { /* non-blocking */ }

    await logAudit(c.env.DB, 'document.approved', userEmail, `Documento "${fileName}" aprovado via wizard para item ${itemId}`);

    return c.json({ ok: true, evidence_id: evidenceId, file_name: fileName });
  } catch (e: any) {
    return c.json({ error: 'Erro ao aprovar documento', detail: e.message }, 500);
  }
});

// POST /api/v1/projects/:id/checklist/:itemId/generate
policies.post('/api/v1/projects/:id/checklist/:itemId/generate', async (c) => {
  try {
    const projectId = c.req.param('id');
    const itemId = c.req.param('itemId');
    const userEmail = c.get('user')?.email ?? 'system';

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const found = findChecklistItem(itemId);
    if (!found) return c.json({ error: 'Item de checklist não encontrado' }, 404);

    const { item, phaseNumber } = found;

    // Gerar conteúdo com o PolicyAgent
    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento ou política detalhada em formato markdown para atender ao item de checklist "${item.text}" do projeto "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}). O documento deve ser completo, profissional, prático e pronto para auditoria, sem placeholders e com formatação markdown limpa.`;
    
    const result = await agent.run(prompt, { organizationId: projectId });
    let docContent = result.success ? result.content : `# ${item.text}\n\nEste documento foi criado automaticamente para fins de conformidade.\n\nOrganização: ${project.client_name}`;

    // Salvar no R2
    const r2Key = `projects/${projectId}/evidence/${itemId}.md`;
    await c.env.STORAGE.put(r2Key, docContent, { httpMetadata: { contentType: 'text/markdown' } });

    // Calcular hash SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(docContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Criar registro na tabela de evidence
    const evidenceId = crypto.randomUUID();
    const fileName = `${item.text}.md`;
    const fileSize = data.byteLength;

    await c.env.DB.prepare(
      'INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      evidenceId,
      projectId,
      fileName,
      r2Key,
      hashHex,
      'text/markdown',
      fileSize,
      userEmail,
      'conforme',
      'Documento gerado internamente pelo assistente de IA.'
    ).run();

    // Atualizar checklist_progress (ponytail: ensure proper random UUID / PK generated for checklist_progress)
    const userId = c.get('user')?.id ?? null;
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id, notes)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, 'Gerado automaticamente pelo sistema')
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
         is_checked = 1,
         checked_by = EXCLUDED.checked_by,
         checked_at = CURRENT_TIMESTAMP,
         evidence_id = EXCLUDED.evidence_id,
         notes = EXCLUDED.notes`
    ).bind(projectId, phaseNumber, itemId, userId, evidenceId).run();

    await logAudit(c.env.DB, 'document.generated', userEmail, `Documento ${fileName} gerado internamente para o item ${itemId}`);

    return c.json({
      ok: true,
      evidence_id: evidenceId,
      file_name: fileName,
      r2_key: r2Key
    });
  } catch (e: any) {
    return c.json({ error: 'Erro ao gerar documento', detail: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  BULK POLICY GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

policies.post('/api/v1/projects/:id/generate-policies-bulk', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const body = await c.req.json<{ control_ids?: string[] }>();
    const controlIds = body.control_ids?.length
      ? body.control_ids
      : ['A.5.1', 'A.5.2', 'A.5.3', 'A.5.4', 'A.5.8', 'A.5.9', 'A.5.10'];

    // ponytail: build org memory once, reuse for all controls
    let orgMemory = '';
    if (project.assessment_id) {
      const { results: answers } = await c.env.DB.prepare(
        'SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ? AND answer IS NOT NULL'
      ).bind(project.assessment_id).all<{ question_key: string; answer: string }>();
      orgMemory = (answers || []).map(a => `${a.question_key}: ${a.answer}`).join('\n');
    }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const policies: { control_id: string; success: boolean; content_preview: string }[] = [];
    let successful = 0;
    let failed = 0;

    // ponytail: sequential to respect Cloudflare AI rate limits
    for (const controlId of controlIds) {
      try {
        let ragContext = '';
        try {
          const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
          ragContext = await memory.retrieveContext(projectId, `policy ${controlId}`, 'policy', 3);
        } catch (_) { /* vectorize may not be populated yet */ }

        const result = await agent.run(
          `Gere uma política completa para o controle ${controlId} da organização ${project.client_name} (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).`,
          {
            organizationId: projectId,
            controlId,
            organizationalMemory: [orgMemory, ragContext].filter(Boolean).join('\n---\n') || undefined,
          }
        );

        if (result.success) {
          successful++;
          const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');

          // Salvar markdown da política e limpar assinaturas de demonstração
          await c.env.DB.prepare(
            'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
          ).bind(result.content, normId, controlId, projectId).run();

          // Registrar histórico de versão
          try {
            const countRow = await c.env.DB.prepare(
              'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
            ).bind(projectId, normId, controlId).first<{ count: number }>();
            const nextVer = (countRow?.count || 0) + 1;
            const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            await c.env.DB.prepare(
              'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(versionId, projectId, normId, nextVer, result.content, c.get('user')?.email || 'system').run();
          } catch (e) {
            console.error("Erro ao registrar versão no bulk", e);
          }

          await logAudit(c.env.DB, 'policy.generated', c.get('user')?.email ?? 'system', `Bulk policy generated: ${controlId}, project ${projectId}`);
          try {
            const memory = new MemoryService(c.env.AI, c.env.VECTOR_INDEX);
            await memory.storeFact(projectId, `Política ${controlId}: ${result.content.substring(0, 500)}`, 'policy', { controlId });
          } catch (_) { /* non-blocking */ }
        } else {
          failed++;
        }
        policies.push({ control_id: controlId, success: result.success, content_preview: result.content?.substring(0, 200) ?? '' });
      } catch (e: any) {
        failed++;
        policies.push({ control_id: controlId, success: false, content_preview: e.message });
      }
    }

    return c.json({ ok: true, total: controlIds.length, successful, failed, policies });
  } catch (e: any) {
    return c.json({ error: 'Falha na geração em lote', detail: e.message }, 500);
  }
});

policies.get('/api/v1/projects/:id/controls/:controlId/versions', async (c) => {
  const projectId = c.req.param('id');
  const controlIdRaw = c.req.param('controlId');
  const normId = 'ctrl-' + controlIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const result = await c.env.DB.prepare(
    'SELECT id, version, created_by, created_at FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
  ).bind(projectId, normId, controlIdRaw).all();
  
  return c.json(result.results || []);
});

policies.get('/api/v1/projects/:id/controls/:controlId/versions/:versionId', async (c) => {
  const projectId = c.req.param('id');
  const controlIdRaw = c.req.param('controlId');
  const versionId = c.req.param('versionId');
  const normId = 'ctrl-' + controlIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const row = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE id = ? AND project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(versionId, projectId, normId, controlIdRaw).first<any>();
  
  if (!row) return c.json({ error: 'Versão da política não encontrada' }, 404);
  return c.json(row);
});

policies.post('/api/v1/projects/:id/controls/:controlId/restore-version', async (c) => {
  const projectId = c.req.param('id');
  const controlIdRaw = c.req.param('controlId');
  const { version_id } = await c.req.json<{ version_id: string }>();
  const normId = 'ctrl-' + controlIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const row = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE id = ? AND project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(version_id, projectId, normId, controlIdRaw).first<any>();
  
  if (!row) return c.json({ error: 'Versão da política não encontrada' }, 404);
  
  // Update compliance_controls description
  await c.env.DB.prepare(
    'UPDATE compliance_controls SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
  ).bind(row.policy_text, normId, controlIdRaw, projectId).run();
  
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(projectId, normId, controlIdRaw).first<{ count: number }>();
  const nextVer = (countRow?.count || 0) + 1;
  const newVerId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  
  await c.env.DB.prepare(
    'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newVerId, projectId, normId, nextVer, row.policy_text, c.get('user')?.email || 'system').run();
  
  await logAudit(c.env.DB, 'policy.restored', c.get('user')?.email || 'system', `Política ${controlIdRaw} restaurada para versão ${row.version}, projeto ${projectId}`);
  
  return c.json({ ok: true, version: nextVer, policy_markdown: row.policy_text });
});

policies.get('/api/v1/projects/:id/controls/:controlId/govbr-signatures', async (c) => {
  const projectId = c.req.param('id');
  const controlId = c.req.param('controlId');
  const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const result = await c.env.DB.prepare(
    'SELECT id, signed_by_name, signed_by_cpf, signature_type, created_at FROM govbr_signatures WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(projectId, normId, controlId).all();
  
  return c.json(result.results || []);
});

policies.get('/api/v1/projects/:id/controls/:controlId/govbr/start', async (c) => {
  const projectId = c.req.param('id');
  const controlId = c.req.param('controlId');
  const type = c.req.query('type') || 'ciso';
  
  const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const latestVersion = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
  ).bind(projectId, normId, controlId).first<any>();
  
  if (!latestVersion) {
    return c.html('<h3>Erro: Nenhuma política gerada para este controle. Gere a política primeiro antes de assinar.</h3>');
  }
  
  const clientId = c.env.GOVBR_CLIENT_ID;
  const state = `${projectId}:${controlId}:${latestVersion.id}:${type}`;
  const nonce = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  
  if (!clientId || c.env.GOVBR_ENVIRONMENT === 'homologation-mock' || !c.env.GOVBR_CLIENT_SECRET) {
    const mockRedirect = `/public/govbr-mock-portal?state=${state}&nonce=${nonce}`;
    return c.redirect(mockRedirect);
  }
  
  const isProd = c.env.GOVBR_ENVIRONMENT === 'production';
  const server = isProd ? 'cas.gov.br' : 'cas.staging.iti.br';
  const redirectUri = c.env.GOVBR_REDIRECT_URI || `https://${c.req.header('host')}/api/v1/govbr/callback`;
  const scope = 'sign govbr';
  
  const authUrl = `https://${server}/oauth2.0/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&nonce=${nonce}`;
  return c.redirect(authUrl);
});

policies.get('/api/v1/govbr/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state') || '';
  const error = c.req.query('error');
  
  if (error) {
    return c.html(`<h3>Assinatura gov.br cancelada ou falhou: ${error}</h3>`);
  }
  
  const [projectId, controlId, policyVersionId, type] = state.split(':');
  if (!projectId || !controlId || !policyVersionId || !type) {
    return c.html('<h3>Erro: Parâmetros de estado (state) inválidos no callback.</h3>');
  }
  
  const normId = 'ctrl-' + controlId.toLowerCase().replace(/[^a-z0-9]/g, '');
  let name = 'Assinante gov.br';
  let cpf = '***.***.***-**';
  let signatureData = 'pkcs7-signature-payload-mock';
  
  const clientId = c.env.GOVBR_CLIENT_ID;
  if (!clientId || c.env.GOVBR_ENVIRONMENT === 'homologation-mock' || !c.env.GOVBR_CLIENT_SECRET || code?.startsWith('mock-')) {
    if (code?.startsWith('mock-')) {
      const parts = code.split('-');
      name = decodeURIComponent(parts[1] || 'CISO nISO');
      cpf = parts[2] || '***.456.789-**';
    }
    signatureData = `MOCK-PKCS7-SIGNATURE-FOR-${policyVersionId}`;
  } else {
    try {
      const isProd = c.env.GOVBR_ENVIRONMENT === 'production';
      const server = isProd ? 'cas.gov.br' : 'cas.staging.iti.br';
      const redirectUri = c.env.GOVBR_REDIRECT_URI || `https://${c.req.header('host')}/api/v1/govbr/callback`;
      
      const tokenRes = await fetch(`https://${server}/oauth2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code || '',
          client_id: clientId,
          grant_type: 'authorization_code',
          client_secret: c.env.GOVBR_CLIENT_SECRET,
          redirect_uri: redirectUri
        })
      });
      
      if (!tokenRes.ok) {
        throw new Error('Falha ao obter token da API gov.br');
      }
      
      const tokenData = await tokenRes.json<{ access_token: string }>();
      
      const apiDomain = isProd ? 'assinatura-api.iti.gov.br' : 'assinatura-api.staging.iti.br';
      const certRes = await fetch(`https://${apiDomain}/externo/v2/certificadoPublico`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      
      if (certRes.status === 403) {
        return c.html(`
          <div style="font-family:'Inter',sans-serif; text-align:center; padding:3rem; background:#070b14; color:#f5f5f7; height:100vh">
            <h2 style="color:var(--danger)">Conta Nível Bronze Detectada</h2>
            <p>É necessário possuir conta gov.br nível prata ou ouro para utilizar o serviço de assinatura.</p>
            <p style="margin-top:2rem"><a href="https://confiabilidades.acesso.gov.br/" target="_blank" style="color:#00ade8; text-decoration:none; font-weight:bold; border:1px solid #00ade8; padding:8px 16px; border-radius:6px">Fazer Upgrade da Conta</a></p>
          </div>
        `);
      }
      
      try {
        const payloadBase64 = tokenData.access_token.split('.')[1];
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64));
          name = payload.nome || payload.name || name;
          cpf = payload.cpf || cpf;
        }
      } catch(e) {}
      
      const policyVersion = await c.env.DB.prepare(
        'SELECT policy_text FROM policy_versions WHERE id = ?'
      ).bind(policyVersionId).first<{ policy_text: string }>();
      
      if (policyVersion) {
        const textBytes = new TextEncoder().encode(policyVersion.policy_text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', textBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashBase64 = btoa(String.fromCharCode(...hashArray));
        
        const signRes = await fetch(`https://${apiDomain}/externo/v2/assinarPKCS7`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ hashBase64 })
        });
        
        if (signRes.ok) {
          signatureData = await signRes.text();
        }
      }
    } catch(e: any) {
      return c.html(`<h3>Erro técnico durante a assinatura: ${e.message}</h3>`);
    }
  }
  
  let maskedCpf = cpf;
  if (cpf.length === 11) {
    maskedCpf = `***.${cpf.substring(3,6)}.${cpf.substring(6,9)}-**`;
  }
  
  const sigId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  await c.env.DB.prepare(
    'INSERT INTO govbr_signatures (id, project_id, control_id, policy_version_id, signed_by_name, signed_by_cpf, signature_type, signature_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(sigId, projectId, normId, policyVersionId, name, maskedCpf, type, signatureData).run();
  
  if (type === 'ciso') {
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET ciso_approved_by = ?, ciso_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(name, normId, controlId, projectId).run();
  } else {
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET ceo_approved_by = ?, ceo_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(name, normId, controlId, projectId).run();
  }
  
  await logAudit(c.env.DB, 'policy.govbr_signed', name, `Política ${controlId} assinada digitalmente via gov.br como ${type.toUpperCase()}`);
  
  return c.html(`
    <script>
      if (window.opener) {
        window.opener.showToast('Assinatura gov.br realizada com sucesso!');
        if (window.opener.openGeneratePolicyModal) {
          window.opener.openGeneratePolicyModal('${projectId}', '${controlId}');
        }
        if (window.opener.render) {
          window.opener.render();
        }
        window.close();
      } else {
        document.write("<h3>Assinatura realizada! Você pode fechar esta aba e atualizar a tela do nISO.</h3>");
      }
    </script>
  `);
});

policies.get('/public/govbr-mock-portal', (c) => {
  const state = c.req.query('state') || '';
  
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Portal de Assinatura Digital Simulado — gov.br</title>
      <style>
        body { font-family: 'Inter', sans-serif; background: #070b14; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; color: #f5f5f7; }
        .card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(24px); border-radius: 12px; width: 420px; padding: 2rem; border-top: 5px solid #00ade8; }
        .logo { font-size: 1.8rem; font-weight: bold; color: #00ade8; text-align: center; margin-bottom: 1.5rem; font-family: 'Montserrat', sans-serif; }
        .form-group { margin-bottom: 1.25rem; }
        label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.4rem; color: rgba(229,235,255,0.6); text-transform: uppercase; letter-spacing: 0.05em; }
        input, select { width: 100%; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-sizing: border-box; background: rgba(255,255,255,0.03); color: #f5f5f7; font-size: 0.85rem; }
        input:focus, select:focus { outline: none; border-color: #00ade8; }
        .btn { display: block; width: 100%; padding: 12px; border: none; border-radius: 8px; background: #00ade8; color: #000; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; margin-top: 1.5rem; font-size: 0.9rem; transition: background 0.2s; }
        .btn:hover { background: #008ec2; }
        .hint { font-size: 0.7rem; color: rgba(229,235,255,0.4); text-align: center; margin-top: 1.5rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">gov.br</div>
        <h4 style="margin-top:0; text-align:center; color:#f5f5f7; font-family:'Montserrat',sans-serif">Simulador de Assinatura Avançada</h4>
        <p style="font-size:0.8rem; color:rgba(229,235,255,0.6); text-align:center; margin-bottom:1.5rem">Ambiente de Homologação / Sandbox do nISO</p>
        
        <div id="step-1">
          <div class="form-group">
            <label>Nível da Identidade Digital</label>
            <select id="mock-level">
              <option value="prata">Prata / Ouro (Permite Assinatura)</option>
              <option value="bronze">Bronze (Bloquear e Exigir Upgrade)</option>
            </select>
          </div>
          <div class="form-group">
            <label>CPF do Assinante</label>
            <input type="text" id="mock-cpf" value="123.456.789-00">
          </div>
          <div class="form-group">
            <label>Nome Completo do Cidadão</label>
            <input type="text" id="mock-name" value="Dr. Carlos Silva (CISO)">
          </div>
          <button class="btn" onclick="nextStep()">Avançar para Assinatura</button>
        </div>
        
        <div id="step-2" style="display:none">
          <p style="font-size:0.8rem; color:rgba(229,235,255,0.8); text-align:center; margin-bottom:1.5rem">Um código de autorização foi enviado para o seu aplicativo gov.br.</p>
          <div class="form-group">
            <label>Código de Autorização (Digite: 12345)</label>
            <input type="text" id="mock-sms" placeholder="Digite o código de 5 dígitos">
          </div>
          <button class="btn" onclick="sign()">Confirmar Assinatura Digital</button>
        </div>
        
        <div class="hint">Roteiro de integração do Assinador avançada gov.br 1.0</div>
      </div>
      
      <script>
        function nextStep() {
          const level = document.getElementById('mock-level').value;
          if (level === 'bronze') {
            alert('Atenção: Contas de nível Bronze não possuem permissão para assinar. Redirecionando para o portal de upgrade de confiabilidade.');
            window.location.href = 'https://confiabilidades.acesso.gov.br/';
            return;
          }
          document.getElementById('step-1').style.display = 'none';
          document.getElementById('step-2').style.display = 'block';
        }
        
        function sign() {
          const sms = document.getElementById('mock-sms').value;
          if (sms !== '12345') {
            alert('Código incorreto! Digite 12345 para testes de homologação.');
            return;
          }
          const name = encodeURIComponent(document.getElementById('mock-name').value);
          const cpfRaw = document.getElementById('mock-cpf').value.replace(/\D/g, '');
          const code = 'mock-' + name + '-' + cpfRaw;
          
          window.location.href = '/api/v1/govbr/callback?code=' + code + '&state=${state}';
        }
      </script>
    </body>
    </html>
  `;
  return c.html(html);
});
// --- TEMPLATES DE POLÍTICAS ---
policies.get('/api/v1/policies/templates', async (c) => {
  try {
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);
    const templates = await generator.listAvailableTemplates('v2022');
    return c.json({ ok: true, templates });
  } catch (e: any) {
    return c.json({ error: 'Falha ao listar templates', detail: e.message }, 500);
  }
});

policies.get('/api/v1/policies/templates/:templateName', async (c) => {
  try {
    const templateName = c.req.param('templateName');
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);
    const markdown = await generator.generate(templateName, {
      organizationName: '[Nome da Organização]',
      policyOwner: 'Consultor nISO',
      approver: 'Direção Executiva',
      status: 'Draft',
      standardVersion: 'v2022'
    });
    return c.json({ ok: true, markdown });
  } catch (e: any) {
    return c.json({ error: 'Falha ao obter conteúdo do template', detail: e.message }, 500);
  }
});

policies.post('/api/v1/projects/:id/policies/generate-from-template', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { template_name, control_id } = await c.req.json<{ template_name: string; control_id: string }>();

    if (!template_name || !control_id) {
      return c.json({ error: 'template_name e control_id são obrigatórios' }, 400);
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const user = c.get('user');
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);

    // Gerar conteúdo a partir do template com variáveis do projeto
    const markdown = await generator.generate(template_name, {
      organizationName: project.client_name,
      policyOwner: user?.name || 'Consultor nISO',
      approver: 'Direção Executiva',
      status: 'Draft',
      standardVersion: 'v2022'
    });

    // Save policy markdown directly to compliance_controls.description
    const normId = 'ctrl-' + control_id.toLowerCase().replace(/[^a-z0-9]/g, '');
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE (id = ? OR id = ?) AND project_id = ?'
    ).bind(markdown, normId, control_id, projectId).run();

    // Insert new version in policy_versions
    try {
      const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
      ).bind(projectId, normId, control_id).first<{ count: number }>();
      const nextVer = (countRow?.count || 0) + 1;
      const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(
        'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(versionId, projectId, normId, nextVer, markdown, user?.email || 'system').run();
    } catch (e) {
      console.error("Erro ao registrar versão da política", e);
    }

    await logAudit(c.env.DB, 'policy.generated_from_template', user?.email ?? 'system', `Política gerada via template ${template_name} para o controle ${control_id}, projeto ${projectId}`);

    return c.json({
      ok: true,
      policy_markdown: markdown,
      control: control_id
    });
  } catch (e: any) {
    return c.json({ error: 'Falha ao gerar política a partir de template', detail: e.message }, 500);
  }
});


export default policies;
