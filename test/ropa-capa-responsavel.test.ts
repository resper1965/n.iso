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
let plat: Record<string, string>;
let parteA: string;
let parteB: string;

const criarParte = async (projeto: string, nome: string) =>
  (await json<{ id: string }>(await chamar(plat, 'POST', `/api/v1/projects/${projeto}/partes`, { nome }))).id;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  parteA = await criarParte('proj-a', 'Ana Exemplo');
  parteB = await criarParte('proj-b', 'Beto Exemplo');
});

// RoPA e CAPA seguem a regra do risco (test/risco-responsavel.test.ts): parte do próprio projeto,
// ausente no PUT mantém, null desliga, outra coisa é 400.
const CASOS = [
  {
    nome: 'RoPA', tabela: 'ropa_records', coluna: 'owner_parte_id', lista: `${A}/ropa`, campoLista: 'records',
    criar: (extra: object) => chamar(plat, 'POST', `${A}/ropa`, { processing_purpose: 'Folha', ...extra }),
    editar: (id: string, extra: object) => chamar(plat, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Folha', ...extra }),
  },
  {
    nome: 'CAPA', tabela: 'corrective_actions', coluna: 'assigned_to_parte_id', lista: `${A}/capa`, campoLista: 'actions',
    criar: (extra: object) => chamar(plat, 'POST', `${A}/capa`, { title: 'Corrigir', ...extra }),
    editar: (id: string, extra: object) => chamar(plat, 'PUT', `/api/v1/capa/${id}`, { title: 'Corrigir', status: 'Open', ...extra }),
  },
];

for (const c of CASOS) {
  const campo = c.coluna; // nome da coluna, igual ao do corpo
  const ler = (id: string) => env.DB.prepare(`SELECT ${campo} AS v FROM ${c.tabela} WHERE id = ?`).bind(id).first<{ v: string | null }>();

  describe(`${c.nome} com responsável do cadastro de partes`, () => {
    it('cria com a parte do projeto e a listagem devolve o nome dela', async () => {
      const r = await c.criar({ [campo]: parteA });
      expect(r.status).toBe(201);
      const { id } = await json<{ id: string }>(r);
      expect((await ler(id))?.v).toBe(parteA);
      const lista = await json<Record<string, Record<string, unknown>[]>>(await chamar(plat, 'GET', c.lista));
      expect(lista[c.campoLista].find((x) => x.id === id)?.[campo.replace('_id', '_nome')]).toBe('Ana Exemplo');
    });

    it('parte de outro projeto ou inexistente: 400', async () => {
      for (const v of [parteB, 'nao-existe']) expect((await c.criar({ [campo]: v })).status).toBe(400);
    });

    it('editar: ausente mantém, de outro projeto é 400, null desliga', async () => {
      const { id } = await json<{ id: string }>(await c.criar({ [campo]: parteA }));
      expect((await c.editar(id, {})).status).toBe(200);
      expect((await ler(id))?.v).toBe(parteA);
      expect((await c.editar(id, { [campo]: parteB })).status).toBe(400);
      expect((await ler(id))?.v).toBe(parteA);
      expect((await c.editar(id, { [campo]: null })).status).toBe(200);
      expect((await ler(id))?.v).toBeNull();
    });
  });
}
