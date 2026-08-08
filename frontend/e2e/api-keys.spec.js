import { test, expect } from '@playwright/test';

// Jornada da tela API Keys (exclusiva do Platform Admin) — a mesma que a
// validação E2E do MCP usa para emitir as chaves consultor/auditor.
//
// A API é mockada por interceptação. Isto NÃO testa o backend (há testes de
// worker para isso) — testa o que só um navegador real revela: a tela renderiza,
// o gate de papel funciona, o modal cria a chave e a exibe uma única vez, e a
// revogação chama o endpoint certo.

const ADMIN = { id: 'u-admin', email: 'admin@ness.io', name: 'Admin', role: 'platform_admin' };

// Semeia sessão no localStorage ANTES do app rodar (o boot lê `niso_token`/`niso_user`).
async function seedSession(page, user) {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
  }, user);
}

// Carrega o app, ESPERA o boot assentar e então força a view. O boot faz sua
// própria navegação inicial (ex.: org_user cai em project-detail); sem esperar,
// o `navigate` corre com ela e a view certa é sobrescrita. `networkidle` garante
// que as chamadas de boot (auth/me, projects) terminaram antes de navegar.
async function bootAndOpen(page, view) {
  await page.goto('/login.html');
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);
  await page.waitForLoadState('networkidle');
  await page.evaluate((v) => window.navigate(v), view);
}

// Roteador de API com estado: o POST de criação passa a aparecer no GET seguinte,
// e o DELETE remove — espelhando o ciclo real sem backend.
async function mockApi(page, user) {
  const keys = [];
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (obj, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

    if (path === '/api/v1/auth/me') return json({ user });
    if (path === '/api/v1/projects' && method === 'GET')
      return json([{ id: 'proj-e2e', client_name: 'Cliente E2E', project_name: 'Projeto E2E' }]);

    // Listar chaves do projeto (envelope { ok, keys })
    if (/\/api\/v1\/projects\/[^/]+\/api-keys$/.test(path) && method === 'GET')
      return json({ ok: true, keys });

    // Criar chave: devolve o texto puro UMA vez e passa a listar
    if (/\/api\/v1\/projects\/[^/]+\/api-keys$/.test(path) && method === 'POST') {
      const body = req.postDataJSON() || {};
      const id = 'k-' + (keys.length + 1);
      keys.push({ id, name: body.name, permissions: body.permissions, status: 'Active', created_at: '2026-08-08', last_used_at: null });
      return json({ ok: true, id, key: 'niso-e2e-PLAINTEXT-SECRET-123' });
    }

    // Revogar
    if (/\/api\/v1\/api-keys\/[^/]+$/.test(path) && method === 'DELETE') {
      const id = path.split('/').pop();
      const k = keys.find((x) => x.id === id);
      if (k) k.status = 'Revoked';
      return json({ ok: true });
    }

    // Catch-all inócuo para o resto do boot não quebrar.
    return json(method === 'GET' ? [] : { ok: true });
  });
}

test('platform_admin: abre a tela, cria a chave (exibida uma vez) e revoga', async ({ page }) => {
  await seedSession(page, ADMIN);
  await mockApi(page, ADMIN);
  await bootAndOpen(page, 'api-keys');

  await expect(page.locator('#header-title')).toHaveText('API Keys (MCP / Integrações)');
  const novaChave = page.getByRole('button', { name: '+ Nova Chave', exact: true });
  await expect(novaChave).toBeVisible();

  // Cria uma chave de auditor.
  await novaChave.click();
  await page.fill('#apikey-name', 'e2e-auditor');
  await page.selectOption('#apikey-perm', 'auditor');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();

  // A chave em texto puro aparece UMA vez.
  await expect(page.locator('#apikey-plain')).toHaveValue('niso-e2e-PLAINTEXT-SECRET-123');
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();

  // A chave criada aparece na tabela.
  await expect(page.getByText('e2e-auditor')).toBeVisible();
  await expect(page.locator('code', { hasText: 'auditor' })).toBeVisible();

  // Revoga (confirm() nativo → aceitar).
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Revogar', exact: true }).click();

  // Após revogar, a linha não oferece mais o botão Revogar (status != Active).
  await expect(page.getByRole('button', { name: 'Revogar', exact: true })).toHaveCount(0);
});

test('gate de papel: conta não-admin vê "Acesso restrito"', async ({ page }) => {
  const leitor = { id: 'u-leitor', email: 'leitor@c.com', name: 'Leitor', role: 'org_user', client_project_id: 'proj-e2e' };
  await seedSession(page, leitor);
  await mockApi(page, leitor);
  await bootAndOpen(page, 'api-keys');

  await expect(page.locator('.error')).toContainText('Acesso restrito ao Platform Admin');
  await expect(page.getByRole('button', { name: '+ Nova Chave', exact: true })).toHaveCount(0);
});
