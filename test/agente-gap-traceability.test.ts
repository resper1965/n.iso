import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { executarFerramenta, type Transporte } from '../mcp-server-niso/src/ferramentas';

/**
 * Relato do primeiro uso real do agente (Twyn, 124 controles):
 * - niso_gap_analysis sempre 404: a rota sumiu na decomposição do index.ts
 *   (72f1b59) e nunca voltou.
 * - niso_traceability quebrava: `IN (?, ?, …)` com um parâmetro por controle
 *   passa do teto de 100 parâmetros do D1.
 * - não havia como corrigir um risco existente (só create_risk).
 */
const P = { userId: 'u-c', email: 'c@ness.lat', projectId: 'p-grande', concessaoId: 'c-g' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: P } as any);

describe('Diagnóstico do agente em projeto com mais de 100 controles', () => {
  beforeAll(async () => {
    await applySchema();
    const status = (i: number) => (i < 101 ? 'Implemented' : i < 106 ? 'In Progress' : i < 110 ? 'Missing' : 'Not Applicable');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-grande','Grande','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','c@ness.lat','x','C','consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-grande','C','c@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-g','u-c','p-grande', datetime('now','+30 days'))`),
      ...Array.from({ length: 120 }, (_, i) =>
        env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES (?, 'p-grande', 'ISO 27001', ?, ?)`)
          .bind(`ctl-${i}`, `Controle ${i}`, status(i))),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, control_id, status, owner, treatment) VALUES ('r-1','p-grande','Servidor','Indisponibilidade',4,4,'ctl-103','Mitigated','CTO','Mitigate')`),
    ]);
  });

  it('gap-analysis responde e não conta Não aplicável como lacuna', async () => {
    const res = await comoAgente('/api/v1/projects/p-grande/gap-analysis');
    expect(res.status, await res.clone().text()).toBe(200);
    const g = await res.json<any>();
    expect(g.total).toBe(120);
    expect(g.gaps).toHaveLength(9); // 5 In Progress + 4 Missing; os 10 Not Applicable não entram
    expect(g.coverage_pct).toBe(Math.round((101 / 110) * 100)); // aplicáveis = 120 − 10 N/A
    expect(g.gaps.find((x: any) => x.control_id === 'ctl-103').risk_count).toBe(1);
  });

  it('traceability responde com mais de 100 controles', async () => {
    const res = await comoAgente('/api/v1/projects/p-grande/traceability');
    expect(res.status, await res.clone().text()).toBe(200);
    const t = await res.json<any>();
    expect(t.controls).toHaveLength(120);
    expect(t.controls.find((x: any) => x.id === 'ctl-103').risks).toHaveLength(1);
  });

  it('o agente consegue corrigir um risco pelo PUT (Mitigated prematuro volta a Open)', async () => {
    const res = await comoAgente('/api/v1/risks/r-1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'Servidor', threat: 'Indisponibilidade', impact: 4, probability: 4, control_id: 'ctl-103', owner: 'CTO', treatment: 'Mitigate', status: 'Open' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const r = await env.DB.prepare(`SELECT status FROM risks WHERE id = 'r-1'`).first<any>();
    expect(r.status).toBe('Open');
  });

  it('coherence responde com mais de 100 controles aprovados', async () => {
    const res = await comoAgente('/api/v1/projects/p-grande/coherence');
    expect(res.status, await res.clone().text()).toBe(200);
  });
});

describe('niso_update_risk: edição parcial sem apagar o resto', () => {
  const risco = { id: 'r-1', asset: 'Servidor', threat: 'Indisponibilidade', vulnerability: 'Sem redundância', impact: 4, probability: 4, treatment: 'Mitigate', treatment_plan: 'Cluster', control_id: 'ctl-75', owner: 'CTO', status: 'Mitigated', accepted_by: 'CEO', accepted_at: '2026-01-01' };
  const chamadas: Array<{ metodo: string; path: string; corpo?: any }> = [];
  const t: Transporte = {
    get: async (path) => { chamadas.push({ metodo: 'GET', path }); return { ok: true, risks: [risco] }; }, // formato real da API
    enviar: async () => { throw new Error('não usado'); },
    contrato: async (rota, params, corpo) => { chamadas.push({ metodo: rota.split(' ')[0], path: rota.split(' ')[1].replace('{id}', params.id), corpo }); return { ok: true }; },
    uploadTexto: async () => { throw new Error('não usado'); },
  };

  it('lê o risco, mescla só o que mudou e manda o registro completo', async () => {
    const r = await executarFerramenta('niso_update_risk', { projectId: 'p-grande', riskId: 'r-1', status: 'Open' }, t, { projetoFixo: 'p-grande', papel: 'consultant' });
    expect(r.isError, r.content[0].text).toBeFalsy();
    const put = chamadas.find((c) => c.metodo === 'PUT')!;
    expect(put.path).toBe('/api/v1/risks/r-1');
    expect(put.corpo).toMatchObject({ status: 'Open', asset: 'Servidor', impact: 4, probability: 4, owner: 'CTO', treatment_plan: 'Cluster', control_id: 'ctl-75' });
  });

  it('não deixa o agente mexer no aceite de risco (decisão da direção)', async () => {
    chamadas.length = 0;
    await executarFerramenta('niso_update_risk', { projectId: 'p-grande', riskId: 'r-1', accepted_by: 'Agente' }, t, { projetoFixo: 'p-grande', papel: 'consultant' });
    const put = chamadas.find((c) => c.metodo === 'PUT');
    expect(put?.corpo?.accepted_by ?? 'CEO').toBe('CEO');
  });

  it('risco de outro projeto é recusado antes de qualquer chamada', async () => {
    chamadas.length = 0;
    const r = await executarFerramenta('niso_update_risk', { projectId: 'p-outro', riskId: 'r-1', status: 'Open' }, t, { projetoFixo: 'p-grande', papel: 'consultant' });
    expect(r.isError).toBe(true);
    expect(chamadas).toHaveLength(0);
  });
});
