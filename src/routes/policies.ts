import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { itemDoChecklist, registrarDocumentoDoItem } from '../services/checklist-evidencia';
import { validateBody, politicaGerarSchema, documentoGerarSchema, documentoAprovarSchema, politicasLoteSchema, versaoRestaurarSchema, politicaTextoSchema, politicaDeTemplateSchema } from '../schemas';
import { semRastroDeAssinatura, idDoControle, logAudit, escapeHtml, erro500, registraErro, sha256Hex } from '../helpers';
import { PolicyAgent } from '../agents/policy';
import { PolicyGeneratorService, TemplateNaoEncontrado } from '../services/policy-generator';
import { gravarPolitica } from '../services/politica-escrita';

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

    // Resolve o controle antes de gastar chamada de IA.
    const idLinha = await idDoControle(c.env.DB, projectId, controlId);
    if (!idLinha) return c.json({ error: 'Controle não encontrado' }, 404);

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

    // Grava no controle (fonte até a 3.3), no histórico e no documento.
    await gravarPolitica(c, projectId, idLinha, result.content, c.get('user')?.email || 'system', 'gerador', { versaoOpcional: true });

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

    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item de checklist não encontrado' }, 404);

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

    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item não encontrado' }, 404);
    const userEmail = c.get('user')?.email ?? 'system';

    // Entra pendente: quem gerou não revisa. A revisão é a assinatura do Líder SGSI.
    const { evidenceId, fileName } = await registrarDocumentoDoItem(
      c.env, projectId, item, content, c.get('user'), 'Documento do assistente guiado; aguarda revisão.');

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

    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item de checklist não encontrado' }, 404);

    // Gerar conteúdo com o PolicyAgent
    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento ou política detalhada em formato markdown para atender ao item de checklist "${item.text}" do projeto "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}). O documento deve ser completo, profissional, prático e pronto para auditoria, sem placeholders e com formatação markdown limpa.`;

    const result = await agent.run(prompt, { organizationId: projectId });
    const docContent = result.success ? result.content : `# ${item.text}\n\nEste documento foi criado automaticamente para fins de conformidade.\n\nOrganização: ${project.client_name}`;

    // Rascunho de IA entra pendente de revisão, ligado ao controle do item quando ele tem um.
    const { evidenceId, fileName, r2Key } = await registrarDocumentoDoItem(
      c.env, projectId, item, docContent, c.get('user'), 'Rascunho gerado pelo assistente de IA; aguarda revisão.');

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
      // Controle que não existe no projeto: falha sem gastar chamada de IA nem gravar versão órfã.
      const idLinha = await idDoControle(c.env.DB, projectId, controlId);
      if (!idLinha) {
        failed++;
        policies.push({ control_id: controlId, success: false, content_preview: '', error: 'Controle não encontrado' });
        continue;
      }
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
          successful++;

          // Salvar markdown da política e limpar assinaturas de demonstração
          await gravarPolitica(c, projectId, idLinha, result.content, c.get('user')?.email || 'system', 'gerador', { versaoOpcional: true });

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

// ═══════════════════════════════════════════════════════════════════════════════
//  LEITURA DA POLÍTICA — o modal e o relatório. O id do controle chega em qualquer formato
//  ('ctrl-a51', 'A.5.1', 'ctrl_b_a51', genId) ou como código; idDoControle resolve preso ao projeto.
// ═══════════════════════════════════════════════════════════════════════════════

type ControleComPolitica = {
  id: string; project_id: string; title: string; description: string | null; status: string | null;
  ciso_approved_by: string | null; ciso_approved_at: string | null; ciso_approved_ip: string | null; ciso_approved_ua: string | null;
  ceo_approved_by: string | null; ceo_approved_at: string | null; ceo_approved_ip: string | null; ceo_approved_ua: string | null;
};

/** O controle do projeto com o texto da política e o SHA-256 desse texto (o que as assinaturas cobrem). */
async function politicaDoControle(db: D1Database, projectId: string, ref: string): Promise<{ control: ControleComPolitica; hash: string } | null> {
  const id = await idDoControle(db, projectId, ref);
  const control = id ? await db.prepare('SELECT * FROM compliance_controls WHERE id = ? AND project_id = ?')
    .bind(id, projectId).first<ControleComPolitica>() : null;
  if (!control) return null;
  return { control, hash: await sha256Hex(control.description ?? '') };
}

policies.get('/api/v1/projects/:projectId/controls/:controlId/policy', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const ref = c.req.param('controlId');
    const p = await politicaDoControle(c.env.DB, projectId, ref);
    if (!p) return c.json({ error: 'Controle não encontrado' }, 404);
    // `control_id = ref` cobre versões antigas gravadas com o código em vez do id (como em /versions).
    const { results: versions } = await c.env.DB.prepare(
      'SELECT id, version, created_by, created_at FROM policy_versions WHERE project_id = ? AND (control_id = ? OR control_id = ?) ORDER BY version DESC'
    ).bind(projectId, p.control.id, ref).all();
    return c.json({ ok: true, control: semRastroDeAssinatura(p.control), content: p.control.description ?? '', hash: p.hash, versions });
  } catch (e) {
    return erro500(c, 'Falha ao ler a política', e);
  }
});

// Relatório para imprimir pelo navegador, no padrão dos de ROPA e DPIA. Tudo que vem do banco passa
// por escapeHtml: título e texto da política são digitados ou gerados por IA.
policies.get('/api/v1/projects/:projectId/controls/:controlId/policy/report', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const project = await c.env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<{ client_name: string | null }>();
    const p = project ? await politicaDoControle(c.env.DB, projectId, c.req.param('controlId')) : null;
    if (!project || !p) return c.html('<h3>Política não encontrada</h3>', 404);
    const k = p.control;
    const assinatura = (rotulo: string, por: string | null, em: string | null) =>
      `<div class="label">${rotulo}</div><div class="value">${por ? `Assinado por ${escapeHtml(por)} em ${escapeHtml(em ?? '')}` : 'Aguardando assinatura'}</div>`;
    return c.html(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Política — ${escapeHtml(k.title)}</title>
  <style>
    body { background: #ffffff; color: #0f172a; font-family: Inter, system-ui, sans-serif; margin: 0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-family: Montserrat, Inter, sans-serif; font-weight: 600; font-size: 1.4rem; margin: 0 0 0.25rem; }
    .label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-top: 1rem; }
    .value { font-size: 0.95rem; margin-top: 4px; word-break: break-all; }
    .texto { white-space: pre-wrap; border-top: 1px solid #e2e8f0; margin-top: 1.5rem; padding-top: 1rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(k.title)}</h1>
    <div class="value">${escapeHtml(project.client_name ?? '')}</div>
    ${assinatura('Líder SGSI', k.ciso_approved_by, k.ciso_approved_at)}
    ${assinatura('Direção Executiva', k.ceo_approved_by, k.ceo_approved_at)}
    <div class="label">Integridade do texto da política (SHA-256 do texto; não é o hash do pedido de aprovação)</div><div class="value">${p.hash}</div>
    <div class="texto">${escapeHtml(k.description ?? '')}</div>
  </div>
</body>
</html>`);
  } catch (e) {
    return c.html(`<h3>Erro ao gerar o relatório da política</h3><p>Informe o identificador ao suporte: ${escapeHtml(registraErro(c, e))}</p>`, 500);
  }
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

  // Texto restaurado é texto diferente do assinado: zera as duas aprovações, como a edição e a geração.
  const { versao: nextVer } = await gravarPolitica(c, projectId, controlId, row.policy_text, c.get('user')?.email || 'system', 'humano');

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
    const { versao: nextVer } = await gravarPolitica(c, projectId, canonicalId, text, userEmail, 'humano');

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
    await gravarPolitica(c, projectId, idLinha, markdown, user?.email || 'system', 'gerador', { versaoOpcional: true });

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
