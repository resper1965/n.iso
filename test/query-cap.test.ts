import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { precisaDeTeto, aplicaTeto, comTeto } from '../src/middleware/query-cap';
import { MAX_PAGE_SIZE, hashPassword } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Teto automático de linhas.
 *
 * A reescrita de SQL é a parte perigosa deste PR: aplicar LIMIT onde não devia
 * produz resultado INCORRETO, e resultado incorreto num sistema de conformidade
 * vira relatório errado para auditor. Por isso os testes de "não deve mexer"
 * são mais numerosos que os de "deve mexer".
 */
describe('Reconhecimento de SELECT (unitário)', () => {
  it('aplica teto em SELECT simples', () => {
    expect(precisaDeTeto('SELECT * FROM evidence WHERE project_id = ?')).toBe(true);
    expect(aplicaTeto('SELECT * FROM evidence')).toBe(`SELECT * FROM evidence LIMIT ${MAX_PAGE_SIZE}`);
  });

  it('aplica depois do ORDER BY, que é onde o LIMIT tem que ficar', () => {
    expect(aplicaTeto('SELECT * FROM e ORDER BY created_at DESC')).toMatch(/ORDER BY created_at DESC LIMIT \d+$/);
  });

  it('reconhece SELECT com espaço e quebra de linha na frente', () => {
    expect(precisaDeTeto('\n   SELECT id FROM x')).toBe(true);
  });

  it('NÃO mexe em statement que já tem LIMIT', () => {
    expect(precisaDeTeto('SELECT * FROM x LIMIT 10')).toBe(false);
    expect(precisaDeTeto('SELECT * FROM x WHERE id IN (SELECT id FROM y LIMIT 5)')).toBe(false);
  });

  it('NÃO mexe em UNION — o LIMIT valeria só para o último ramo', () => {
    expect(precisaDeTeto('SELECT a FROM x UNION SELECT a FROM y')).toBe(false);
  });

  it('NÃO mexe em INSERT, UPDATE, DELETE nem DDL', () => {
    for (const sql of [
      'INSERT INTO x (a) VALUES (?)',
      'UPDATE x SET a = ?',
      'DELETE FROM x WHERE id = ?',
      'CREATE TABLE x (id TEXT)',
      'PRAGMA table_info(x)',
    ]) {
      expect(precisaDeTeto(sql), sql).toBe(false);
    }
  });

  it('NÃO mexe em statement terminado em ponto e vírgula', () => {
    expect(precisaDeTeto('SELECT * FROM x;')).toBe(false);
  });
});

describe('Teto aplicado ao D1 real', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','C','ISO 27001','controller','Active')`).run();
    const hash = await hashPassword('password123');
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','a@b.c',?,'A','platform_admin')`).bind(hash).run();
  });

  it('corta a listagem no teto em vez de devolver tudo', async () => {
    const db = comTeto(env.DB, 5);
    const linhas = [];
    for (let i = 0; i < 12; i++) {
      linhas.push(env.DB.prepare(
        `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES (?, 'p1', ?, ?, 'h', 'text/plain', 1, 'x@y', 'pending')`
      ).bind(`ev${i}`, `f${i}.txt`, `k${i}`));
    }
    await env.DB.batch(linhas);

    const semTeto = await env.DB.prepare('SELECT id FROM evidence WHERE project_id = ?').bind('p1').all();
    expect(semTeto.results.length).toBe(12);

    const comLimite = await db.prepare('SELECT id FROM evidence WHERE project_id = ?').bind('p1').all();
    expect(comLimite.results.length).toBe(5);
  });

  it('não altera contagem agregada — o LIMIT não muda uma linha só', async () => {
    const db = comTeto(env.DB, 2);
    const r = await db.prepare("SELECT count(*) AS n FROM projects").first<any>();
    expect(r.n).toBe(1);
  });

  it('não quebra INSERT feito pelo proxy', async () => {
    const db = comTeto(env.DB, 5);
    await db.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2','C2','ISO 27001','controller','Active')`).run();
    const r = await env.DB.prepare("SELECT client_name FROM projects WHERE id='p2'").first<any>();
    expect(r.client_name).toBe('C2');
  });

  it('batch continua funcionando através do proxy', async () => {
    const db = comTeto(env.DB, 5);
    await db.batch([
      db.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p3','C3','ISO 27001','controller','Active')`),
    ]);
    const r = await env.DB.prepare("SELECT id FROM projects WHERE id='p3'").first<any>();
    expect(r).not.toBeNull();
  });

  it('a aplicação continua respondendo com o middleware montado', async () => {
    const headers = await sessionFor({ id: 'u1', email: 'a@b.c', role: 'platform_admin', iat: Date.now() });
    const res = await app.fetch(new Request('http://localhost/api/v1/projects', { headers }), env as any);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
