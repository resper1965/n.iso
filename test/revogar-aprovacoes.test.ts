import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * F6 do plano de fechamento (2026-10), decisão D1: o HUMANO ganha, pela interface, a revogação de
 * aprovação de ROPA e de DPIA e a exclusão de análise crítica. Antes, a limpeza da cliente precisou de
 * SQL no banco. Quem faz: platform_admin e o administrador do cliente. O AGENTE fica de fora, mesmo
 * com confirmação: aprovar e desaprovar é ato da direção, e apagar análise crítica destrói registro
 * assinado.
 */
const worker = app;
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(
    new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'X-Agente-Confirmado': '1' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE } as any,
  );

describe('revogar aprovação e excluir análise crítica (humano, não agente)', () => {
  let admA: Record<string, string>, admB: Record<string, string>, nessAdmin: Record<string, string>;
  let consultor: Record<string, string>, leitor: Record<string, string>;

  const semear = async () => {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM ropa_records`), env.DB.prepare(`DELETE FROM dpia_assessments`), env.DB.prepare(`DELETE FROM management_reviews`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, status, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua, ceo_approved_by, ceo_approved_at, ceo_approved_ip, ceo_approved_ua)
                      VALUES ('ro-a','p-a','Finalidade A','Approved','Líder A','2026-07-22','1.1.1.1','ua','Direção A','2026-07-22','2.2.2.2','ua')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, status, ciso_approved_by) VALUES ('ro-b','p-b','Finalidade B','Approved','Líder B')`),
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status, dpo_signature, ceo_signature, dpo_approved_by, dpo_approved_at)
                      VALUES ('dp-a','p-a','Sistema A','Approved','DPO A','CEO A','DPO A','2026-07-22')`),
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status, dpo_signature) VALUES ('dp-b','p-b','Sistema B','Approved','DPO B')`),
      env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date, status) VALUES ('mr-a','p-a','2026-07-16','Completed')`),
      env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date, status) VALUES ('mr-b','p-b','2026-07-16','Completed')`),
    ]);
  };

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active'), ('p-b','B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-a','a@x.com','x','A','org_admin','p-a'), ('u-b','b@x.com','x','B','org_admin','p-b'), ('u-ro','ro@x.com','x','RO','org_user','p-a'), ('u-pa','pa@ness.lat','x','PA','platform_admin',NULL), ('u-cons','cons@ness.lat','x','Cons','consultor',NULL)`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
    ]);
    admA = await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: 'p-a' });
    admB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: 'p-b' });
    nessAdmin = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    leitor = await sessionFor({ id: 'u-ro', email: 'ro@x.com', role: 'org_user', client_project_id: 'p-a' });
  });

  describe('ROPA', () => {
    const URL_RO = '/api/v1/projects/p-a/ropa/ro-a/revoke-approval';
    const linha = () => env.DB.prepare(`SELECT * FROM ropa_records WHERE id='ro-a'`).first<any>();

    it('revogar UM papel limpa só as colunas dele e mantém Approved enquanto houver a outra assinatura', async () => {
      await semear();
      const r = await chamar('POST', URL_RO, admA, { role: 'ciso', reason: 'Assinatura sem lastro na matriz' });
      expect(r.status, await r.clone().text()).toBe(200);
      const l = await linha();
      expect([l.ciso_approved_by, l.ciso_approved_at, l.ciso_approved_ip, l.ciso_approved_ua]).toEqual([null, null, null, null]);
      expect(l.ceo_approved_by).toBe('Direção A');
      expect(l.status).toBe('Approved');
    });

    it('quando não sobra assinatura nenhuma, o status volta a Draft', async () => {
      const r = await chamar('POST', URL_RO, admA, { role: 'ceo', reason: 'Documento será reescrito' });
      expect(r.status).toBe(200);
      const l = await linha();
      expect(l.ceo_approved_by).toBeNull();
      expect(l.status).toBe('Draft');
    });

    it('"todas" revoga as duas de uma vez e volta a Draft', async () => {
      await semear();
      const r = await chamar('POST', URL_RO, nessAdmin, { role: 'todas', reason: 'Reescrita completa do ROPA' });
      expect(r.status, await r.clone().text()).toBe(200);
      const l = await linha();
      expect([l.ciso_approved_by, l.ceo_approved_by]).toEqual([null, null]);
      expect(l.status).toBe('Draft');
    });

    it('a revogação deixa trilha com o projeto, o autor e o motivo', async () => {
      const t = await env.DB.prepare(`SELECT actor, project_id, justification FROM audit_logs WHERE action='ropa.approval_revoked' ORDER BY created_at DESC LIMIT 1`).first<any>();
      expect(t).toMatchObject({ actor: 'pa@ness.lat', project_id: 'p-a' });
      expect(t.justification).toContain('Reescrita completa');
    });

    it('sem motivo, com motivo curto ou com papel inválido: 400, e nada muda', async () => {
      await semear();
      for (const corpo of [{ role: 'ciso' }, { role: 'ciso', reason: '' }, { role: 'ciso', reason: 'ok' }, { role: 'cfo', reason: 'motivo suficiente' }, { reason: 'motivo suficiente' }]) {
        expect((await chamar('POST', URL_RO, admA, corpo)).status, JSON.stringify(corpo)).toBe(400);
      }
      expect((await linha()).status).toBe('Approved');
    });

    it('só platform_admin e o administrador do cliente: consultor e usuário comum levam 403', async () => {
      await semear();
      for (const [quem, sessao] of [['consultor', consultor], ['org_user', leitor]] as const) {
        const r = await chamar('POST', URL_RO, sessao, { role: 'ciso', reason: 'motivo suficiente' });
        expect(r.status, quem).toBe(403);
      }
      expect((await linha()).ciso_approved_by).toBe('Líder A');
    });

    it('administrador de outro cliente não alcança, nem pelo projeto dele com o id alheio', async () => {
      await semear();
      expect((await chamar('POST', URL_RO, admB, { role: 'ciso', reason: 'motivo suficiente' })).status).toBe(403);
      const r = await chamar('POST', '/api/v1/projects/p-b/ropa/ro-a/revoke-approval', admB, { role: 'ciso', reason: 'motivo suficiente' });
      expect(r.status).toBe(404);
      expect((await linha()).ciso_approved_by).toBe('Líder A');
    });

    it('o AGENTE não revoga aprovação de ROPA, nem com confirmação', async () => {
      await semear();
      const r = await comoAgente('POST', URL_RO, { role: 'ciso', reason: 'motivo suficiente' });
      expect(r.status).toBe(403);
      expect((await r.json<any>()).error).toContain('fora do alcance do agente');
      expect((await linha()).ciso_approved_by).toBe('Líder A');
    });
  });

  describe('DPIA', () => {
    const URL_DP = '/api/v1/projects/p-a/dpia/dp-a/revoke-approval';
    const linha = () => env.DB.prepare(`SELECT * FROM dpia_assessments WHERE id='dp-a'`).first<any>();

    it('revoga assinaturas e aprovação do DPO e volta a Draft', async () => {
      await semear();
      const r = await chamar('POST', URL_DP, admA, { reason: 'RIPD será revisado pela direção' });
      expect(r.status, await r.clone().text()).toBe(200);
      const l = await linha();
      expect([l.dpo_signature, l.ceo_signature, l.dpo_approved_by, l.dpo_approved_at]).toEqual([null, null, null, null]);
      expect(l.status).toBe('Draft');
    });

    it('deixa trilha com o projeto, o autor e o motivo', async () => {
      const t = await env.DB.prepare(`SELECT actor, project_id, justification FROM audit_logs WHERE action='dpia.approval_revoked' ORDER BY created_at DESC LIMIT 1`).first<any>();
      expect(t).toMatchObject({ actor: 'a@x.com', project_id: 'p-a' });
      expect(t.justification).toContain('RIPD será revisado');
    });

    it('sem motivo: 400; consultor e usuário comum: 403; outro cliente: 403 ou 404; agente: 403', async () => {
      await semear();
      expect((await chamar('POST', URL_DP, admA, {})).status).toBe(400);
      expect((await chamar('POST', URL_DP, consultor, { reason: 'motivo suficiente' })).status).toBe(403);
      expect((await chamar('POST', URL_DP, leitor, { reason: 'motivo suficiente' })).status).toBe(403);
      expect((await chamar('POST', URL_DP, admB, { reason: 'motivo suficiente' })).status).toBe(403);
      expect((await chamar('POST', '/api/v1/projects/p-b/dpia/dp-a/revoke-approval', admB, { reason: 'motivo suficiente' })).status).toBe(404);
      const r = await comoAgente('POST', URL_DP, { reason: 'motivo suficiente' });
      expect(r.status).toBe(403);
      expect((await linha()).status).toBe('Approved');
    });
  });

  describe('análise crítica', () => {
    const existe = (id: string) => env.DB.prepare(`SELECT 1 FROM management_reviews WHERE id=?`).bind(id).first();

    it('o administrador do cliente exclui a do próprio projeto, e a trilha leva o projeto', async () => {
      await semear();
      const r = await chamar('DELETE', '/api/v1/management-reviews/mr-a', admA);
      expect(r.status, await r.clone().text()).toBe(200);
      expect(await existe('mr-a')).toBeNull();
      const t = await env.DB.prepare(`SELECT project_id, actor FROM audit_logs WHERE action='registro.excluido' AND details LIKE '%mr-a%' LIMIT 1`).first<any>();
      expect(t).toMatchObject({ project_id: 'p-a', actor: 'a@x.com' });
    });

    it('o texto específico da trilha traz a data e o status da análise excluída', async () => {
      const t = await env.DB.prepare(`SELECT details, project_id FROM audit_logs WHERE action='management_review.deleted' AND details LIKE '%mr-a%' LIMIT 1`).first<any>();
      expect(t?.project_id).toBe('p-a');
      expect(t?.details).toContain('2026-07-16');
      expect(t?.details).toContain('Completed');
    });

    it('platform_admin também; consultor e usuário comum levam 403; outro cliente 403; agente 403 mesmo com confirmação', async () => {
      await semear();
      expect((await chamar('DELETE', '/api/v1/management-reviews/mr-a', consultor)).status).toBe(403);
      expect((await chamar('DELETE', '/api/v1/management-reviews/mr-a', leitor)).status).toBe(403);
      expect((await chamar('DELETE', '/api/v1/management-reviews/mr-a', admB)).status).toBe(403);
      const ag = await comoAgente('DELETE', '/api/v1/management-reviews/mr-a');
      expect(ag.status).toBe(403);
      expect((await ag.json<any>()).error).toContain('fora do alcance do agente');
      expect(await existe('mr-a')).not.toBeNull();
      expect((await chamar('DELETE', '/api/v1/management-reviews/mr-b', nessAdmin)).status).toBe(200);
      expect(await existe('mr-b')).toBeNull();
    });

    it('id inexistente: 404', async () => {
      expect((await chamar('DELETE', '/api/v1/management-reviews/nao-existe', nessAdmin)).status).toBe(404);
    });
  });
});
