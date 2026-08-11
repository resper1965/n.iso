import { test, expect } from '@playwright/test';

// Adequação de controles (F3) — navegador real. A IA sugere; o humano aprova.
// A API é mockada: GET suggestions devolve uma sugestão aterrada; POST apply
// confirma. Exercita o render das sugestões e o clique "Aplicar".

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor', client_project_id: 'proj-e2e' };

test('sugere adequação de controle e aplica com aprovação', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E' }));
  }, USER);

  let applyBody = null;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.pathname === '/api/v1/auth/me') return json({ user: USER });
    if (/\/control-adequacao\/15\/suggestions$/.test(url.pathname)) {
      return json({
        generated_at: new Date().toISOString(), project_id: 'proj-e2e', phase: 15,
        titulo: 'Controles Organizacionais', clausula: 'A.5',
        rotulo: 'Sugestões assistidas — só se aplicam após aprovação humana.',
        status_permitidos: ['Missing', 'Planned', 'In Progress', 'Partial', 'Not Applicable'],
        fonte: 'ia',
        sugestoes: [{
          control_id: 'A.5.1', control_title: 'Políticas de segurança',
          status_atual: 'Missing', maturidade_atual: 0,
          sugestao_status: 'In Progress', sugestao_maturidade: 2,
          pergunta_key: 'p15_q1', justificativa: 'Resposta indica política em elaboração.', origem: 'ia',
        }],
      });
    }
    if (/\/control-adequacao\/apply$/.test(url.pathname) && method === 'POST') {
      applyBody = route.request().postDataJSON();
      return json({ ok: true, control_id: 'A.5.1', applied: { status: 'In Progress', maturity: 2 } });
    }
    return json(method === 'GET' ? [] : { ok: true });
  });

  await page.goto('/login.html');
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);

  await page.evaluate(() => window.suggestControlAdequacao(15, 'proj-e2e'));

  // A sugestão aparece com o antes→depois e a justificativa.
  await expect(page.locator('.modal')).toContainText('A.5.1 — Políticas de segurança');
  await expect(page.locator('.modal')).toContainText('status: In Progress');
  await expect(page.locator('.modal')).toContainText('política em elaboração');

  // Aplica (aprovação humana) → confirma o POST e o feedback "Aplicado".
  await page.getByRole('button', { name: 'Aplicar ao controle', exact: true }).click();
  await expect(page.locator('.modal')).toContainText('✓ Aplicado');
  await expect.poll(() => applyBody && applyBody.control_id).toBe('A.5.1');
  expect(applyBody.status).toBe('In Progress');
  expect(applyBody.maturity).toBe(2);
  expect(applyBody.justificativa).toContain('elaboração');
});
