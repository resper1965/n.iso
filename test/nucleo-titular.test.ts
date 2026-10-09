import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());

let plat: Record<string, string>;
beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('direitos do titular alcançam as partes', () => {
  it('acha por e-mail, anonimiza nome e e-mail, e não toca no outro projeto', async () => {
    const email = 'titular.exemplo@exemplo.com.br';
    await chamar(plat, 'POST', '/api/v1/projects/proj-a/partes', { nome: 'Titular Exemplo', email });
    await chamar(plat, 'POST', '/api/v1/projects/proj-b/partes', { nome: 'Titular Exemplo', email });

    const busca = await (await chamar(plat, 'GET', `/api/v1/projects/proj-a/data-subject?identificador=${encodeURIComponent(email)}`)).json() as
      { encontrado: boolean; ocorrencias: { tabela: string; registros: unknown[] }[] };
    expect(busca.encontrado).toBe(true);
    expect(busca.ocorrencias.find((o) => o.tabela === 'partes')?.registros).toHaveLength(1);

    const er = await chamar(plat, 'POST', '/api/v1/projects/proj-a/data-subject/erase', { identificador: email, justificativa: 'Pedido do titular, art. 18, VI' });
    expect(er.status).toBe(200);
    const a = await env.DB.prepare(`SELECT nome, email FROM partes WHERE project_id = 'proj-a'`).first<{ nome: string; email: string }>();
    expect(a).toEqual({ nome: '[ANONIMIZADO]', email: '' });
    const b = await env.DB.prepare(`SELECT nome, email FROM partes WHERE project_id = 'proj-b'`).first<{ nome: string; email: string }>();
    expect(b).toEqual({ nome: 'Titular Exemplo', email });
  });
});
