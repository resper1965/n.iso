import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, inserirAtivo } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>;

const criar = async (base: string, recurso: string, corpo: unknown) => {
  const r = await chamar(plat, 'POST', `${base}/${recurso}`, corpo);
  expect(r.status, JSON.stringify(corpo)).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const nVinculos = async (parte: string) =>
  (await env.DB.prepare('SELECT count(*) AS n FROM parte_vinculos WHERE parte_id = ?').bind(parte).first<{ n: number }>())!.n;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('departamentos', () => {
  it('cria, lista, recusa nome repetido e inativa', async () => {
    const id = await criar(A, 'departamentos', { nome: 'Tecnologia' });
    expect(await json<{ nome: string }[]>(await chamar(plat, 'GET', `${A}/departamentos`))).toMatchObject([{ id, nome: 'Tecnologia', status: 'ativo' }]);
    expect((await chamar(plat, 'POST', `${A}/departamentos`, { nome: 'Tecnologia' })).status).toBe(409);
    expect((await chamar(plat, 'POST', `${B}/departamentos`, { nome: 'Tecnologia' })).status).toBe(201); // outro projeto, outro nome livre
    expect((await chamar(plat, 'POST', `${A}/departamentos`, { nome: '  ' })).status).toBe(400);
    expect((await chamar(plat, 'PUT', `${A}/departamentos/${id}`, { status: 'inativo' })).status).toBe(200);
    expect((await json<{ status: string }[]>(await chamar(plat, 'GET', `${A}/departamentos`)))[0].status).toBe('inativo');
  });

  it('departamento de outro projeto é 404 pela rota do projeto', async () => {
    const dB = (await json<{ id: string }[]>(await chamar(plat, 'GET', `${B}/departamentos`)))[0].id;
    expect((await chamar(plat, 'PUT', `${A}/departamentos/${dB}`, { nome: 'Invasor' })).status).toBe(404);
  });
});

describe('partes', () => {
  it('cria pessoa e organização, filtra, atualiza e inativa', async () => {
    const ana = await criar(A, 'partes', { nome: 'Ana Exemplo', email: 'Ana@Exemplo.COM.br' });
    const org = await criar(A, 'partes', { tipo: 'organizacao', nome: 'Fornecedora Exemplo' });
    const um = await json<{ nome: string; email: string; tipo: string; vinculos: unknown[] }>(await chamar(plat, 'GET', `${A}/partes/${ana}`));
    expect(um).toMatchObject({ nome: 'Ana Exemplo', email: 'ana@exemplo.com.br', tipo: 'pessoa', vinculos: [] });
    expect((await json<unknown[]>(await chamar(plat, 'GET', `${A}/partes?tipo=organizacao`)))).toMatchObject([{ id: org }]);
    expect((await chamar(plat, 'PUT', `${A}/partes/${ana}`, { email: null, status: 'inativa' })).status).toBe(200);
    expect(await json(await chamar(plat, 'GET', `${A}/partes/${ana}`))).toMatchObject({ email: null, status: 'inativa' });
    expect((await json<unknown[]>(await chamar(plat, 'GET', `${A}/partes?status=ativa`)))).toMatchObject([{ id: org }]);
  });

  it('recusa e-mail inválido, tipo inválido e nome vazio; parte de outro projeto é 404', async () => {
    expect((await chamar(plat, 'POST', `${A}/partes`, { nome: 'X', email: 'nao-e-email' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/partes`, { nome: 'X', tipo: 'robo' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/partes`, { nome: '' })).status).toBe(400);
    const deB = await criar(B, 'partes', { nome: 'Pessoa de B' });
    expect((await chamar(plat, 'GET', `${A}/partes/${deB}`)).status).toBe(404);
    expect((await chamar(plat, 'PUT', `${A}/partes/${deB}`, { nome: 'Invasor' })).status).toBe(404);
  });
});

describe('vínculos', () => {
  let parte: string, dep: string;
  beforeAll(async () => {
    parte = await criar(A, 'partes', { nome: 'Beto Exemplo' });
    dep = await criar(A, 'departamentos', { nome: 'Jurídico' });
  });
  const vincular = (id: string, corpo: unknown, base = A) => chamar(plat, 'POST', `${base}/partes/${id}/vinculos`, corpo);

  it('encarregado do projeto: grava, repetir é 409, remover tira', async () => {
    const r = await vincular(parte, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' });
    expect(r.status).toBe(201);
    const vid = (await json<{ id: string }>(r)).id;
    expect((await vincular(parte, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' })).status).toBe(409);
    expect((await json<{ vinculos: unknown[] }>(await chamar(plat, 'GET', `${A}/partes/${parte}`))).vinculos).toHaveLength(1);
    expect((await chamar(plat, 'DELETE', `${A}/partes/${parte}/vinculos/${vid}`)).status).toBe(200);
    expect(await nVinculos(parte)).toBe(0);
    expect((await chamar(plat, 'DELETE', `${A}/partes/${parte}/vinculos/${vid}`)).status).toBe(404);
  });

  it('responsável de um departamento do projeto: ok', async () => {
    expect((await vincular(parte, { papel: 'responsavel', alvo_tipo: 'departamento', alvo_id: dep })).status).toBe(201);
  });

  it('alvo de OUTRO projeto: 400 e nada gravado', async () => {
    const depB = (await json<{ id: string }[]>(await chamar(plat, 'GET', `${B}/departamentos`)))[0].id;
    const antes = await nVinculos(parte);
    const r = await vincular(parte, { papel: 'responsavel', alvo_tipo: 'departamento', alvo_id: depB });
    expect(r.status).toBe(400);
    expect((await json<{ error: string }>(r)).error).toMatch(/inexistente ou de outro projeto/);
    expect((await vincular(parte, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-b' })).status).toBe(400);
    expect(await nVinculos(parte)).toBe(antes);
  });

  it('papel que não serve ao alvo: 400; tratamento é o registro do RoPA (fatia 4): inexistente é 400, existente vincula', async () => {
    const r = await vincular(parte, { papel: 'encarregado', alvo_tipo: 'departamento', alvo_id: dep });
    expect(r.status).toBe(400);
    expect((await json<{ error: string }>(r)).error).toMatch(/não se aplica/);
    const i = await vincular(parte, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: 'qualquer' });
    expect(i.status).toBe(400);
    expect((await json<{ error: string }>(i)).error).toMatch(/inexistente ou de outro projeto/);
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('trat-ok', 'proj-a', 'Folha')`).run();
    expect((await vincular(parte, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: 'trat-ok' })).status).toBe(201);
    expect((await vincular(parte, { papel: 'rei', alvo_tipo: 'projeto', alvo_id: 'proj-a' })).status).toBe(400);
  });

  it('responsável por um item do projeto: ok; item de outro projeto: 400', async () => {
    await inserirAtivo({ id: 'it-a', project_id: 'proj-a', name: 'ERP' });
    await inserirAtivo({ id: 'it-b', project_id: 'proj-b', name: 'CRM' });
    expect((await vincular(parte, { papel: 'responsavel', alvo_tipo: 'item', alvo_id: 'it-a' })).status).toBe(201);
    expect((await vincular(parte, { papel: 'responsavel', alvo_tipo: 'item', alvo_id: 'it-b' })).status).toBe(400);
  });

  it('suboperador aponta para outra parte do projeto; parte de outro projeto é recusada', async () => {
    const operador = await criar(A, 'partes', { tipo: 'organizacao', nome: 'Operadora Exemplo' });
    const sub = await criar(A, 'partes', { tipo: 'organizacao', nome: 'Suboperadora Exemplo' });
    expect((await vincular(sub, { papel: 'suboperador', alvo_tipo: 'parte', alvo_id: operador })).status).toBe(201);
    const deB = await criar(B, 'partes', { nome: 'Pessoa de B 2' });
    expect((await vincular(sub, { papel: 'suboperador', alvo_tipo: 'parte', alvo_id: deB })).status).toBe(400);
  });

  it('vínculo de parte que não é do projeto da URL: 404', async () => {
    const deB = await criar(B, 'partes', { nome: 'Pessoa de B 3' });
    expect((await vincular(deB, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' })).status).toBe(404);
  });
});
