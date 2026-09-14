// Todo arquivo que o HTML pede tem de existir.
//
// Recurso faltando não derruba a tela, e é por isso que passa despercebido: o
// ícone some da aba, o 404 fica no console de quem abrir o DevTools, e ninguém
// abre. A tela de entrada pedia `/favicon.png` — um arquivo que o projeto nunca
// teve, porque o ícone sempre foi `.svg`. Ficou assim por meses.
//
// Por que a verificação é ESTÁTICA e não de navegador: escrevi primeiro como
// e2e, e passou com o defeito de volta. Chromium headless simplesmente não
// busca favicon, então o 404 nunca acontecia para o teste ver. Ler o HTML e
// conferir o disco não depende de o navegador se interessar pelo arquivo.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// `cwd` é a raiz do vitest, que é `frontend/` aqui e no CI.
const raiz = process.cwd();

/** HTML de origem: o da aplicação mais os das páginas públicas. */
const PAGINAS = ['login.html', ...readdirSync(join(raiz, 'public')).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`)];

/**
 * `/src/...` é código que o Vite empacota e reescreve no build — o caminho do
 * fonte não sobrevive, e conferi-lo contra `public/` acusaria falso. O resto é
 * arquivo estático, servido como está, e tem de existir em `public/`.
 */
const EMPACOTADO = /^\/src\//;

/** Rota da aplicação, não arquivo (`/login` é servido pelo Worker). */
const SEM_EXTENSAO = (caminho) => !/\.\w+$/.test(caminho);

describe('recursos referenciados pelo HTML', () => {
  it('encontrou as páginas (senão o teste não mediria nada)', () => {
    expect(PAGINAS.length).toBeGreaterThan(2);
  });

  for (const pagina of PAGINAS) {
    it(`${pagina}: todo arquivo local referenciado existe`, () => {
      const html = readFileSync(resolve(raiz, pagina), 'utf8');
      const referencias = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);

      const faltando = referencias
        .filter((r) => !EMPACOTADO.test(r) && !SEM_EXTENSAO(r))
        .filter((r) => !existsSync(join(raiz, 'public', r)));

      expect(
        faltando,
        `${pagina} pede arquivo que não existe em public/: ${faltando.join(', ')}`
      ).toEqual([]);
    });
  }
});
