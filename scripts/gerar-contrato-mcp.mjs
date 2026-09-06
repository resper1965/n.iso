/**
 * Escreve `mcp-server-niso/src/contrato-gerado.ts` a partir de `docs/openapi.json`.
 *
 * O objetivo é o item 3.2 do plano — "o MCP consome o contrato, não strings" — e
 * o critério de saída é literal: **o build do MCP quebra se um endpoint mudar de
 * forma**. Não é lint, não é aviso: é `tsc` falhando.
 *
 * O mecanismo é o tipo. `ROTAS` é um objeto `as const`, então `keyof typeof
 * ROTAS` é a união exata de `"MÉTODO /caminho"` que a API declara. Uma rota
 * removida, renomeada, ou que troque POST por PUT, deixa de existir nessa união
 * e a chamada correspondente no `index.ts` para de compilar. Os campos
 * obrigatórios do corpo viram outra união, e faltar um também não compila.
 *
 * Uso: `npm run contrato:mcp` (roda junto de `npm run openapi`).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'));

const entradas = [];
for (const [caminho, metodos] of Object.entries(spec.paths)) {
  for (const [metodo, op] of Object.entries(metodos)) {
    const schema = op.requestBody?.content?.['application/json']?.schema ?? {};
    const obrigatorios = Array.isArray(schema.required) ? [...schema.required].sort() : [];
    entradas.push({ chave: `${metodo.toUpperCase()} ${caminho}`, obrigatorios });
  }
}
entradas.sort((a, b) => a.chave.localeCompare(b.chave));

const linhas = entradas.map(
  (e) => `  '${e.chave}': { obrigatorios: [${e.obrigatorios.map((o) => `'${o}'`).join(', ')}] },`
);

const conteudo = `// GERADO POR scripts/gerar-contrato-mcp.mjs — NÃO EDITE À MÃO.
// Fonte: docs/openapi.json, que por sua vez sai dos schemas Zod do Worker.
// Regerar: \`npm run contrato:mcp\` na raiz do repositório.
//
// Por que este arquivo é COMMITADO e não gerado no build do MCP: o
// \`mcp-server-niso\` é um pacote separado, com seu próprio \`npm ci\`, e fazer o
// build dele depender de um script da raiz acopla os dois na pior direção. O
// arquivo entra no diff, e \`test/contrato-mcp.test.ts\` (na raiz) falha se ele
// ficar velho.

export const ROTAS = {
${linhas.join('\n')}
} as const;

/** \`"MÉTODO /caminho"\` — a união exata do que a API declara aceitar. */
export type Rota = keyof typeof ROTAS;

/** Campos que o corpo daquela rota PRECISA ter, segundo o schema Zod do Worker. */
export type Obrigatorios<R extends Rota> = (typeof ROTAS)[R]['obrigatorios'][number];
`;

writeFileSync(new URL('../mcp-server-niso/src/contrato-gerado.ts', import.meta.url), conteudo);
console.log(`contrato-gerado.ts: ${entradas.length} rotas`);
