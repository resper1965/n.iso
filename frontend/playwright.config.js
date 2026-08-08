import { defineConfig, devices } from '@playwright/test';

// E2E de navegador REAL (Chromium) sobre o build servido — cobre o que o jsdom
// não pega: render de verdade, navegação, modais, clipboard. A API é mockada por
// interceptação (page.route), então NÃO precisa de backend/D1.
//
// O build é servido na porta 8787 DE PROPÓSITO: é a origem que `api()` usa em
// localhost (`API_BASE = http://127.0.0.1:8787`), então tudo fica same-origin e
// sem CORS/preflight.
//
// Chromium: no CI, `npx playwright install chromium` baixa o certo e o
// executablePath default resolve. Neste contêiner os browsers já estão em
// /opt/pw-browsers, mas numa revisão diferente da que o Playwright espera —
// então aponta-se via env PW_EXECUTABLE_PATH (ver package.json `test:e2e`).
const executablePath = process.env.PW_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'on-first-retry',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} } }],
  webServer: {
    command: 'python3 -m http.server 8787 --directory dist',
    url: 'http://127.0.0.1:8787/login.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
