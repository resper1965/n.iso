import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

// O `repository_token` já saía redigido em GET /projects, mas três outras rotas devolviam a linha
// crua de `projects` (SELECT *): /portfolio (e, por ele, a ferramenta niso_list_projects do MCP),
// /client/dashboard e /projects/:id/audit-pack. A prova é procurar o segredo no TEXTO da resposta,
// não um campo: serve para qualquer formato ou aninhamento que a rota venha a ter.
const SEGREDO = 'ghp_SEGREDO_NAO_PODE_SAIR';

const chamar = (h: Record<string, string>, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv());

let plat: Record<string, string>;
let cliente: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(
    `INSERT INTO projects (id, client_name, standards, org_role, status, repository_token) VALUES ('p-tok','Cliente','ISO 27001:2022','Controller','Active',?)`
  ).bind(SEGREDO).run();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  cliente = await sessionFor({ id: 'u-cl', email: 'cl@cliente.com', role: 'client', client_project_id: 'p-tok' });
});

describe('repository_token não sai em nenhuma resposta', () => {
  for (const [rotulo, caminho, quem] of [
    ['GET /portfolio', '/api/v1/portfolio', () => plat],
    ['GET /client/dashboard', '/api/v1/client/dashboard', () => cliente],
    ['GET /projects/:id/audit-pack', '/api/v1/projects/p-tok/audit-pack', () => plat],
  ] as const) {
    it(rotulo, async () => {
      const r = await chamar(quem(), caminho);
      expect(r.status).toBe(200);
      const texto = await r.text();
      expect(texto).toContain('p-tok'); // a rota respondeu o projeto: o teste mede algo
      expect(texto).not.toContain(SEGREDO);
      expect(texto).not.toContain('"repository_token":'); // nem o campo, nem cifrado
    });
  }

  it('o portfólio diz só se há token configurado', async () => {
    const { projects } = (await (await chamar(plat, '/api/v1/portfolio')).json()) as { projects: Record<string, unknown>[] };
    expect(projects.find((p) => p.id === 'p-tok')?.repository_token_set).toBe(true);
  });
});
