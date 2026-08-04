import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { configDefaults } from 'vitest/config';

export default defineWorkersConfig({
  test: {
    // Esta suíte roda no runtime de Workers. `frontend/` tem a sua própria, sob
    // jsdom (`frontend/vitest.config.js`), e os testes de lá se penduram em
    // `window`/`localStorage`: varridos por aqui, quebram com "window is not
    // defined", que parece bug do teste e é só escopo errado do config.
    //
    // `.claude/` guarda os worktrees dos agentes. Sem excluí-los, a suíte varre
    // cópias inteiras dela mesma e a contagem triplica (81 arquivos onde são
    // ~30) — não afeta o CI, mas engana quem roda local.
    //
    // `exclude` SUBSTITUI os defaults do vitest, então `configDefaults.exclude`
    // (node_modules, dist, .idea, .git, .cache) precisa ser reincluído — sem
    // isso o vitest passaria a varrer `node_modules`.
    exclude: [...configDefaults.exclude, 'frontend/**', '.claude/**'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.jsonc' },
      },
    },
  },
});
