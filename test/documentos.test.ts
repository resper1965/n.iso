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
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>;
let parteA: string;
let parteB: string;

type Versao = { numero: number; estado: string; hash: string; texto: string; origem: string };
type Doc = { id: string; titulo: string; tipo: string; status: string; revisar_ate: string | null; versao_vigente: number | null; tem_rascunho: boolean; versoes?: Versao[] };

const novo = async (extra: object = {}) => {
  const r = await chamar(plat, 'POST', `${A}/documentos`, { titulo: 'Política Exemplo', texto: 'Texto 1', ...extra });
  expect(r.status).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const ler = async (id: string, base = A) => json<Doc>(await chamar(plat, 'GET', `${base}/documentos/${id}`));
const vigentes = async (id: string) =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM documento_versoes WHERE documento_id = ? AND estado = 'vigente'`).bind(id).first<{ n: number }>())?.n;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  parteA = (await json<{ id: string }>(await chamar(plat, 'POST', `${A}/partes`, { nome: 'Ana Exemplo' }))).id;
  parteB = (await json<{ id: string }>(await chamar(plat, 'POST', `${B}/partes`, { nome: 'Beto Exemplo' }))).id;
});

describe('criar e ler documentos', () => {
  it('cria o documento em rascunho com a versão 1 em rascunho e hash de 64 hex', async () => {
    const id = await novo();
    const d = await ler(id);
    expect(d).toMatchObject({ titulo: 'Política Exemplo', tipo: 'politica', status: 'rascunho', versao_vigente: null, tem_rascunho: true });
    expect(d.versoes).toHaveLength(1);
    expect(d.versoes![0]).toMatchObject({ numero: 1, estado: 'rascunho', origem: 'humano', texto: 'Texto 1' });
    expect(d.versoes![0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a listagem traz só os documentos do projeto', async () => {
    const id = await novo({ titulo: 'Só do A' });
    await chamar(plat, 'POST', `${B}/documentos`, { titulo: 'Só do B', texto: 'x' });
    const lista = await json<Doc[]>(await chamar(plat, 'GET', `${A}/documentos`));
    expect(lista.some((d) => d.id === id)).toBe(true);
    expect(lista.some((d) => d.titulo === 'Só do B')).toBe(false);
  });

  it('pai e dono precisam ser do próprio projeto: de outro projeto ou inexistente é 400', async () => {
    expect((await chamar(plat, 'POST', `${A}/documentos`, { titulo: 'X', texto: 'x', dono_parte_id: parteB })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/documentos`, { titulo: 'X', texto: 'x', pai_id: 'nao-existe' })).status).toBe(400);
    const pai = await novo({ titulo: 'Pai' });
    expect((await chamar(plat, 'POST', `${A}/documentos`, { titulo: 'Filho', tipo: 'procedimento', texto: 'x', pai_id: pai, dono_parte_id: parteA })).status).toBe(201);
    const outroPai = await json<{ id: string }>(await chamar(plat, 'POST', `${B}/documentos`, { titulo: 'Pai do B', texto: 'x' }));
    expect((await chamar(plat, 'POST', `${A}/documentos`, { titulo: 'X', texto: 'x', pai_id: outroPai.id })).status).toBe(400);
  });

  it('corpo inválido: título vazio, tipo desconhecido e revisão fora de 1 a 120 dão 400', async () => {
    for (const corpo of [{ titulo: ' ', texto: 'x' }, { titulo: 'X', texto: 'x', tipo: 'contrato' }, { titulo: 'X', texto: 'x', revisar_a_cada_meses: 0 }, { titulo: 'X' }]) {
      expect((await chamar(plat, 'POST', `${A}/documentos`, corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it('documento de um projeto não aparece pelo caminho do outro', async () => {
    const id = await novo({ titulo: 'Isolado' });
    expect((await chamar(plat, 'GET', `${B}/documentos/${id}`)).status).toBe(404);
    expect((await chamar(plat, 'POST', `${B}/documentos/${id}/versoes`, { texto: 'invasão' })).status).toBe(404);
    expect((await chamar(plat, 'POST', `${B}/documentos/${id}/versoes/1/publicar`)).status).toBe(404);
    expect((await ler(id)).versoes![0].estado).toBe('rascunho');
  });
});

describe('versões e publicação', () => {
  it('salvar com rascunho existente substitui o texto e o hash, sem criar versão', async () => {
    const id = await novo();
    const antes = (await ler(id)).versoes![0].hash;
    const r = await chamar(plat, 'POST', `${A}/documentos/${id}/versoes`, { texto: 'Texto 1, revisado', origem: 'agente' });
    expect(r.status).toBe(200);
    const d = await ler(id);
    expect(d.versoes).toHaveLength(1);
    expect(d.versoes![0]).toMatchObject({ numero: 1, texto: 'Texto 1, revisado', origem: 'agente' });
    expect(d.versoes![0].hash).not.toBe(antes);
  });

  it('publicar torna a versão e o documento vigentes e fixa a próxima revisão', async () => {
    const id = await novo({ revisar_a_cada_meses: 12 });
    const r = await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`);
    expect(r.status).toBe(200);
    const d = await ler(id);
    expect(d).toMatchObject({ status: 'vigente', versao_vigente: 1, tem_rascunho: false });
    expect(d.versoes![0].estado).toBe('vigente');
    const ate = await env.DB.prepare(`SELECT revisar_ate = date('now', '+12 months') AS certo FROM documentos WHERE id = ?`).bind(id).first<{ certo: number }>();
    expect(ate?.certo).toBe(1);
  });

  it('sem periodicidade, publicar não inventa data de revisão', async () => {
    const id = await novo();
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`);
    expect((await ler(id)).revisar_ate).toBeNull();
  });

  it('nova versão depois de publicar vira a 2; publicar a 2 substitui a 1', async () => {
    const id = await novo();
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`);
    const r = await chamar(plat, 'POST', `${A}/documentos/${id}/versoes`, { texto: 'Texto 2' });
    expect(r.status).toBe(201);
    expect(await json(r)).toMatchObject({ numero: 2 });
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/2/publicar`);
    const d = await ler(id);
    expect(d.versoes!.map((v) => [v.numero, v.estado])).toEqual([[1, 'substituida'], [2, 'vigente']]);
    expect(d.versao_vigente).toBe(2);
  });

  it('publicar o que não é rascunho ou não existe: 409 e 404, sem mexer em nada', async () => {
    const id = await novo();
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`);
    expect((await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`)).status).toBe(409);
    expect((await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/9/publicar`)).status).toBe(404);
    expect((await chamar(plat, 'POST', `${A}/documentos/nao-existe/versoes/1/publicar`)).status).toBe(404);
    expect((await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/abc/publicar`)).status).toBe(400);
    expect(await vigentes(id)).toBe(1);
  });

  it('duas publicações simultâneas da mesma versão: uma passa, a outra dá 409, e sobra uma só vigente', async () => {
    const id = await novo();
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`);
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes`, { texto: 'Texto 2' });
    const [x, y] = await Promise.all([
      chamar(plat, 'POST', `${A}/documentos/${id}/versoes/2/publicar`),
      chamar(plat, 'POST', `${A}/documentos/${id}/versoes/2/publicar`),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await vigentes(id)).toBe(1);
    expect((await ler(id)).versao_vigente).toBe(2);
  });

  it('deixa trilha com o projeto', async () => {
    const id = await novo({ titulo: 'Com trilha' });
    await chamar(plat, 'POST', `${A}/documentos/${id}/versoes/1/publicar`);
    for (const acao of ['documento.criado', 'documento.publicado']) {
      const t = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 1`).bind(acao).first<{ project_id: string }>();
      expect(t?.project_id, acao).toBe('proj-a');
    }
  });
});
