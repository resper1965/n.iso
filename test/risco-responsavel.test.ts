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
const json = async <T>(r: Response) => (await r.json()) as T;

const A = '/api/v1/projects/proj-a';
const risco = { asset: 'ERP', threat: 'Vazamento' };
let plat: Record<string, string>;
let parteA: string;
let parteB: string;

const criarParte = async (projeto: string, nome: string) =>
  (await json<{ id: string }>(await chamar(plat, 'POST', `/api/v1/projects/${projeto}/partes`, { nome }))).id;
const lerRisco = (id: string) => env.DB.prepare('SELECT owner, owner_parte_id FROM risks WHERE id = ?').bind(id).first();

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  parteA = await criarParte('proj-a', 'Ana Exemplo');
  parteB = await criarParte('proj-b', 'Beto Exemplo');
});

describe('risco com responsável do cadastro de partes', () => {
  it('cria com a parte do projeto e a listagem devolve o nome dela', async () => {
    const r = await chamar(plat, 'POST', `${A}/risks`, { ...risco, owner_parte_id: parteA });
    expect(r.status).toBe(201);
    const { id } = await json<{ id: string }>(r);
    expect(await lerRisco(id)).toEqual({ owner: null, owner_parte_id: parteA });
    const lista = await json<{ risks: { id: string; owner_parte_nome: string | null }[] }>(await chamar(plat, 'GET', `${A}/risks`));
    expect(lista.risks.find((x) => x.id === id)?.owner_parte_nome).toBe('Ana Exemplo');
  });

  it('parte de outro projeto ou inexistente: 400, e nada é gravado', async () => {
    for (const owner_parte_id of [parteB, 'nao-existe']) {
      const r = await chamar(plat, 'POST', `${A}/risks`, { ...risco, threat: 'X' + owner_parte_id, owner_parte_id });
      expect(r.status).toBe(400);
    }
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM risks WHERE threat LIKE 'X%'`).first<{ n: number }>())?.n).toBe(0);
  });

  it('editar sem mandar o campo mantém a parte; mandar null desliga; mandar de outro projeto é 400', async () => {
    const { id } = await json<{ id: string }>(await chamar(plat, 'POST', `${A}/risks`, { ...risco, owner_parte_id: parteA }));
    expect((await chamar(plat, 'PUT', `/api/v1/risks/${id}`, { ...risco, owner: 'texto novo' })).status).toBe(200);
    expect(await lerRisco(id)).toEqual({ owner: 'texto novo', owner_parte_id: parteA });
    expect((await chamar(plat, 'PUT', `/api/v1/risks/${id}`, { ...risco, owner_parte_id: parteB })).status).toBe(400);
    expect((await lerRisco(id))?.owner_parte_id).toBe(parteA);
    expect((await chamar(plat, 'PUT', `/api/v1/risks/${id}`, { ...risco, owner_parte_id: null })).status).toBe(200);
    expect((await lerRisco(id))?.owner_parte_id).toBeNull();
  });
});
