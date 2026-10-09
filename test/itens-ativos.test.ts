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

describe('ativos sobre itens: a API fica como estava', () => {
  it('cria, lista na forma antiga, atualiza parcial e remove (404 na segunda vez)', async () => {
    const r = await chamar(plat, 'POST', '/api/v1/projects/proj-a/assets', {
      name: 'ERP', type: 'Software', category: 'Software', owner: 'TI', location: 'AWS', classification: 'Restricted',
      criticality: 'High', description: 'Folha', confidentiality_rating: 4, integrity_rating: 2, availability_rating: 1,
    });
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: string };

    const lista = (await (await chamar(plat, 'GET', '/api/v1/projects/proj-a/assets')).json()) as { ok: boolean; assets: Record<string, unknown>[] };
    expect(lista.ok).toBe(true);
    expect(lista.assets).toHaveLength(1);
    expect(lista.assets[0]).toMatchObject({
      id, project_id: 'proj-a', name: 'ERP', type: 'Software', category: 'Software', owner: 'TI', location: 'AWS', classification: 'Restricted',
      criticality: 'High', description: 'Folha', status: 'Active', confidentiality_rating: 4, integrity_rating: 2, availability_rating: 1,
    });
    expect(Object.keys(lista.assets[0]).sort()).toEqual(['availability_rating', 'category', 'classification', 'confidentiality_rating', 'created_at',
      'criticality', 'description', 'id', 'integrity_rating', 'location', 'name', 'owner', 'project_id', 'status', 'type', 'updated_at']);

    const put = await chamar(plat, 'PUT', `/api/v1/projects/proj-a/assets/${id}`, { criticality: 'Critical' });
    expect(put.status).toBe(200);
    expect((await put.json() as { asset: Record<string, unknown> }).asset).toMatchObject({ name: 'ERP', owner: 'TI', criticality: 'Critical' });
    expect((await chamar(plat, 'PUT', `/api/v1/projects/proj-b/assets/${id}`, { criticality: 'Low' })).status).toBe(404); // outro projeto

    expect((await chamar(plat, 'DELETE', `/api/v1/projects/proj-a/assets/${id}`)).status).toBe(200);
    expect((await chamar(plat, 'DELETE', `/api/v1/projects/proj-a/assets/${id}`)).status).toBe(404);
    expect(((await (await chamar(plat, 'GET', '/api/v1/projects/proj-a/assets')).json()) as { assets: unknown[] }).assets).toHaveLength(0);
    expect(await env.DB.prepare(`SELECT status FROM itens WHERE id = ?`).bind(id).first()).toEqual({ status: 'removido' });
  });

  it('um risco pode apontar para um item criado depois da migration (a FK vale em banco novo)', async () => {
    const { id } = await (await chamar(plat, 'POST', '/api/v1/projects/proj-a/assets', { name: 'Servidor' })).json() as { id: string };
    const risco = await chamar(plat, 'POST', '/api/v1/projects/proj-a/risks', { asset: 'Servidor', threat: 'Falha', asset_id: id });
    expect(risco.status, await risco.clone().text()).toBe(201);
  });

  it('item de outro tipo não aparece em /assets', async () => {
    await env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('sis1', 'proj-b', 'Sistema de folha', 'sistema')`).run();
    const lista = (await (await chamar(plat, 'GET', '/api/v1/projects/proj-b/assets')).json()) as { assets: { id: string }[] };
    expect(lista.assets.map((a) => a.id)).not.toContain('sis1');
  });

  it('o CSV exporta o ativo vivo e não o removido', async () => {
    const vivo = (await (await chamar(plat, 'POST', '/api/v1/projects/proj-b/assets', { name: 'Vivo' })).json() as { id: string }).id;
    const morto = (await (await chamar(plat, 'POST', '/api/v1/projects/proj-b/assets', { name: 'Morto' })).json() as { id: string }).id;
    await chamar(plat, 'DELETE', `/api/v1/projects/proj-b/assets/${morto}`);
    const csv = await (await chamar(plat, 'GET', '/api/v1/projects/proj-b/export/assets')).text();
    expect(csv).toContain('Vivo');
    expect(csv).not.toContain('Morto');
    expect(vivo).toBeTruthy();
  });

  it('a rota de topo atualiza parcial e apaga de verdade, levando o bloco de segurança', async () => {
    const { id } = await (await chamar(plat, 'POST', '/api/v1/projects/proj-a/assets', { name: 'Topo', owner: 'TI', location: 'DC' })).json() as { id: string };
    expect((await chamar(plat, 'PUT', `/api/v1/assets/${id}`, { name: 'Topo novo' })).status).toBe(200);
    const [item] = (await env.DB.prepare(`SELECT i.nome, i.responsavel_texto AS owner, s.localizacao AS location FROM itens i JOIN item_seguranca s ON s.item_id = i.id WHERE i.id = ?`).bind(id).all()).results;
    expect(item).toEqual({ nome: 'Topo novo', owner: 'TI', location: 'DC' });
    expect((await chamar(plat, 'DELETE', `/api/v1/assets/${id}`)).status).toBe(200);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM item_seguranca WHERE item_id = ?`).bind(id).first()).toEqual({ n: 0 });
  });
});
