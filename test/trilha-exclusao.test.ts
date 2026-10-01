import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { classificaRota, TABELA_DO_RECURSO } from '../src/trilha-exclusao';

/**
 * C4 do plano de fechamento (2026-10), decisão D3: toda exclusão deixa trilha, por um
 * gancho central no authMiddleware, sem depender de cada handler lembrar. Medido antes:
 * de 20 handlers DELETE, 10 não gravavam trilha e 6 gravavam sem o projeto.
 */

// O export default do index É o app do Hono (Object.assign), então serve de roteador e de worker.
const worker = app;

describe('toda rota DELETE está classificada para a trilha', () => {
  const rotas = [...new Set(app.routes.filter((r) => r.method === 'DELETE').map((r) => r.path))].sort();

  it('o roteador tem rotas DELETE (o teste não está olhando o vazio)', () => {
    expect(rotas.length).toBeGreaterThan(15);
  });

  // SCIM fica de fora: autentica por token próprio (fora do authMiddleware) e "excluir" ali é
  // desativar o usuário, que o próprio serviço registra.
  for (const rota of rotas.filter((r) => !r.startsWith('/scim/'))) {
    it(`${rota}`, () => {
      expect(classificaRota(rota), `rota DELETE nova sem classificação: acrescente-a em src/trilha-exclusao.ts (${rota})`).not.toBeNull();
    });
  }

  it('toda tabela mapeada tem project_id (senão a trilha não acha o projeto)', async () => {
    await applySchema();
    for (const tabela of new Set(Object.values(TABELA_DO_RECURSO))) {
      const { results } = await env.DB.prepare(`PRAGMA table_info("${tabela}")`).all<{ name: string }>();
      expect(results.some((c) => c.name === 'project_id'), tabela).toBe(true);
    }
  });
});

describe('a exclusão deixa trilha com o projeto', () => {
  let admA: Record<string, string>;
  let admB: Record<string, string>;
  const del = (caminho: string, headers: Record<string, string>) =>
    worker.fetch(new Request('http://localhost' + caminho, { method: 'DELETE', headers }), workerEnv() as any);
  const trilha = (id: string) =>
    env.DB.prepare(`SELECT actor, project_id, details FROM audit_logs WHERE action='registro.excluido' AND details LIKE ? ORDER BY created_at DESC LIMIT 1`)
      .bind(`%${id}%`).first<{ actor: string; project_id: string | null; details: string }>();

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active'), ('p-b','B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-a','a@x.com','x','A','org_admin','p-a'), ('u-b','b@x.com','x','B','org_admin','p-b')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-del','p-a','Servidor','Queda'), ('r-b','p-b','Outro','Queda')`),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES ('v-del','p-a','Fornecedor')`),
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name) VALUES ('t-del','p-a','Fulano','LGPD')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-del','p-a','Sicrano','s@x.com','tech','CTO')`),
    ]);
    admA = await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: 'p-a' });
    admB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: 'p-b' });
  });

  // `risks`, `vendors` e `training` não gravavam trilha nenhuma antes.
  for (const [rotulo, caminho, id] of [
    ['risco', '/api/v1/risks/r-del', 'r-del'],
    ['fornecedor', '/api/v1/vendors/v-del', 'v-del'],
    ['treinamento', '/api/v1/training/t-del', 't-del'],
    ['membro da governança (projeto vem do caminho)', '/api/v1/projects/p-a/governance/g-del', 'g-del'],
  ] as const) {
    it(`${rotulo}: trilha com o projeto e o autor`, async () => {
      const r = await del(caminho, admA);
      expect(r.status, await r.clone().text()).toBeLessThan(400);
      const t = await trilha(id);
      expect(t, 'exclusão sem trilha').not.toBeNull();
      expect(t!.project_id).toBe('p-a');
      expect(t!.actor).toBe('a@x.com');
    });
  }

  it('exclusão recusada (outro projeto) não deixa trilha, e o registro fica', async () => {
    const r = await del('/api/v1/risks/r-b', admA);
    expect(r.status).toBe(403);
    expect(await trilha('r-b')).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-b'`).first()).not.toBeNull();
  });

  it('o administrador do outro projeto apaga o que é dele, e a trilha vai para o projeto dele', async () => {
    const r = await del('/api/v1/risks/r-b', admB);
    expect(r.status).toBe(200);
    expect((await trilha('r-b'))!.project_id).toBe('p-b');
  });

  it('o agente não ganha linha duplicada: segue só com agente.acao_destrutiva', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-ag','p-a','X','Y')`),
    ]);
    const r = await worker.fetch(
      new Request('http://localhost/api/v1/risks/r-ag', { method: 'DELETE', headers: { 'X-Agente-Confirmado': '1' } }),
      { ...workerEnv(), AGENTE: { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' } } as any,
    );
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await trilha('r-ag'), 'linha duplicada para o agente').toBeNull();
    const a = await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action='agente.acao_destrutiva' AND details LIKE '%r-ag%'`).first();
    expect(a).not.toBeNull();
  });
});
