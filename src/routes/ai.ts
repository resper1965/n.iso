import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit } from '../helpers';
import { AssessmentAgent } from '../agents/assessment';
import { KnowledgeService } from '../services/knowledge-service';

export const aiApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// AI Compliance Chatbot
aiApp.post('/projects/:id/chat', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json<{ message: string }>();
  if (!body.message?.trim()) return c.json({ error: 'Message is required' }, 400);

  const project = await c.env.DB.prepare('SELECT client_name, scope, sector FROM projects WHERE id = ?').bind(projectId).first<any>();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const systemPrompt = `Você é o Assistente Virtual de Conformidade ISO 27001 / ISO 27701 da ness.
Seu objetivo é auxiliar a equipe do projeto da empresa "${project.client_name}" (Setor: ${project.sector || 'Geral'}, Escopo: ${project.scope || 'SGSI Completo'}).
Responda de forma clara, objetiva, profissional e baseada estritamente nas normas ISO/IEC 27001:2022 e ISO/IEC 27701:2019/2025.
Seja solícito e forneça exemplos práticos quando solicitado.`;

  try {
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: body.message }
      ]
    }) as any;

    const reply = aiResponse.response || 'Desculpe, não consegui processar sua solicitação no momento.';
    await logAudit(c.env.DB, 'ai.chat', user?.email || 'system', `Pergunta ao AI Assistant no projeto ${projectId}: "${body.message.substring(0, 50)}..."`);

    return c.json({ ok: true, reply });
  } catch (err: any) {
    return c.json({ error: 'Erro ao comunicar com a IA', details: err.message }, 500);
  }
});

// AI Checklist Item Auditor
aiApp.post('/projects/:id/checklist/:itemId/audit', async (c) => {
  const projectId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const user = c.get('user');

  const project = await c.env.DB.prepare('SELECT project_name, client_name, sector, scope FROM projects WHERE id = ?').bind(projectId).first<any>();
  if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

  const progress = await c.env.DB.prepare('SELECT phase_number, is_checked, notes FROM checklist_progress WHERE project_id = ? AND item_id = ?').bind(projectId, itemId).first<any>();
  const notesText = progress?.notes || '';

  let phaseNum = progress?.phase_number || 0;
  if (!phaseNum) {
    const match = itemId.match(/^p(\d+)_/);
    phaseNum = match ? parseInt(match[1]) : 0;
  }

  const evidenceList = await c.env.DB.prepare('SELECT id, file_name, file_size, evaluation_status FROM evidence WHERE project_id = ? AND control_id = ?').bind(projectId, itemId).all();
  const evidences = (evidenceList.results || []) as Array<{ file_name: string; file_size: number; evaluation_status: string }>;

  let notesData: Record<string, any> = {};
  try {
    if (notesText.trim().startsWith('{')) {
      notesData = JSON.parse(notesText);
    } else {
      notesData.notes_extra = notesText;
    }
  } catch (e) {
    notesData.notes_extra = notesText;
  }

  const promptMessage = `Você é um Auditor Líder certificado em ISO/IEC 27001:2022 e especialista em conformidade GRC.
Seu objetivo é avaliar a conformidade da seguinte atividade do checklist de adequação do projeto:

Projeto: "${project.project_name || project.client_name}"
Setor de Atuação: "${project.sector || 'Não informado'}"
Escopo do SGSI: "${project.scope || 'Não informado'}"
ID da Atividade: "${itemId}"
Notas/Execução registradas pelo Consultor: "${notesData.notes_extra || 'Nenhuma nota registrada.'}"
Respostas do questionário do playbook: ${JSON.stringify(notesData)}

Arquivos de Evidência anexados:
${evidences.length > 0 
  ? evidences.map(e => `- Arquivo: ${e.file_name} (${(e.file_size / 1024).toFixed(1)} KB) - Status do Arquivo: ${e.evaluation_status}`).join('\n')
  : 'Nenhum arquivo de evidência foi anexado até o momento.'
}

Faça uma análise crítica baseada nas diretrizes formais da ISO 27001:2022.
Determine se o status é CONFORME (compliant) ou NÃO CONFORME (non_compliant). Para ser CONFORME, é necessário que haja descrição de execução consistente nas notas e que a evidência correspondente esteja presente (se aplicável para a categoria do item).
Determine a pontuação de maturidade CMM (Capability Maturity Model) recomendada de 0 a 5.
Escreva um Parecer Técnico ("audit_finding") resumido (máximo 4 linhas) e os Próximos Passos ("next_steps") para sanar quaisquer gaps.

Responda em PORTUGUÊS estritamente no formato JSON abaixo, sem blocos de código markdown ou texto extra:
{
  "status": "compliant" | "non_compliant",
  "cmm_score": número (0 a 5),
  "audit_finding": "sua análise aqui",
  "next_steps": "recomendações de correção aqui"
}`;

  try {
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are an ISO 27001 Lead Auditor. Return only raw JSON as requested.' },
        { role: 'user', content: promptMessage }
      ]
    }) as any;

    const reply = aiResponse.response || '';
    
    let auditResult = {
      status: 'non_compliant',
      cmm_score: 1,
      audit_finding: 'Falha ao processar análise do Auditor IA.',
      next_steps: 'Por favor, tente rodar a auditoria novamente.'
    };
    
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.status) auditResult.status = parsed.status;
        if (typeof parsed.cmm_score === 'number') auditResult.cmm_score = parsed.cmm_score;
        if (parsed.audit_finding) auditResult.audit_finding = parsed.audit_finding;
        if (parsed.next_steps) auditResult.next_steps = parsed.next_steps;
      }
    } catch (pe) {
      console.error('Error parsing AI Auditor reply:', reply, pe);
    }

    notesData.audit_status = auditResult.status;
    notesData.cmm_score = auditResult.cmm_score;
    notesData.audit_finding = auditResult.audit_finding;
    notesData.next_steps = auditResult.next_steps;
    notesData.audited_at = new Date().toISOString();

    const newNotesText = JSON.stringify(notesData);
    const newIsChecked = (auditResult.status === 'compliant') ? 1 : (progress?.is_checked || 0);

    await c.env.DB.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET is_checked = excluded.is_checked, checked_by = excluded.checked_by, checked_at = excluded.checked_at, notes = excluded.notes`)
      .bind(projectId, phaseNum, itemId, newIsChecked, user?.id || null, newNotesText).run();

    await logAudit(c.env.DB, 'checklist.audit', user?.email || 'system', `Auditoria IA rodada para item ${itemId} do projeto ${projectId}. Status: ${auditResult.status}`);

    return c.json({
      ok: true,
      status: auditResult.status,
      cmm_score: auditResult.cmm_score,
      audit_finding: auditResult.audit_finding,
      next_steps: auditResult.next_steps,
      is_checked: newIsChecked === 1
    });

  } catch (err: any) {
    return c.json({ error: 'Erro ao rodar auditoria IA', details: err.message }, 500);
  }
});

// AI Executive Assessment Evaluation
aiApp.post('/projects/:id/assessment/evaluate', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  try {
    const project = await db.prepare('SELECT project_name, client_name, sector, scope FROM projects WHERE id = ?').bind(projectId).first() as any;
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const { results: interviews } = await db.prepare(
      'SELECT track, question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ?'
    ).bind(projectId).all() as any;

    if (!interviews || interviews.length === 0) {
      return c.json({ error: 'Nenhuma resposta de entrevista encontrada para este projeto. Por favor, responda o questionário no Playbook antes de rodar o diagnóstico.' }, 400);
    }

    const assessmentData = (interviews ?? []).map((i: any) => 
      `[Trilha: ${i.track}] Questão: ${i.question}\nResposta: ${i.answer}\nEntrevistado: ${i.interviewee}\nGap Detectado: ${i.gap_detected ? 'Sim' : 'Não'}`
    ).join('\n\n');

    const agent = new AssessmentAgent(c.env.AI, db, c.env);
    
    const context = {
      organizationId: projectId,
      standardReference: project.sector || 'Geral'
    };
    
    const result = await agent.run(assessmentData, context);
    
    if (!result.success) {
      return c.json({ error: 'Falha no processamento agêntico do diagnóstico', details: result.content }, 500);
    }

    let cmmScore = 1;
    const cmmMatch = result.content.match(/Nível CMM.*?(\d+)/i);
    if (cmmMatch) {
      cmmScore = parseInt(cmmMatch[1]);
    }

    const notesPayload = JSON.stringify({
      audit_status: cmmScore >= 3 ? 'compliant' : 'non_compliant',
      cmm_score: cmmScore,
      audit_finding: result.content,
      audited_at: new Date().toISOString()
    });

    const existingProgress = await db.prepare('SELECT id FROM checklist_progress WHERE project_id = ? AND item_id = "global_assessment"').bind(projectId).first();
    if (existingProgress) {
      await db.prepare('UPDATE checklist_progress SET is_checked = ?, notes = ?, checked_at = CURRENT_TIMESTAMP WHERE project_id = ? AND item_id = "global_assessment"').bind(
        cmmScore >= 3 ? 1 : 0,
        notesPayload,
        projectId
      ).run();
    } else {
      await db.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes)
        VALUES (lower(hex(randomblob(16))), ?, 0, 'global_assessment', ?, ?)`).bind(
          projectId,
          cmmScore >= 3 ? 1 : 0,
          notesPayload
        ).run();
    }

    await logAudit(db, 'project.assessment.evaluated', c.get('user')?.email || 'system', `Diagnóstico de Auto-Avaliação agêntico rodado para projeto ${projectId}`);

    return c.json({
      ok: true,
      cmm_score: cmmScore,
      report: result.content
    });

  } catch (err: any) {
    return c.json({ error: 'Erro ao rodar diagnóstico executivo', details: err.message }, 500);
  }
});

// MCP Protocol Endpoints
aiApp.get('/mcp', async (c) => {
  return c.json({
    mcp_version: '1.0',
    tools: [
      {
        name: 'get_project_knowledge',
        description: 'Busca semântica no cérebro do projeto (entrevistas, procedimentos, políticas).',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            query: { type: 'string' }
          },
          required: ['project_id', 'query']
        }
      },
      {
        name: 'check_control_compliance',
        description: 'Verifica o status de um controle ISO específico no projeto.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            control_id: { type: 'string' }
          },
          required: ['project_id', 'control_id']
        }
      }
    ]
  });
});

aiApp.post('/mcp/execute', async (c) => {
  const { tool, arguments: args } = await c.req.json();
  const service = new KnowledgeService(c.env);
  
  if (tool === 'get_project_knowledge') {
    const results = await service.search(args.project_id, args.query);
    return c.json({ results });
  }
  
  if (tool === 'check_control_compliance') {
    const ctrl = await c.env.DB.prepare('SELECT status, maturity FROM compliance_controls WHERE project_id = ? AND control_id = ?')
      .bind(args.project_id, args.control_id).first();
    return c.json({ control: ctrl || { status: 'Not Started' } });
  }

  return c.json({ error: 'Tool not found' }, 404);
});
