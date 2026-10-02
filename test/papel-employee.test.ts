import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Papel legado `employee` (existe uma conta de cliente assim em produção, criada em 22/07/2026, presa a
 * um projeto). Com o corte de `client_project_id` por papel, um papel desconhecido perdia o projeto do
 * próprio cliente. Ele passa a valer como `org_user`, como `user` e `client_admin` já valiam.
 */
const chamar = (caminho: string, headers: Record<string, string>) =>
  app.fetch(new Request('http://localhost' + caminho, { headers }), workerEnv() as any);

describe('papel legado employee', () => {
  let h: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-meu','Meu','ISO 27001','controller','Active','org_ness'),('p-outro','Outro','ISO 27001','controller','Active','org_ness')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-meu','p-meu','A','T'),('r-outro','p-outro','A','T')`),
    ]);
    h = await sessionFor({ id: 'u-emp', email: 'emp@cliente.com', role: 'employee', client_project_id: 'p-meu', org_id: 'org_ness' });
  });

  it('continua alcançando o projeto do próprio cliente', async () => {
    expect((await chamar('/api/v1/projects/p-meu/risks', h)).status).toBe(200);
  });

  it('não alcança projeto de outro cliente', async () => {
    expect((await chamar('/api/v1/projects/p-outro/risks', h)).status).toBe(403);
  });

  it('não escreve como equipe: vale como org_user', async () => {
    const r = await app.fetch(new Request('http://localhost/api/v1/projects/p-meu/risks', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ asset: 'x', threat: 'y' }),
    }), workerEnv() as any);
    expect(r.status).toBe(403);
  });
});
