/**
 * Escreve `src/mcp/skills-gerado.ts` a partir de `agent-skills/`.
 *
 * As skills do agente consultor vivem como arquivos (SKILL.md, referências,
 * scripts) numa pasta só, que é a fonte. O Worker não lê disco: o módulo gerado
 * embute o texto, e `niso_skill` (src/mcp/servidor.ts) o serve pelo MCP, atrás do
 * login do agente. `test/agente-skills.test.ts` falha se este arquivo ficar velho.
 *
 * Uso: `npm run skills:gerar`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../agent-skills/', import.meta.url));

/** Todos os arquivos sob `dir`, como caminho relativo com `/`. */
function arquivos(dir, base = dir) {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    return statSync(c).isDirectory() ? arquivos(c, base) : [c.slice(base.length).split(sep).join('/').replace(/^\//, '')];
  });
}

const skills = {};
for (const nome of readdirSync(RAIZ).sort()) {
  const dir = join(RAIZ, nome);
  if (!statSync(dir).isDirectory()) continue;
  const mapa = {};
  // LF sempre: no Windows o checkout vem em CRLF e no CI em LF; o módulo gerado não pode depender disso.
  for (const rel of arquivos(dir).sort()) mapa[rel] = readFileSync(join(dir, rel), 'utf8').replaceAll('\r\n', '\n');
  const cab = /^---\nname: (.+)\ndescription: (.+)\n---/.exec(mapa['SKILL.md'] ?? '');
  if (!cab || cab[1] !== nome) throw new Error(`agent-skills/${nome}/SKILL.md sem cabeçalho name/description válido`);
  skills[nome] = { descricao: cab[2], arquivos: mapa };
}

const corpo = Object.entries(skills)
  .map(
    ([n, s]) =>
      `  ${JSON.stringify(n)}: {\n    descricao: ${JSON.stringify(s.descricao)},\n    arquivos: {\n` +
      Object.entries(s.arquivos).map(([a, t]) => `      ${JSON.stringify(a)}: ${JSON.stringify(t)},`).join('\n') +
      `\n    },\n  },`
  )
  .join('\n');

writeFileSync(
  new URL('../src/mcp/skills-gerado.ts', import.meta.url),
  `// GERADO POR scripts/gerar-skills.mjs — NÃO EDITE À MÃO.
// Fonte: agent-skills/. Regerar: \`npm run skills:gerar\`.
// Commitado de propósito (o Worker não lê disco); test/agente-skills.test.ts falha se ficar velho.

export const SKILLS: Record<string, { descricao: string; arquivos: Record<string, string> }> = {
${corpo}
};
`
);
console.log(`skills-gerado.ts: ${Object.keys(skills).length} skill(s), ${Object.values(skills).reduce((n, s) => n + Object.keys(s.arquivos).length, 0)} arquivo(s)`);
