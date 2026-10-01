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

// Sem `node:fs`: o Vite entrega o texto (HTML) e a lista de arquivos de `public/` (funciona em qualquer SO).
const HTMLS = import.meta.glob(['../login.html', '../public/*.html'], { query: '?raw', import: 'default', eager: true });
const EM_PUBLIC = new Set(Object.keys(import.meta.glob('../public/*', { query: '?url', import: 'default' })).map((c) => c.replace('../public', '')));

/** HTML de origem: o da aplicação mais os das páginas públicas. */
const PAGINAS = Object.keys(HTMLS).map((c) => c.replace('../', ''));

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
    // Nomes, não contagem: a landing estática saiu (a tela de entrada é a
    // landing), e "mais de 2" passou a falhar sem nada ter quebrado.
    expect(PAGINAS).toEqual(expect.arrayContaining(['login.html', 'public/politicas.html']));
  });

  for (const pagina of PAGINAS) {
    it(`${pagina}: todo arquivo local referenciado existe`, () => {
      const html = HTMLS['../' + pagina];
      const referencias = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);

      const faltando = referencias
        .filter((r) => !EMPACOTADO.test(r) && !SEM_EXTENSAO(r))
        .filter((r) => !EM_PUBLIC.has(r));

      expect(
        faltando,
        `${pagina} pede arquivo que não existe em public/: ${faltando.join(', ')}`
      ).toEqual([]);
    });
  }
});
