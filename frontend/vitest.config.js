// Configuracao dedicada ao vitest. Fica separada do `vite.config.js` de
// proposito: o build de producao usa `index.html` como unica entrada e nao pode
// enxergar `test/`. Vitest prefere `vitest.config.*` quando os dois existem, e
// `npm run build` continua lendo so o `vite.config.js`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom porque o codigo do frontend e ESM que se pendura em `window` no
    // topo do modulo. Sem `window`/`document`, importar qualquer arquivo de
    // src/ quebra antes do primeiro assert.
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    setupFiles: ['./test/setup.js'],
    restoreMocks: true,
  },
});
