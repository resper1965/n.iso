import { test, expect } from '@playwright/test';

// Questionário por fase — navegador real. Exercita o modal (render dos campos por
// tipo) e o salvar (PUT), com a API mockada. O banco de perguntas é injetado em
// S.phaseQuestions (o que o render da jornada faz ao carregar), evitando montar a
// árvore pesada da jornada só para chegar no botão.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor', client_project_id: 'proj-e2e' };

test('abre o questionário da fase, preenche e salva', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E' }));
  }, USER);

  let putBody = null;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.pathname === '/api/v1/auth/me') return json({ user: USER });
    if (/\/phase-answers$/.test(url.pathname) && route.request().method() === 'PUT') {
      putBody = route.request().postDataJSON();
      return json({ ok: true, saved: 2 });
    }
    return json(route.request().method() === 'GET' ? [] : { ok: true });
  });

  await page.goto('/login.html');
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);

  // Injeta o banco (como o load da jornada faria) e abre o questionário da fase 1.
  await page.evaluate(() => {
    window.S.phaseQuestions = { 1: [
      { key: 'p1_q1', type: 'select', question: 'Apetite de risco declarado pela direção?', options: ['Baixo', 'Moderado', 'Alto'] },
      { key: 'p1_q2', type: 'text', question: 'Quais os 3 principais objetivos de negócio?' },
    ] };
    window.S.phaseAnswers = {};
    window.openPhaseQuestionnaire(1, 'proj-e2e');
  });

  // O modal mostra as perguntas especializadas.
  await expect(page.locator('.modal')).toContainText('Apetite de risco');
  await expect(page.locator('.modal')).toContainText('principais objetivos de negócio');

  // Preenche e salva.
  await page.selectOption('#pq-p1_q1', 'Moderado');
  await page.fill('#pq-p1_q2', 'Proteger receita, marca e dados de clientes');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  // O PUT saiu com as respostas da fase.
  await expect.poll(() => putBody && putBody.phase_number).toBe(1);
  expect(putBody.answers.p1_q1).toBe('Moderado');
  expect(putBody.answers.p1_q2).toContain('Proteger receita');
});

test('interpreta a fase e mostra o diagnóstico específico', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E' }));
  }, USER);

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.pathname === '/api/v1/auth/me') return json({ user: USER });
    if (/\/phase-answers\/1\/interpret$/.test(url.pathname)) {
      return json({
        generated_at: new Date().toISOString(), project_id: 'proj-e2e', phase: 1,
        titulo: 'Entrevista Executiva', clausula: '5.2 & 6.2',
        rotulo: 'Interpretação assistida da fase — revisar; não é parecer de certificação',
        cobertura: { total: 2, respondidas: 1, sem_resposta: [{ pergunta_key: 'p1_q2', pergunta: 'Objetivos de negócio?' }] },
        fonte: 'ia',
        interpretacao: {
          prontidao: 'critico', origem: 'ia',
          resumo: 'Apetite de risco não definido compromete a base da fase.',
          pontos: [{ severidade: 'alto', pergunta_key: 'p1_q1', observacao: 'Sem apetite de risco declarado pela direção.' }],
          proximos_passos: ['Formalizar o apetite de risco em ata da direção.'],
        },
      });
    }
    return json(route.request().method() === 'GET' ? [] : { ok: true });
  });

  await page.goto('/login.html');
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);

  await page.evaluate(() => {
    window.S.phaseQuestions = { 1: [
      { key: 'p1_q1', type: 'select', question: 'Apetite de risco declarado pela direção?', options: ['Baixo', 'Moderado', 'Alto', 'Não definido'] },
      { key: 'p1_q2', type: 'text', question: 'Quais os 3 principais objetivos de negócio?' },
    ] };
    window.S.phaseAnswers = { 1: { p1_q1: 'Não definido' } };
    window.interpretPhaseAnswers(1, 'proj-e2e');
  });

  // O diagnóstico específico aparece: prontidão, resumo citando a resposta e o passo.
  await expect(page.locator('.modal')).toContainText('Crítico');
  await expect(page.locator('.modal')).toContainText('Apetite de risco não definido');
  await expect(page.locator('.modal')).toContainText('Formalizar o apetite de risco');
  await expect(page.locator('.modal')).toContainText('1/2 perguntas respondidas');
});
