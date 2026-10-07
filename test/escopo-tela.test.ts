import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * A tela (frontend/src/globals.js, submitScopeChange) manda os nomes do scopeChangeSchema e lê o
 * histórico pelas colunas de `scope_changes`. Antes mandava new_scope/change_reason/... e levava 400.
 */
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());

beforeAll(applySchema);

describe('alteração de escopo: corpo da tela', () => {
  it('POST grava e GET devolve a lista crua com as colunas que a tela lê', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-es','ES','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-es','es@x.com','x','Ed','org_admin','p-es')`),
    ]);
    const ed = await sessionFor({ id: 'u-es', email: 'es@x.com', role: 'org_admin', client_project_id: 'p-es' });
    const corpo = { change_description: 'Novo escopo', reason: 'Motivo', impact_analysis: 'Impacto', requested_by: 'CISO' };
    const r = await chamar('POST', '/api/v1/projects/p-es/scope-changes', ed, corpo);
    expect(r.status, await r.clone().text()).toBe(200);
    const lista = await (await chamar('GET', '/api/v1/projects/p-es/scope-changes', ed)).json<Record<string, unknown>[]>();
    expect(Array.isArray(lista)).toBe(true);
    expect(lista[0]).toMatchObject(corpo);
  }, 30_000);
});
