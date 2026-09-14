import { describe, it, expect } from 'vitest';

/**
 * Invariante: nenhum handler lê o corpo cru.
 *
 * Fechar os 12 writes que liam `c.req.json<any>()` resolve o passado. Este
 * teste é sobre o futuro: sem ele, a próxima rota entra sem schema e o gap
 * volta — foi assim que os 12 apareceram, um de cada vez, ao lado de 62 que
 * validavam.
 *
 * O corpo só deve entrar por `validateBody(c, schema)`, que devolve 400 no
 * formato do contrato (`test/validation-contract.test.ts`) em vez de deixar o
 * D1 recusar com 500.
 *
 * `?raw` inlina o fonte em tempo de build (Vite), então isto roda no pool
 * workerd sem tocar node:fs.
 */

const FONTES = import.meta.glob('../src/routes/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * Arquivos dispensados, com o motivo — a MESMA dispensa que a catraca de
 * `test/validacao-corpo.test.ts` já carrega, pelo mesmo argumento.
 *
 * `scim.ts` fala SCIM 2.0, e o corpo vem do IdP do cliente. Entra, Okta e Google
 * mandam formas diferentes para a mesma operação (o `PATCH` de desativação tem
 * duas sintaxes válidas na própria RFC 7644), e um schema estrito faria o
 * desprovisionamento simplesmente não acontecer com metade dos IdPs — em
 * silêncio, que é o pior modo de falha possível para esse controle. O handler
 * valida defensivamente o que USA.
 *
 * Dispensa órfã é pior que dispensa: o teste abaixo cobra que o arquivo exista.
 */
const DISPENSADOS: Record<string, string> = {
  'scim.ts': 'corpo definido pelo IdP (RFC 7644); schema estrito quebraria interoperabilidade',
};

describe('Contrato: todo write valida o corpo', () => {
  it('encontra os fontes de rota', () => {
    // Se o glob quebrar, o teste passaria vazio e não protegeria nada.
    expect(Object.keys(FONTES).length).toBeGreaterThan(20);
  });

  it('nenhuma rota lê o corpo com c.req.json<any>()', () => {
    const infratores = Object.entries(FONTES)
      .filter(([caminho]) => !caminho.endsWith('.test.ts'))
      .filter(([caminho]) => !((caminho.split('/').pop() ?? '') in DISPENSADOS))
      .flatMap(([caminho, fonte]) =>
        fonte
          .split('\n')
          .map((linha, i) => [linha, i + 1] as const)
          .filter(([linha]) => linha.includes('c.req.json<any>()'))
          // Ancorado: o glob devolve o caminho relativo a este arquivo
          // (`../src/routes/x.ts`) e o que se quer no relatório é a raiz do
          // repo. `replace('../', '')` sem âncora trocaria a primeira
          // ocorrência ONDE QUER que ela esteja — inclusive no meio de um nome
          // de diretório — e o CodeQL acusa isso com razão.
          .map(([, linha]) => `${caminho.replace(/^\.\.\//, '')}:${linha}`)
      );

    expect(
      infratores,
      `Corpo lido sem schema. Use validateBody(c, schema) — se o schema não existe, crie-o em src/schemas/.`
    ).toEqual([]);
  });

  it('nenhuma dispensa é órfã', () => {
    // Dispensa apontando para arquivo que já não existe dá a impressão de que
    // alguém decidiu algo sobre ele, e esconde que a decisão caducou.
    for (const arquivo of Object.keys(DISPENSADOS)) {
      expect(
        Object.keys(FONTES).some((k) => k.endsWith(`/${arquivo}`)),
        `dispensa órfã: ${arquivo}`
      ).toBe(true);
    }
  });
});
