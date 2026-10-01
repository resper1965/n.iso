import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * C3 do plano de fechamento (2026-10): "Forbidden vira 500" em exclusão de
 * auditoria, parte interessada e métrica. A hipótese veio da revisão final do
 * #221 e NÃO foi conferida contra `erro500`, que já trata ForbiddenError como
 * 403 (src/helpers.ts). Este teste decide por evidência, e fica como proteção
 * de regressão: acesso negado a recurso de outro projeto é 403, nunca 500.
 */
describe('acesso negado a recurso de outro projeto é 403, não 500', () => {
  let admB: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active'), ('p-b','B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-b','b@x.com','x','B','org_admin','p-b')`),
      env.DB.prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES ('au-a','p-a','internal','Auditoria A','2026-12-01')`),
      env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name) VALUES ('sh-a','p-a','Parte A')`),
      env.DB.prepare(`INSERT INTO performance_metrics (id, project_id, metric_name) VALUES ('m-a','p-a','Métrica A')`),
    ]);
    admB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: 'p-b' });
  });

  for (const [rotulo, caminho, tabela, id] of [
    ['auditoria', '/api/v1/audits/au-a', 'audit_schedule', 'au-a'],
    ['parte interessada', '/api/v1/stakeholders/sh-a', 'stakeholders', 'sh-a'],
    ['métrica', '/api/v1/metrics/m-a', 'performance_metrics', 'm-a'],
  ] as const) {
    it(`DELETE de ${rotulo} de outro projeto: 403 e o registro fica`, async () => {
      const r = await worker.fetch(new Request('http://localhost' + caminho, { method: 'DELETE', headers: admB }), workerEnv() as any);
      expect(r.status, await r.clone().text()).toBe(403);
      expect(await env.DB.prepare(`SELECT 1 FROM ${tabela} WHERE id = ?`).bind(id).first()).not.toBeNull();
    });
  }
});
