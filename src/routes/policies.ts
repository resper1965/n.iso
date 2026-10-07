import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { PHASE_POLICY_DOCS, ChecklistItem } from '../checklists';
import { validateBody, politicaGerarSchema, documentoGerarSchema, documentoAprovarSchema, politicasLoteSchema, versaoRestaurarSchema, politicaTextoSchema, politicaDeTemplateSchema } from '../schemas';
import { genId, idDoControle, logAudit, escapeHtml, erro500, registraErro } from '../helpers';
import { PolicyAgent } from '../agents/policy';
import { PolicyGeneratorService, TemplateNaoEncontrado } from '../services/policy-generator';
import { conferirPedidosDoDocumento } from './pedidos';

const policies = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ═══════════════════════════════════════════════════════════════════════════════
//  POLICY AGENT — Geração Automática de Políticas
// ═══════════════════════════════════════════════════════════════════════════════

policies.post('/api/v1/projects/:projectId/generate-policy', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    // Corpo opcional: sem JSON vale o padrão; com JSON, o formato é validado.
    const parsed = politicaGerarSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Payload inválido' }, 400);
    const body = parsed.data;

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

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const result = await agent.run(
      `Gere uma política completa para o controle ${controlId} da organização ${project.client_name} (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).`,
      {
        organizationId: projectId,
        controlId,
        organizationalMemory: orgMemory || undefined,
      }
    );

    if (!result.success) {
      // result.content traz o texto cru de cada provedor de IA: vai ao log, não ao cliente.
      return erro500(c, 'Falha ao gerar política', new Error(result.content));
    }

    // Save policy markdown directly to compliance_controls.description
    const idLinha = await idDoControle(c.env.DB, projectId, controlId);
    if (!idLinha) return c.json({ error: 'Controle não encontrado' }, 404);
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
    ).bind(result.content, idLinha, projectId).run();
    await conferirPedidosDoDocumento(c, 'politica', idLinha, projectId);

    // Insert new version in policy_versions
    try {
      const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
      ).bind(projectId, idLinha, controlId).first<{ count: number }>();
      const nextVer = (countRow?.count || 0) + 1;
      const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(
        'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(versionId, projectId, idLinha, nextVer, result.content, c.get('user')?.email || 'system').run();
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
    return erro500(c, 'Falha ao gerar política', e);
  }
});

// Helper para encontrar item de checklist
function findChecklistItem(itemId: string): { item: ChecklistItem; phaseNumber: number } | null {
  for (const phaseStr in PHASE_POLICY_DOCS) {
    const phaseNumber = parseInt(phaseStr);
    const item = PHASE_POLICY_DOCS[phaseNumber].find(i => i.id === itemId);
    if (item) return { item, phaseNumber };
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DOCUMENT WIZARD — Guided Document Generation with Field Context
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/projects/:id/generate-document
policies.post('/api/v1/projects/:projectId/generate-document', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, documentoGerarSchema);
    if (!v.success) return v.response;
    const { itemId, fields } = v.data;

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

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento completo em formato markdown para "${item.text}" da organização "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).

DADOS FORNECIDOS PELO USUÁRIO:
${fieldsSummary}

${interviewsSummary ? '\nDADOS COLETADOS NAS ENTREVISTAS POR TRILHA:\n' + interviewsSummary + '\n' : ''}

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
    return erro500(c, 'Erro ao gerar documento', e);
  }
});

// POST /api/v1/projects/:id/approve-document
policies.post('/api/v1/projects/:projectId/approve-document', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, documentoAprovarSchema);
    if (!v.success) return v.response;
    const { itemId, content } = v.data;

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
    ).bind(evidenceId, projectId, fileName, r2Key, hashHex, 'text/markdown', data.byteLength, userEmail, 'conforming', 'Documento gerado e aprovado via wizard guiado.').run();

    // Auto-check checklist item
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id, notes)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, 'Aprovado via wizard guiado')
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
         is_checked = 1, checked_by = EXCLUDED.checked_by, checked_at = CURRENT_TIMESTAMP,
         evidence_id = EXCLUDED.evidence_id, notes = EXCLUDED.notes`
    ).bind(projectId, phaseNumber, itemId, userId, evidenceId).run();

    await logAudit(c.env.DB, 'document.approved', userEmail, `Documento "${fileName}" aprovado via wizard para item ${itemId}`);

    return c.json({ ok: true, evidence_id: evidenceId, file_name: fileName });
  } catch (e: any) {
    return erro500(c, 'Erro ao aprovar documento', e);
  }
});

// POST /api/v1/projects/:id/checklist/:itemId/generate
policies.post('/api/v1/projects/:projectId/checklist/:itemId/generate', async (c) => {
  try {
    const projectId = c.req.param('projectId');
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
      'conforming',
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
    return erro500(c, 'Erro ao gerar documento', e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  BULK POLICY GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

policies.post('/api/v1/projects/:projectId/generate-policies-bulk', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const v = await validateBody(c, politicasLoteSchema);
    if (!v.success) return v.response;
    const controlIds = v.data.control_ids?.length
      ? v.data.control_ids
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
    const policies: { control_id: string; success: boolean; content_preview: string; error?: string; request_id?: string }[] = [];
    let successful = 0;
    let failed = 0;

    // ponytail: sequential to respect Cloudflare AI rate limits
    for (const controlId of controlIds) {
      try {
        const result = await agent.run(
          `Gere uma política completa para o controle ${controlId} da organização ${project.client_name} (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).`,
          {
            organizationId: projectId,
            controlId,
            organizationalMemory: orgMemory || undefined,
          }
        );

        if (result.success) {
          const idLinha = await idDoControle(c.env.DB, projectId, controlId);
          if (!idLinha) {
            // Controle que não existe no projeto: pula, sem gravar versão órfã.
            failed++;
            policies.push({ control_id: controlId, success: false, content_preview: '', error: 'Controle não encontrado' });
            continue;
          }
          successful++;

          // Salvar markdown da política e limpar assinaturas de demonstração
          await c.env.DB.prepare(
            'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
          ).bind(result.content, idLinha, projectId).run();
          await conferirPedidosDoDocumento(c, 'politica', idLinha, projectId);

          // Registrar histórico de versão
          try {
            const countRow = await c.env.DB.prepare(
              'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
            ).bind(projectId, idLinha, controlId).first<{ count: number }>();
            const nextVer = (countRow?.count || 0) + 1;
            const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            await c.env.DB.prepare(
              'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(versionId, projectId, idLinha, nextVer, result.content, c.get('user')?.email || 'system').run();
          } catch (e) {
            console.error("Erro ao registrar versão no bulk", e);
          }

          await logAudit(c.env.DB, 'policy.generated', c.get('user')?.email ?? 'system', `Bulk policy generated: ${controlId}, project ${projectId}`);
          policies.push({ control_id: controlId, success: true, content_preview: result.content.substring(0, 200) });
        } else {
          failed++;
          // Em falha, result.content é o erro cru de cada provedor de IA: vai ao
          // log, e o item leva só mensagem fixa e o request_id.
          policies.push({ control_id: controlId, success: false, content_preview: '', error: 'Falha ao gerar política', request_id: registraErro(c, new Error(result.content)) });
        }
      } catch (e: any) {
        failed++;
        // `content_preview` é prévia de política; devolver a exceção aqui punha a
        // mensagem crua do D1 dentro de uma resposta 200. O detalhe vai ao log.
        registraErro(c, e);
        policies.push({ control_id: controlId, success: false, content_preview: '' });
      }
    }

    return c.json({ ok: true, total: controlIds.length, successful, failed, policies });
  } catch (e: any) {
    return erro500(c, 'Falha na geração em lote', e);
  }
});

policies.get('/api/v1/projects/:projectId/controls/:controlId/versions', async (c) => {
  const projectId = c.req.param('projectId');
  const controlIdRaw = c.req.param('controlId');
  const controlId = await idDoControle(c.env.DB, projectId, controlIdRaw);
  if (!controlId) return c.json({ error: 'Controle não encontrado' }, 404);

  const result = await c.env.DB.prepare(
    'SELECT id, version, created_by, created_at FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
  ).bind(projectId, controlId, controlIdRaw).all();

  return c.json(result.results || []);
});

policies.get('/api/v1/projects/:projectId/controls/:controlId/versions/:versionId', async (c) => {
  const projectId = c.req.param('projectId');
  const controlIdRaw = c.req.param('controlId');
  const versionId = c.req.param('versionId');
  const controlId = await idDoControle(c.env.DB, projectId, controlIdRaw);
  if (!controlId) return c.json({ error: 'Controle não encontrado' }, 404);

  const row = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE id = ? AND project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(versionId, projectId, controlId, controlIdRaw).first<any>();

  if (!row) return c.json({ error: 'Versão da política não encontrada' }, 404);
  return c.json(row);
});

policies.post('/api/v1/projects/:projectId/controls/:controlId/restore-version', async (c) => {
  const projectId = c.req.param('projectId');
  const controlIdRaw = c.req.param('controlId');
  const v = await validateBody(c, versaoRestaurarSchema);
  if (!v.success) return v.response;
  const { version_id } = v.data;
  const controlId = await idDoControle(c.env.DB, projectId, controlIdRaw);
  if (!controlId) return c.json({ error: 'Controle não encontrado' }, 404);

  const row = await c.env.DB.prepare(
    'SELECT * FROM policy_versions WHERE id = ? AND project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(version_id, projectId, controlId, controlIdRaw).first<any>();

  if (!row) return c.json({ error: 'Versão da política não encontrada' }, 404);

  // Update compliance_controls description
  await c.env.DB.prepare(
    'UPDATE compliance_controls SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
  ).bind(row.policy_text, controlId, projectId).run();
  await conferirPedidosDoDocumento(c, 'politica', controlId, projectId);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
  ).bind(projectId, controlId, controlIdRaw).first<{ count: number }>();
  const nextVer = (countRow?.count || 0) + 1;
  const newVerId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);

  await c.env.DB.prepare(
    'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newVerId, projectId, controlId, nextVer, row.policy_text, c.get('user')?.email || 'system').run();

  await logAudit(c.env.DB, 'policy.restored', c.get('user')?.email || 'system', `Política ${controlIdRaw} restaurada para versão ${row.version}, projeto ${projectId}`);

  return c.json({ ok: true, version: nextVer, policy_markdown: row.policy_text });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EDIÇÃO MANUAL DE POLÍTICA — sem IA, texto fornecido diretamente pelo chamador
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/projects/:id/controls/:controlId/policy
policies.post('/api/v1/projects/:projectId/controls/:controlId/policy', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const controlIdRaw = c.req.param('controlId');
    const v = await validateBody(c, politicaTextoSchema);
    if (!v.success) return v.response;
    const { text } = v.data;
    if (!text || !text.trim()) return c.json({ error: 'text é obrigatório' }, 400);

    // ponytail: mesmo limite de 2MB usado em approve-document, para evitar exaustão de memória na Edge
    if (text.length > 2 * 1024 * 1024) {
      return c.json({ error: 'Texto da política excede o limite de 2MB' }, 400);
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const controlId = await idDoControle(c.env.DB, projectId, controlIdRaw);
    const control = controlId && await c.env.DB.prepare(
      'SELECT id FROM compliance_controls WHERE id = ? AND project_id = ?'
    ).bind(controlId, projectId).first<{ id: string }>();
    if (!control) return c.json({ error: 'Controle não encontrado' }, 404);

    const userEmail = c.get('user')?.email ?? 'system';
    // control.id é o id canônico que de fato existe em compliance_controls (FK de policy_versions).
    const canonicalId = control.id;

    // Atualiza o texto "atual" e zera aprovações — o conteúdo mudou, aprovações anteriores não valem mais
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
    ).bind(text, canonicalId, projectId).run();
    await conferirPedidosDoDocumento(c, 'politica', canonicalId, projectId);

    // Registra a nova versão no histórico
    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND control_id = ?'
    ).bind(projectId, canonicalId).first<{ count: number }>();
    const nextVer = (countRow?.count || 0) + 1;
    const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await c.env.DB.prepare(
      'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(versionId, projectId, canonicalId, nextVer, text, userEmail).run();

    await logAudit(c.env.DB, 'policy.manually_edited', userEmail, `Política do controle ${canonicalId} editada manualmente (versão ${nextVer}), projeto ${projectId}`);

    return c.json({ ok: true, control_id: canonicalId, version: nextVer });
  } catch (e: any) {
    return erro500(c, 'Falha ao editar política', e);
  }
});

// --- TEMPLATES DE POLÍTICAS ---
policies.get('/api/v1/policies/templates', async (c) => {
  try {
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);
    const templates = await generator.listAvailableTemplates('v2022');
    return c.json({ ok: true, templates });
  } catch (e: any) {
    return erro500(c, 'Falha ao listar templates', e);
  }
});

policies.get('/api/v1/policies/templates/:templateName', async (c) => {
  try {
    const templateName = c.req.param('templateName');
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);
    const markdown = await generator.generate(templateName, {
      organizationName: '[Nome da Organização]',
      policyOwner: 'Consultor n.iso',
      approver: 'Direção Executiva',
      status: 'Draft',
      standardVersion: 'v2022'
    });
    return c.json({ ok: true, markdown });
  } catch (e: any) {
    // Nome de template que não existe é pedido inválido, não falha do servidor.
    if (e instanceof TemplateNaoEncontrado) return c.json({ error: 'Template não encontrado' }, 404);
    return erro500(c, 'Falha ao obter conteúdo do template', e);
  }
});

policies.post('/api/v1/projects/:projectId/policies/generate-from-template', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, politicaDeTemplateSchema);
    if (!v.success) return v.response;
    const { template_name, control_id } = v.data;

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const user = c.get('user');
    const generator = new PolicyGeneratorService('.', c.env.ASSETS);

    // Gerar conteúdo a partir do template com variáveis do projeto
    const markdown = await generator.generate(template_name, {
      organizationName: project.client_name,
      policyOwner: user?.name || 'Consultor n.iso',
      approver: 'Direção Executiva',
      status: 'Draft',
      standardVersion: 'v2022'
    });

    // Save policy markdown directly to compliance_controls.description
    const idLinha = await idDoControle(c.env.DB, projectId, control_id);
    if (!idLinha) return c.json({ error: 'Controle não encontrado' }, 404);
    await c.env.DB.prepare(
      'UPDATE compliance_controls SET description = ?, ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL, ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
    ).bind(markdown, idLinha, projectId).run();
    await conferirPedidosDoDocumento(c, 'politica', idLinha, projectId);

    // Insert new version in policy_versions
    try {
      const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?)'
      ).bind(projectId, idLinha, control_id).first<{ count: number }>();
      const nextVer = (countRow?.count || 0) + 1;
      const versionId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      await c.env.DB.prepare(
        'INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(versionId, projectId, idLinha, nextVer, markdown, user?.email || 'system').run();
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
    // Mesma distinção da rota de leitura: `template_name` vem do cliente, então
    // template inexistente é 404 do pedido, não 500 nosso.
    if (e instanceof TemplateNaoEncontrado) return c.json({ error: 'Template não encontrado' }, 404);
    return erro500(c, 'Falha ao gerar política a partir de template', e);
  }
});


export default policies;
