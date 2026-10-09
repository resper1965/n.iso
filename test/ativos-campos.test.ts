import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor, inserirAtivo, lerAtivo } from './helpers/d1';

describe('ativos: campos gravados, PUT parcial, CSV', () => {
  let headers: Record<string, string>;
  beforeEach(async () => {
    await applySchema(); await resetData(); await resetSessions();
    headers = { ...(await sessionFor({ id: 'u1', email: 'c@ness.io', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001','controller','Active')`).run();
  });
  const req = (m: string, path: string, body?: unknown) =>
    app.fetch(new Request(`http://localhost${path}`, { method: m, headers, body: body ? JSON.stringify(body) : undefined }), env as any);

  it('POST grava location, classification e notas CID', async () => {
    const res = await req('POST', '/api/v1/projects/p1/assets', {
      name: 'ERP', type: 'Software', location: 'AWS sa-east-1', classification: 'Restricted',
      confidentiality_rating: 3, integrity_rating: 2, availability_rating: 1,
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as any;
    const row = (await lerAtivo(id)) as any;
    expect(row.location).toBe('AWS sa-east-1');
    expect(row.classification).toBe('Restricted');
    expect([row.confidentiality_rating, row.integrity_rating, row.availability_rating]).toEqual([3, 2, 1]);
  });

  it('PUT sem um campo não apaga esse campo', async () => {
    await inserirAtivo({ id: 'a1', project_id: 'p1', name: 'ERP', type: 'Software', owner: 'TI', location: 'AWS' });
    const res = await req('PUT', '/api/v1/assets/a1', { name: 'ERP novo' });
    expect(res.status).toBe(200);
    const { name, type, owner, location } = (await lerAtivo('a1')) as any;
    expect({ name, type, owner, location }).toEqual({ name: 'ERP novo', type: 'Software', owner: 'TI', location: 'AWS' });
  });

  it('POST sem notas CID grava o default 3', async () => {
    const res = await req('POST', '/api/v1/projects/p1/assets', { name: 'X' });
    const { id } = (await res.json()) as any;
    const a = (await lerAtivo(id)) as any;
    expect({ c: a.confidentiality_rating, i: a.integrity_rating, a: a.availability_rating }).toEqual({ c: 3, i: 3, a: 3 });
  });

  it('PUT grava location, classification e notas; null volta ao default 3', async () => {
    await inserirAtivo({ id: 'a1', project_id: 'p1', name: 'ERP' });
    await req('PUT', '/api/v1/assets/a1', { name: 'ERP', location: 'AWS', classification: 'Restricted', confidentiality_rating: 1, integrity_rating: 2, availability_rating: 1 });
    const q = async () => { const a = (await lerAtivo('a1')) as any; return { location: a.location, classification: a.classification, c: a.confidentiality_rating, i: a.integrity_rating, a: a.availability_rating }; };
    expect(await q()).toEqual({ location: 'AWS', classification: 'Restricted', c: 1, i: 2, a: 1 });
    await req('PUT', '/api/v1/assets/a1', { name: 'ERP', confidentiality_rating: null });
    expect((await q()).c).toBe(3);
  });

  it('CSV não exporta ativo removido', async () => {
    await inserirAtivo({ id: 'a1', project_id: 'p1', name: 'Vivo', status: 'Active' });
    await inserirAtivo({ id: 'a2', project_id: 'p1', name: 'Morto', status: 'Removido' });
    const csv = await (await req('GET', '/api/v1/projects/p1/export/assets')).text();
    expect(csv).toContain('Vivo');
    expect(csv).not.toContain('Morto');
  });
});
