/**
 * Escreve `docs/openapi.json` a partir de `src/openapi.ts`.
 *
 * O documento é servido em runtime pelo Worker; este arquivo existe para que a
 * mudança de contrato APAREÇA NO DIFF do PR. Trocar um `.min(1)` por `.min(8)`
 * num schema é uma linha fácil de não ver; a mesma mudança no `openapi.json` é
 * uma linha que diz `"minLength": 8`, e o revisor vê.
 *
 * `test/openapi.test.ts` compara o arquivo com o que o código gera e falha se
 * alguém mudar schema sem rodar isto — o snapshot não pode ficar velho.
 *
 * Passa por esbuild em vez de `node --experimental-strip-types` porque o
 * type-stripping do Node não resolve import de diretório (`./schemas`) nem
 * extensão implícita, e adaptar a árvore inteira de `src/` a isso seria mexer em
 * dezenas de arquivos para agradar um script. O esbuild já é dependência do
 * wrangler e resolve como o bundle de produção resolve — que é justamente o
 * comportamento que queremos reproduzir.
 *
 * Uso: `npm run openapi`
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

// O bundle sai DENTRO do projeto, e não em /tmp: `zod` fica externo (não faz
// sentido embutir uma cópia só para ler schemas), e módulo em /tmp não enxerga
// o node_modules daqui.
const saida = new URL('../node_modules/.cache/niso-openapi.mjs', import.meta.url).pathname;

// ─── 1. Reescrever a tabela rota↔schema de src/openapi.ts a partir do fonte ───
//
// A tabela vive no runtime (o Worker não lê o fonte), mas a VERDADE está no
// fonte. Regerá-la aqui é o que impede a divergência de nascer; o teste de
// contrato é a rede para quem esquecer de rodar isto.

const raiz = new URL('..', import.meta.url).pathname;
const idx = readFileSync(`${raiz}/src/index.ts`, 'utf8');

const mount = {};
for (const m of idx.matchAll(/app\.route\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g)) mount[m[2]] = m[1];

const moduloDe = {};
for (const m of idx.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'\.\/routes\/([\w-]+)'/g)) {
  if (m[1]) for (const v of m[1].split(',')) moduloDe[v.trim()] = m[3];
  else moduloDe[m[2]] = m[3];
}

const entradas = [];
for (const [routerVar, modulo] of Object.entries(moduloDe)) {
  if (!(routerVar in mount)) continue;
  let src;
  try {
    src = readFileSync(`${raiz}/src/routes/${modulo}.ts`, 'utf8');
  } catch {
    continue;
  }
  let atual = null;
  src.split('\n').forEach((linha) => {
    const r = linha.match(/^\s*(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'/);
    if (r) {
      // Rota de OUTRO router no mesmo arquivo zera o contexto — sem isto o
      // `validateBody` seguinte seria atribuído à rota errada.
      atual = r[1] === routerVar
        ? { metodo: r[2].toUpperCase(), caminho: (mount[routerVar] + r[3]).replace(/\/$/, '') || '/' }
        : null;
      return;
    }
    const vb = linha.match(/validateBody\(c,\s*(\w+)\)/);
    if (vb && atual) entradas.push({ ...atual, nome: vb[1] });
  });
}
entradas.sort((a, b) => (a.caminho + a.metodo).localeCompare(b.caminho + b.metodo));

const nomes = [...new Set(entradas.map((e) => e.nome))].sort();
const bloco = [
  '// ─── INÍCIO DA TABELA GERADA — `npm run openapi` reescreve daqui até o fim ───',
  'export const ROTAS_COM_SCHEMA: Entrada[] = [',
  ...entradas.map((e) => `  { metodo: '${e.metodo}', caminho: '${e.caminho}', schema: ${e.nome}, nome: '${e.nome}' },`),
  '];',
  '// ─── FIM DA TABELA GERADA ───',
].join('\n');

const arquivoOpenapi = `${raiz}/src/openapi.ts`;
let fonte = readFileSync(arquivoOpenapi, 'utf8');
fonte = fonte.replace(
  /\/\/ ─── INÍCIO DA TABELA GERADA[\s\S]*?\/\/ ─── FIM DA TABELA GERADA ───/,
  bloco
);
fonte = fonte.replace(
  /import \{\n(?:  \w+,\n)+\} from '\.\/schemas';/,
  `import {\n${nomes.map((n) => `  ${n},`).join('\n')}\n} from './schemas';`
);
writeFileSync(arquivoOpenapi, fonte);
console.log(`src/openapi.ts: ${entradas.length} rotas na tabela`);

// ─── 2. Emitir docs/openapi.json a partir do módulo já atualizado ───

await esbuild.build({
  entryPoints: [new URL('../src/openapi.ts', import.meta.url).pathname],
  outfile: saida,
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['zod'],
  logLevel: 'warning',
});

const { documentoOpenApi } = await import(pathToFileURL(saida).href);
const doc = documentoOpenApi('https://niso.ness.workers.dev');
rmSync(saida, { force: true });

writeFileSync(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`docs/openapi.json: ${Object.keys(doc.paths).length} caminhos`);
