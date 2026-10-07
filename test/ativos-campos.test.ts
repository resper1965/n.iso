import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

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
    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first<any>();
    expect(row.location).toBe('AWS sa-east-1');
    expect(row.classification).toBe('Restricted');
    expect([row.confidentiality_rating, row.integrity_rating, row.availability_rating]).toEqual([3, 2, 1]);
  });

  it('PUT sem um campo não apaga esse campo', async () => {
    await env.DB.prepare(`INSERT INTO assets (id, project_id, name, type, owner, location) VALUES ('a1','p1','ERP','Software','TI','AWS')`).run();
    const res = await req('PUT', '/api/v1/assets/a1', { name: 'ERP novo' });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT name, type, owner, location FROM assets WHERE id='a1'`).first<any>();
    expect(row).toEqual({ name: 'ERP novo', type: 'Software', owner: 'TI', location: 'AWS' });
  });

  it('POST sem notas CID grava o default 3', async () => {
    const res = await req('POST', '/api/v1/projects/p1/assets', { name: 'X' });
    const { id } = (await res.json()) as any;
    const row = await env.DB.prepare('SELECT confidentiality_rating c, integrity_rating i, availability_rating a FROM assets WHERE id = ?').bind(id).first<any>();
    expect(row).toEqual({ c: 3, i: 3, a: 3 });
  });

  it('PUT grava location, classification e notas; null volta ao default 3', async () => {
    await env.DB.prepare(`INSERT INTO assets (id, project_id, name) VALUES ('a1','p1','ERP')`).run();
    await req('PUT', '/api/v1/assets/a1', { name: 'ERP', location: 'AWS', classification: 'Restricted', confidentiality_rating: 1, integrity_rating: 2, availability_rating: 1 });
    const q = () => env.DB.prepare(`SELECT location, classification, confidentiality_rating c, integrity_rating i, availability_rating a FROM assets WHERE id='a1'`).first<any>();
    expect(await q()).toEqual({ location: 'AWS', classification: 'Restricted', c: 1, i: 2, a: 1 });
    await req('PUT', '/api/v1/assets/a1', { name: 'ERP', confidentiality_rating: null });
    expect((await q()).c).toBe(3);
  });

  it('CSV não exporta ativo removido', async () => {
    await env.DB.prepare(`INSERT INTO assets (id, project_id, name, status) VALUES ('a1','p1','Vivo','Active'), ('a2','p1','Morto','Removido')`).run();
    const csv = await (await req('GET', '/api/v1/projects/p1/export/assets')).text();
    expect(csv).toContain('Vivo');
    expect(csv).not.toContain('Morto');
  });
});
