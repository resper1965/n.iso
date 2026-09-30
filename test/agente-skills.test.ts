import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';
import { SKILLS } from '../src/mcp/skills-gerado';
import { ROTEIROS, INSTRUCOES } from '../src/mcp/contexto';

/**
 * Skills do agente consultor (agent-skills/), servidas pelo MCP remoto em
 * `niso_skill`. A pasta é a fonte; `src/mcp/skills-gerado.ts` é o que o Worker
 * embute, e como arquivo gerado commitado ele envelhece — este teste o compara
 * com a pasta, no mesmo espírito de `contrato-mcp.test.ts`.
 */
const fontes = import.meta.glob('../agent-skills/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('agent-skills embutidas no Worker', () => {
  it('`skills-gerado.ts` está em dia com a pasta agent-skills/', () => {
    const esperado: Record<string, Record<string, string>> = {};
    for (const [caminho, conteudo] of Object.entries(fontes)) {
      const [nome, ...resto] = caminho.replace('../agent-skills/', '').split('/');
      // O gerador normaliza para LF (checkout no Windows vem em CRLF).
      (esperado[nome] ||= {})[resto.join('/')] = conteudo.replaceAll('\r\n', '\n');
    }
    const atual = Object.fromEntries(Object.entries(SKILLS).map(([n, s]) => [n, s.arquivos]));
    expect(atual, 'rode `npm run skills:gerar` e commite o resultado').toEqual(esperado);
  });

  it('toda skill tem SKILL.md com nome e descrição no cabeçalho', () => {
    expect(Object.keys(SKILLS)).toContain('prontidao-certificacao');
    for (const [nome, s] of Object.entries(SKILLS)) {
      expect(s.arquivos['SKILL.md'], nome).toBeTruthy();
      expect(s.arquivos['SKILL.md']).toMatch(new RegExp(`^---\\nname: ${nome}\\ndescription: .+\\n---`));
      expect(s.descricao.length, nome).toBeGreaterThan(20);
    }
  });

  it('a skill é genérica: nenhum cliente nomeado e nenhum termo de cliente fixo no validador', () => {
    const tudo = Object.values(SKILLS['prontidao-certificacao'].arquivos).join('\n').toLowerCase();
    for (const marca of ['cliente', 'exemplo', 'caixa']) expect(tudo, marca).not.toContain(marca);
  });
});

describe('niso_skill e o roteiro 4', () => {
  let token: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Cliente A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
    ]);
    token = await tokenDoAgente('cons@ness.lat', 'p-a');
  });

  it('sem argumentos lista as skills, com descrição e arquivos', async () => {
    const r = await chamarFerramenta(token, 'niso_skill', {});
    expect(r.isError, r.content[0].text).toBeFalsy();
    expect(r.content[0].text).toContain('prontidao-certificacao');
    expect(r.content[0].text).toContain('references/armadilhas-certificadora.md');
    expect(r.content[0].text).toContain('scripts/check_achados.py');
  });

  it('com nome traz o SKILL.md; com arquivo traz a referência e o validador', async () => {
    const skill = await chamarFerramenta(token, 'niso_skill', { nome: 'prontidao-certificacao' });
    expect(skill.content[0].text).toContain('Regra de fechamento');
    const ref = await chamarFerramenta(token, 'niso_skill', { nome: 'prontidao-certificacao', arquivo: 'references/armadilhas-certificadora.md' });
    expect(ref.content[0].text).toContain('Armadilhas recorrentes');
    const py = await chamarFerramenta(token, 'niso_skill', { nome: 'prontidao-certificacao', arquivo: 'scripts/check_achados.py' });
    expect(py.content[0].text).toContain('def validar');
  });

  it('nome ou arquivo inexistente, e tentativa de travessia, dão erro sem vazar nada', async () => {
    for (const args of [
      { nome: 'nao-existe' },
      { nome: 'prontidao-certificacao', arquivo: 'nao-existe.md' },
      { nome: 'prontidao-certificacao', arquivo: '../../../package.json' },
      { nome: '../src', arquivo: 'index.ts' },
      { nome: 'prontidao-certificacao', arquivo: '..\\..\\wrangler.jsonc' },
    ]) {
      const r = await chamarFerramenta(token, 'niso_skill', args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(r.content[0].text).not.toContain('"name"');
      expect(r.content[0].text).not.toContain('compatibility_date');
    }
  });

  it('o roteiro 4 manda usar niso_skill e diz que só lê', () => {
    expect(ROTEIROS).toContain('4.');
    expect(ROTEIROS).toContain('niso_skill');
    expect(ROTEIROS).toMatch(/prontid[aã]o/i);
    expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
  });
});
