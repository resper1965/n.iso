import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, erro500, logAudit, sha256Hex } from '../helpers';
import { PHASE_QUESTIONS, PHASE_META, PhaseQuestion } from '../phase-questions';
import { PhaseInterpretationAgent, parseInterpretacao } from '../agents/phase-interpretation';

// Questionário POR FASE da jornada — banco de perguntas + respostas por projeto.
// F1: preencher e persistir. A interpretação coesa (AssessmentAgent) é a F2.

// Banco de perguntas (fonte única). Montado em /api/v1/phase-questions.
export const phaseQuestionsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
phaseQuestionsApp.get('/', (c) => c.json(PHASE_QUESTIONS));

// Respostas por projeto. Montado em /api/v1/projects/:projectId/phase-answers.
export const projectPhaseAnswersApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function foraDoEscopo(c: any, projectId: string): boolean {
  const user = c.get('user');
  return !!(user?.client_project_id && user.client_project_id !== projectId);
}

// GET: todas as respostas salvas do projeto (para repopular o formulário).
projectPhaseAnswersApp.get('/', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);
    const { results } = await c.env.DB.prepare(
      'SELECT phase_number, question_key, answer FROM project_phase_answers WHERE project_id = ?'
    ).bind(projectId).all();
    return c.json(results ?? []);
  } catch (e: any) {
    return erro500(c, 'Falha ao carregar respostas da jornada', e);
  }
});

// Normaliza e valida UM valor de resposta contra a definição da pergunta. Devolve
// a string a persistir, '' para "apagar esta resposta", ou null se o valor for
// inválido (tipo errado, opção fora do domínio) — o chamador então recusa o corpo.
function normalizarValor(q: PhaseQuestion, val: unknown): string | null {
  // Só primitivos viram resposta. Objetos/arrays aninhados são payload malformado
  // (viravam "[object Object]" no String() ingênuo) — recusa.
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return null;
  const s = String(val).trim();
  if (s === '') return '';

  if (q.type === 'select') {
    return (q.options ?? []).includes(s) ? s : null;
  }
  if (q.type === 'multi') {
    // Frontend envia as marcações unidas por '||'. Toda parte tem de ser uma opção.
    const partes = s.split('||').map((p) => p.trim()).filter(Boolean);
    const dominio = new Set(q.options ?? []);
    if (!partes.every((p) => dominio.has(p))) return null;
    return partes.join('||');
  }
  return s; // texto aberto
}

// PUT: upsert das respostas de UMA fase. Body: { phase_number, answers: {key: val} }.
projectPhaseAnswersApp.put('/', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);

    type Corpo = { phase_number?: unknown; answers?: unknown };
    const body = await c.req.json<Corpo>().catch(() => ({} as Corpo));

    // phase_number tem de ser um NÚMERO (não string, não null) e uma fase REAL do
    // banco. Sem o typeof, Number(null)=0 mapeava, sem querer, para a fase 0.
    const phase = body.phase_number;
    if (typeof phase !== 'number' || !Number.isInteger(phase) || !PHASE_QUESTIONS[phase]) {
      return c.json({ error: 'phase_number deve ser uma fase válida da jornada' }, 400);
    }
    // answers tem de ser um objeto puro — array (typeof []==='object') não vale.
    const answers = body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return c.json({ error: 'answers deve ser um objeto { key: valor }' }, 400);
    }

    const proj = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Só perguntas que pertencem à fase — não deixa gravar pergunta forjada.
    const porChave = new Map((PHASE_QUESTIONS[phase] ?? []).map((q) => [q.key, q]));

    const gravar: { key: string; valor: string }[] = [];
    const apagar: string[] = [];
    for (const [key, raw] of Object.entries(answers as Record<string, unknown>)) {
      const q = porChave.get(key);
      if (!q) continue; // chave forjada / fora da fase: ignora
      const valor = normalizarValor(q, raw);
      if (valor === null) {
        return c.json({ error: `Valor inválido para "${key}"` }, 400);
      }
      // Resposta vazia não vira linha órfã: apaga a existente (mantém o contador honesto).
      if (valor === '') apagar.push(key);
      else gravar.push({ key, valor });
    }

    const stmts = gravar.map(({ key, valor }) =>
      c.env.DB.prepare(
        `INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, phase_number, question_key)
         DO UPDATE SET answer = excluded.answer, updated_at = datetime('now')`
      ).bind(genId(), projectId, phase, key, valor)
    );
    for (const key of apagar) {
      stmts.push(
        c.env.DB.prepare(
          'DELETE FROM project_phase_answers WHERE project_id = ? AND phase_number = ? AND question_key = ?'
        ).bind(projectId, phase, key)
      );
    }
    if (stmts.length) await c.env.DB.batch(stmts);

    // Dado de conformidade muda → registra na trilha de auditoria (append-only).
    const user = c.get('user');
    await logAudit(
      c.env.DB,
      'project.phase_answers.saved',
      user?.email ?? 'system',
      `Questionário da fase ${phase} salvo no projeto ${projectId} (${gravar.length} gravadas, ${apagar.length} limpas)`,
      '',
      c.req.header('CF-Connecting-IP') ?? '',
      projectId
    );

    return c.json({ ok: true, saved: gravar.length, cleared: apagar.length });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar respostas da jornada', e);
  }
});

// GET /:phase/interpret — interpretação COESA das respostas de UMA fase (F2).
// Camada determinística SEMPRE presente (cobertura + perguntas sem resposta) e,
// se houver binding de IA, o diagnóstico específico do PhaseInterpretationAgent
// por cima. A IA é assistiva: qualquer falha degrada para o determinístico puro.
projectPhaseAnswersApp.get('/:phase/interpret', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    if (foraDoEscopo(c, projectId)) return c.json({ error: 'Forbidden: fora do escopo do projeto' }, 403);

    const phase = Number(c.req.param('phase'));
    const perguntas = PHASE_QUESTIONS[phase];
    if (!Number.isInteger(phase) || !perguntas) {
      return c.json({ error: 'Fase inválida' }, 400);
    }
    const proj = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Respostas salvas desta fase (só desta fase).
    const { results } = await c.env.DB.prepare(
      'SELECT question_key, answer FROM project_phase_answers WHERE project_id = ? AND phase_number = ?'
    ).bind(projectId, phase).all();
    const respostas = new Map<string, string>();
    for (const r of (results ?? []) as any[]) {
      const v = (r.answer ?? '').toString().trim();
      if (v) respostas.set(r.question_key, v);
    }

    // Determinístico: cobertura e perguntas materiais sem resposta.
    const semResposta = perguntas.filter((q) => !respostas.has(q.key));
    const cobertura = {
      total: perguntas.length,
      respondidas: perguntas.length - semResposta.length,
      sem_resposta: semResposta.map((q) => ({ pergunta_key: q.key, pergunta: q.question })),
    };

    const meta = PHASE_META[phase] ?? { titulo: `Fase ${phase}`, clausula: '' };

    // Retrato para a IA: cada pergunta com sua resposta (ou "(sem resposta)").
    const estado = perguntas
      .map((q) => `- [${q.key}] ${q.question}\n  Resposta: ${respostas.get(q.key) ?? '(sem resposta)'}`)
      .join('\n');

    // Assinatura das respostas desta fase — muda quando qualquer resposta muda.
    // É o que invalida o cache: interpretação salva com hash diferente = stale.
    const canonico = [...respostas.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const answersHash = await sha256Hex(`p${phase}\n${canonico}`);

    // Interpretação já persistida desta fase (o cache).
    const cacheRow = await c.env.DB.prepare(
      'SELECT interpretacao, fonte, answers_hash, model, generated_at FROM project_phase_interpretations WHERE project_id = ? AND phase_number = ?'
    ).bind(projectId, phase).first<any>();
    const cachedObj = (() => {
      if (!cacheRow?.interpretacao) return null;
      try { return JSON.parse(cacheRow.interpretacao); } catch { return null; }
    })();
    const cacheFresh = !!cachedObj && cacheRow.answers_hash === answersHash;

    const forceRefresh = c.req.query('refresh') === '1';
    const aiOff = c.req.query('ai') === '0';

    let interpretacao: any = null;
    // 'ia' = fresca do agente; 'ia_cache' = servida do cache válido; 'ia_desatualizada'
    // = cache servido porque as respostas mudaram ou a IA falhou agora.
    let fonte: 'ia' | 'ia_cache' | 'ia_desatualizada' | 'sem_ia' | 'sem_respostas' | 'erro_ia' | 'formato_invalido' | 'desativada' = 'sem_ia';
    let motivo = '';
    let fromCache = false;
    let generatedAt = new Date().toISOString();
    let modelUsed = '';

    // Serve o cache existente (com o rótulo certo) — usado quando não vamos rodar
    // a IA agora (desligada, sem binding, ou falha) mas há interpretação salva.
    const servirCache = (motivoStale: string) => {
      interpretacao = cachedObj;
      fromCache = true;
      generatedAt = cacheRow.generated_at ?? generatedAt;
      modelUsed = cacheRow.model ?? '';
      if (cacheFresh) { fonte = 'ia_cache'; }
      else { fonte = 'ia_desatualizada'; motivo = motivoStale; }
    };

    if (aiOff) {
      if (cachedObj) servirCache('Respostas mudaram desde esta interpretação; recarregue sem ai=0 para atualizar.');
      else { fonte = 'desativada'; motivo = 'Interpretação por IA desativada nesta chamada.'; }
    } else if (!c.env.AI) {
      if (cachedObj) servirCache('Respostas mudaram desde esta interpretação; sem binding de IA para atualizar.');
      else { fonte = 'sem_ia'; motivo = 'Binding de IA ausente neste ambiente.'; }
    } else if (respostas.size === 0) {
      fonte = 'sem_respostas'; motivo = 'Nenhuma resposta registrada nesta fase.';
    } else if (cacheFresh && !forceRefresh) {
      // Cache válido: NÃO chama a IA — é o ganho principal (custo/latência).
      servirCache('');
    } else {
      // Gera de novo (sem cache, respostas mudaram, ou refresh forçado) e persiste.
      try {
        const agent = new PhaseInterpretationAgent(c.env.AI, c.env.DB, c.env);
        const resp = await agent.run(estado, {
          organizationId: projectId, titulo: meta.titulo, clausula: meta.clausula,
        });
        if (resp.success) {
          const parsed = parseInterpretacao(resp.content, new Set(perguntas.map((q) => q.key)));
          if (parsed) {
            interpretacao = { ...parsed, origem: 'ia' };
            fonte = 'ia';
            modelUsed = (resp.metadata?.model ?? '').toString();
            await c.env.DB.prepare(
              `INSERT INTO project_phase_interpretations (project_id, phase_number, interpretacao, fonte, answers_hash, model, generated_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(project_id, phase_number)
               DO UPDATE SET interpretacao = excluded.interpretacao, fonte = excluded.fonte,
                             answers_hash = excluded.answers_hash, model = excluded.model, generated_at = datetime('now')`
            ).bind(projectId, phase, JSON.stringify(interpretacao), 'ia', answersHash, modelUsed).run();
          } else if (cachedObj) {
            servirCache('A IA respondeu fora do formato; mantendo a última interpretação salva.');
          } else {
            fonte = 'formato_invalido'; motivo = 'A IA respondeu, mas fora do formato esperado.';
          }
        } else if (cachedObj) {
          servirCache(`Falha na IA (${resp.metadata?.error ?? 'desconhecida'}); mantendo a última interpretação salva.`);
        } else {
          fonte = 'erro_ia'; motivo = `Falha na chamada de IA: ${resp.metadata?.error ?? 'desconhecida'}`;
        }
      } catch (e: any) {
        // Aterramento: a IA nunca derruba a resposta — cai no cache se houver.
        if (cachedObj) servirCache(`Erro ao interpretar (${e?.message ?? e}); mantendo a última interpretação salva.`);
        else { fonte = 'erro_ia'; motivo = `Erro ao interpretar: ${e?.message ?? e}`; }
      }
      if (!interpretacao) console.error('[phase-interpret]', projectId, 'fase', phase, '→', motivo);
    }

    return c.json({
      generated_at: generatedAt,   // quando a interpretação servida foi gerada (cache = data original)
      project_id: projectId,
      phase,
      titulo: meta.titulo,
      clausula: meta.clausula,
      rotulo: 'Interpretação assistida da fase — revisar; não é parecer de certificação',
      cobertura,
      fonte,          // 'ia'/'ia_cache' quando há diagnóstico; senão o motivo da ausência
      from_cache: fromCache,   // true quando veio da interpretação salva (não re-rodou a IA)
      model: modelUsed,
      motivo,         // '' quando fresco/cache válido; senão a causa (para UI e log)
      interpretacao,  // null quando sem IA/sem respostas — o consumidor usa a cobertura
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao interpretar respostas da fase', e);
  }
});
