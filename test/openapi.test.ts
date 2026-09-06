import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';
import { documentoOpenApi, ROTAS_COM_SCHEMA } from '../src/openapi';
import indexSrc from '../src/index.ts?raw';
import specVersionada from '../docs/openapi.json';

/**
 * Contrato da API (item 3.1 do `enterprise-grade-plan.md`).
 *
 * O documento sai dos MESMOS objetos Zod que os handlers executam, então ele não
 * pode mentir sobre a FORMA de um corpo. O que ele pode fazer é mentir por
 * OMISSÃO: a tabela que liga método+caminho ao schema é manual (o runtime do
 * Worker não lê o fonte), e tabela manual envelhece.
 *
 * Este arquivo é o que impede isso. Ele lê o fonte, encontra toda chamada de
 * `validateBody` e falha nas duas direções — rota validada que não está no
 * contrato, e entrada no contrato que já não corresponde a rota nenhuma.
 */

const fontes = import.meta.glob('../src/routes/*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** Descobre (método, caminho, schema) lendo o fonte — o mesmo que a tabela declara. */
function rotasValidadasNoFonte(): { metodo: string; caminho: string; nome: string; origem: string }[] {
  const mount: Record<string, string> = {};
  for (const m of indexSrc.matchAll(/app\.route\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g)) mount[m[2]] = m[1];

  const arquivoDe: Record<string, { chave: string; modulo: string }> = {};
  for (const m of indexSrc.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'\.\/routes\/([\w-]+)'/g)) {
    const modulo = m[3];
    const par = { chave: `../src/routes/${modulo}.ts`, modulo };
    if (m[1]) for (const v of m[1].split(',')) arquivoDe[v.trim()] = par;
    else arquivoDe[m[2]] = par;
  }

  const achadas: { metodo: string; caminho: string; nome: string; origem: string }[] = [];
  for (const [routerVar, { chave, modulo }] of Object.entries(arquivoDe)) {
    if (!(routerVar in mount)) continue;
    const src = fontes[chave];
    if (!src) continue;
    let atual: { metodo: string; caminho: string } | null = null;
    src.split('\n').forEach((linha, i) => {
      const r = linha.match(/^\s*(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'/);
      if (r) {
        // Declaração de OUTRO router no mesmo arquivo zera o contexto: sem isto,
        // um `validateBody` seria atribuído à rota errada.
        atual = r[1] === routerVar
          ? { metodo: r[2].toUpperCase(), caminho: (mount[routerVar] + r[3]).replace(/\/$/, '') || '/' }
          : null;
        return;
      }
      const vb = linha.match(/validateBody\(c,\s*(\w+)\)/);
      if (vb && atual) {
        achadas.push({ ...atual, nome: vb[1], origem: `src/routes/${modulo}.ts:${i + 1}` });
      }
    });
  }
  return achadas;
}

const chave = (r: { metodo: string; caminho: string; nome: string }) => `${r.metodo} ${r.caminho} → ${r.nome}`;

describe('Contrato OpenAPI', () => {
  it('descobre rotas validadas de verdade (senão o teste passaria vazio)', () => {
    expect(rotasValidadasNoFonte().length, 'o parser parou de casar — conferir os padrões').toBeGreaterThanOrEqual(45);
  });

  it('toda rota que valida corpo está no contrato', () => {
    const naTabela = new Set(ROTAS_COM_SCHEMA.map(chave));
    const faltando = rotasValidadasNoFonte()
      .filter((r) => !naTabela.has(chave(r)))
      .map((r) => `${chave(r)}  (${r.origem})`);
    expect(
      faltando,
      `rota valida o corpo mas não aparece no OpenAPI — acrescente em src/openapi.ts:\n  ${faltando.join('\n  ')}`
    ).toEqual([]);
  });

  it('toda entrada do contrato ainda corresponde a uma rota', () => {
    // A outra direção: rota removida ou renomeada deixa a entrada órfã, e o
    // contrato passa a descrever endpoint que não existe — pior que omitir.
    const noFonte = new Set(rotasValidadasNoFonte().map(chave));
    const orfas = ROTAS_COM_SCHEMA.map(chave).filter((k) => !noFonte.has(k));
    expect(orfas, `entrada órfã no OpenAPI:\n  ${orfas.join('\n  ')}`).toEqual([]);
  });

  it('o documento é OpenAPI 3.1 válido no que importa, e descreve os corpos', () => {
    const doc = documentoOpenApi('https://exemplo') as any;
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(40);

    // Um caso concreto, ponta a ponta: o schema de login exige email e password,
    // e é isso que o contrato precisa dizer.
    const login = doc.paths['/api/v1/auth/login'].post;
    const corpo = login.requestBody.content['application/json'].schema;
    expect(corpo.required.sort()).toEqual(['email', 'password']);
    expect(corpo.properties.email.format).toBe('email');
    expect(login.responses['400']).toBeTruthy();

    // Parâmetro de caminho vira `{id}` e é declarado — sem isso o documento não
    // gera cliente nenhum.
    const put = doc.paths['/api/v1/admin/users/{id}'].put;
    expect(put.parameters.map((p: any) => p.name)).toEqual(['id']);
  });

  it('a política de senha aparece no contrato — é ela que o cliente precisa obedecer', () => {
    const doc = documentoOpenApi() as any;
    const corpo = doc.paths['/api/v1/auth/change-password'].post
      .requestBody.content['application/json'].schema;
    expect(corpo.properties.newPassword.minLength).toBe(8);
  });
});

describe('Spec versionada no repositório', () => {
  it('`docs/openapi.json` está em dia com o código', () => {
    // O arquivo existe para a mudança de contrato APARECER NO DIFF: trocar um
    // `.min(1)` por `.min(8)` num schema é uma linha fácil de não ver; a mesma
    // mudança aqui é `"minLength": 8`, e o revisor vê. Isso só vale se o
    // arquivo não puder ficar velho — é o que esta asserção garante.
    const gerado = documentoOpenApi('https://niso.ness.workers.dev');
    expect(
      specVersionada,
      'docs/openapi.json divergiu do código — rode `npm run openapi` e inclua o arquivo no commit'
    ).toEqual(gerado);
  });
});

describe('GET /api/v1/openapi.json', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
      .bind('u-doc', 'doc@x.com', await hashPassword('password123'), 'Doc', 'consultor').run();
  });

  it('exige sessão — o contrato é mapa de superfície de ataque', async () => {
    expect((await pedir(worker, '/api/v1/openapi.json')).status).toBe(401);
  });

  it('com sessão devolve o documento, com o servidor da própria requisição', async () => {
    const headers = await sessionFor({ id: 'u-doc', email: 'doc@x.com', role: 'consultor' });
    const res = await pedir(worker, '/api/v1/openapi.json', { headers });
    expect(res.status).toBe(200);
    const doc = await res.json<any>();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers[0].url).toBe('http://localhost');
  });
});
