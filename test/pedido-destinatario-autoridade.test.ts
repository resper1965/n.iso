import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Pedido de aprovação (ciso/ceo) só vai a quem tem a autoridade do papel na matriz do projeto;
 * a ciência não muda.
 */
const P = 'pda-proj';
let consultor: Record<string, string>;

const criar = (tipo: 'politica' | 'dpia', ref: string, papel: string, emails: string[]) =>
  app.fetch(new Request(`http://localhost/api/v1/projects/${P}/pedidos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor },
    body: JSON.stringify({ tipo, ref_id: ref, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })) }),
  }), workerEnv());

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, status) VALUES ('pda-c', ?, 'ISO 27001:2022', 'A.5.1 Políticas', 'texto', 'Partial')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('pda-d', ?, 'Sistema', 'Draft')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-pda', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('gp-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('gp-ciso', ?, 'Cida', 'ciso@cliente.com', 'executivo', 'CISO'),
      ('gp-dir', ?, 'Davi', 'dir@cliente.com', 'executivo', 'Diretor Executivo'),
      ('gp-ana', ?, 'Ana', 'ana@cliente.com', 'executivo', 'Analista de TI')`).bind(P, P, P, P),
  ]);
  consultor = await sessionFor({ id: 'u-pda', email: 'cons@ness.lat', role: 'consultor' });
});

describe('destinatário com a autoridade do papel', () => {
  it('ceo: recusa quem é analista, quem é Líder SGSI e quem está fora da matriz (400, política e DPIA)', async () => {
    for (const [tipo, ref] of [['politica', 'pda-c'], ['dpia', 'pda-d']] as const) {
      for (const email of ['ana@cliente.com', 'ciso@cliente.com', 'fora@cliente.com']) {
        const r = await criar(tipo, ref, 'ceo', [email]);
        expect(r.status, `${tipo} ${email}`).toBe(400);
        expect(((await r.json()) as any).error).toBe(`${email} não tem autoridade de Direção (CEO) neste projeto`);
      }
    }
  });

  it('ciso: recusa quem não é Líder SGSI, com a mensagem do Líder SGSI', async () => {
    const r = await criar('politica', 'pda-c', 'ciso', ['dir@cliente.com']);
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toBe('dir@cliente.com não tem autoridade de Líder SGSI neste projeto');
  });

  it('um sem autoridade entre vários derruba o pedido inteiro; e-mail com caixa e espaço é reconhecido', async () => {
    expect((await criar('dpia', 'pda-d', 'ceo', ['dir@cliente.com', 'ana@cliente.com'])).status).toBe(400);
    expect((await criar('dpia', 'pda-d', 'ceo', [' Dir@Cliente.com'])).status).toBe(201);
    expect((await criar('politica', 'pda-c', 'ciso', ['ciso@cliente.com'])).status).toBe(201);
  });
});
