// Configuracao dedicada ao vitest. Fica separada do `vite.config.js` de
// proposito: o build de producao usa `index.html` como unica entrada e nao pode
// enxergar `test/`. Vitest prefere `vitest.config.*` quando os dois existem, e
// `npm run build` continua lendo so o `vite.config.js`.
import { defineConfig } from 'vitest/config';

// Reporters extras SO em CI (GITHUB_ACTIONS): local fica com o `default` limpo.
// - `github-actions`: anota a falha na LINHA exata dentro do diff do PR.
// - `junit`: XML que o GitHub resume em "X passaram / Y falharam" por teste.
const ci = !!process.env.GITHUB_ACTIONS;

export default defineConfig({
  test: {
    // jsdom porque o codigo do frontend e ESM que se pendura em `window` no
    // topo do modulo. Sem `window`/`document`, importar qualquer arquivo de
    // src/ quebra antes do primeiro assert.
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    setupFiles: ['./test/setup.js'],
    restoreMocks: true,
    reporters: ci
      ? ['default', 'github-actions', ['junit', { outputFile: 'test-results/frontend-junit.xml' }]]
      : ['default'],
    coverage: {
      // So roda com `--coverage` (script `test:coverage`); `npm test` continua rapido.
      provider: 'v8',
      include: ['src/**/*.js'],
      // `all: true` conta TODO o src/, inclusive arquivos que nenhum teste importa,
      // senao a % mede so o pedaco exercitado e esconde o que nao tem teste.
      all: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Piso de catraca: fixado logo abaixo do atual (2026-08, ~9% stmts após os
      // testes de fluxo da jornada) para barrar REGRESSAO sem inventar meta. Subir
      // conforme os testes crescem. As demais views grandes (dashboard/admin) ainda
      // nao tem teste unitario — cobertura real delas viria de E2E (Playwright).
      thresholds: {
        statements: 8,
        branches: 6,
        functions: 7,
        lines: 8,
      },
    },
  },
});
