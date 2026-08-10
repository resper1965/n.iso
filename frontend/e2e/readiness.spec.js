import { test, expect } from '@playwright/test';

// Diagnóstico de Prontidão ("gap em voo") — E2E de navegador real com a API
// mockada. Verifica que o botão dispara o diagnóstico e o painel renderiza os
// achados agrupados com o rótulo de "não é auditoria".

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor', client_project_id: 'proj-e2e' };

async function seed(page) {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E' }));
  }, USER);
}

async function mockApi(page) {
  await page.route('**/api/v1/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    if (p === '/api/v1/auth/me') return json({ user: USER });
    if (/\/readiness-check$/.test(p)) return json({
      generated_at: '2026-08-09T00:00:00Z',
      project_id: 'proj-e2e',
      rotulo: 'Auto-diagnóstico de prontidão (não é auditoria nem parecer de certificação)',
      resumo: { critico: 1, alto: 1, medio: 0, total: 2 },
      achados: [
        { categoria: 'doc_inconsistente', severidade: 'critico', requisito: 'Assinatura sem lastro', referencia: 'c2', descricao: 'Controle "Acesso" está aprovado mas sem evidência.' },
        { categoria: 'evidencia_faltante', severidade: 'alto', requisito: 'Evidência do controle', referencia: 'c1', descricao: 'Controle "Política" está "Implemented" mas sem evidência.' },
      ],
      ai_observacoes: [],
    });
    return json(route.request().method() === 'GET' ? [] : { ok: true });
  });
}

test('abre o diagnóstico de prontidão e mostra os achados agrupados', async ({ page }) => {
  await seed(page);
  await mockApi(page);
  await page.goto('/login.html');
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.navigate('controls'));

  const botao = page.getByRole('button', { name: 'Diagnóstico de prontidão', exact: true });
  await expect(botao).toBeVisible();
  await botao.click();

  // Painel: rótulo de não-auditoria + resumo + os dois achados.
  await expect(page.locator('.modal')).toContainText('não é auditoria');
  await expect(page.locator('.modal')).toContainText('Documentos inconsistentes');
  await expect(page.locator('.modal')).toContainText('Evidências faltando');
  await expect(page.locator('.modal')).toContainText('aprovado mas sem evidência');
});
