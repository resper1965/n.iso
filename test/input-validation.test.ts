import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';
import { MAX_JSON_BYTES } from '../src/middleware/body-guard';

/**
 * Validação de entrada: guarda global de corpo + schemas por rota.
 *
 * O que se afirma aqui é o contrato de erro: entrada inválida responde 400 (ou
 * 413), não 500. A diferença importa — 500 é erro do servidor, aparece no log
 * como incidente e esconde abuso no meio do ruído.
 */
describe('Guarda global de corpo', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','admin@ness.io',?,'Admin','platform_admin')`).bind(hash),
    ]);
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'admin@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function post(path: string, body: string) {
    return app.fetch(new Request(`http://localhost${path}`, { method: 'POST', headers, body }), env as any);
  }

  it('recusa corpo acima de 1 MB com 413', async () => {
    const gigante = JSON.stringify({ processing_purpose: 'x'.repeat(MAX_JSON_BYTES + 100) });
    const res = await post('/api/v1/projects/p1/ropa', gigante);
    expect(res.status).toBe(413);
  });

  it('recusa poluição de protótipo', async () => {
    const res = await post('/api/v1/projects/p1/ropa', '{"__proto__":{"admin":true},"processing_purpose":"x"}');
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('não permitida');
  });

  it('recusa poluição de protótipo aninhada', async () => {
    const res = await post('/api/v1/projects/p1/ropa', '{"a":{"b":{"constructor":{"x":1}}}}');
    expect(res.status).toBe(400);
  });

  it('recusa corpo que não é objeto', async () => {
    expect((await post('/api/v1/projects/p1/ropa', '[1,2,3]')).status).toBe(400);
    expect((await post('/api/v1/projects/p1/ropa', '"texto"')).status).toBe(400);
  });

  it('recusa JSON malformado com 400, não 500', async () => {
    const res = await post('/api/v1/projects/p1/ropa', '{isso nao e json');
    expect(res.status).toBe(400);
  });

  it('deixa passar corpo vazio — rota de ação não recebe corpo', async () => {
    // Se a guarda recusasse isto, quebraria toda rota de "executar" sem payload.
    const res = await post('/api/v1/projects/p1/generate-soa', '');
    expect(res.status).not.toBe(400);
  });
});

describe('Schemas por rota', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','admin@ness.io',?,'Admin','platform_admin')`).bind(hash),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity) VALUES ('c1','p1','ISO 27001:2022','T','Missing',0)`),
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES ('at1','p1','tok-valido','2099-01-01T00:00:00Z')`),
    ]);
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'admin@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function req(path: string, metodo: string, body: unknown) {
    return app.fetch(
      new Request(`http://localhost${path}`, { method: metodo, headers, body: JSON.stringify(body) }),
      env as any
    );
  }

  it('ROPA sem campo obrigatório responde 400, não 500', async () => {
    // Antes: NOT NULL constraint failed -> 500. Erro de cliente virando incidente.
    const res = await req('/api/v1/projects/p1/ropa', 'POST', { processing_purpose: 'Folha' });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('Payload inválido');
  });

  it('ROPA completo é aceito', async () => {
    const res = await req('/api/v1/projects/p1/ropa', 'POST', {
      processing_purpose: 'Folha de pagamento',
      data_categories: 'Nome, CPF',
      data_subjects: 'Empregados',
      legal_basis: 'Obrigação legal',
      retention_period: '5 anos',
      recipients: 'Contabilidade',
      international_transfers: 'Não',
      owner: 'DPO',
    });
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it('maturidade fora da escala CMM 0-5 é recusada', async () => {
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: 9 })).status).toBe(400);
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: -1 })).status).toBe(400);
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: 'alta' })).status).toBe(400);

    // E o valor válido continua passando — senão o teste só prova que quebrei tudo.
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: 3 })).status).toBe(200);
    const ctrl = await env.DB.prepare("SELECT maturity FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.maturity).toBe(3);
  });

  it('token de auditor com prazo aberto é recusado', async () => {
    // days_valid sem teto é acesso perpétuo de terceiro a evidência do cliente.
    expect((await req('/api/v1/projects/p1/auditor-token', 'POST', { days_valid: 99999 })).status).toBe(400);
    expect((await req('/api/v1/projects/p1/auditor-token', 'POST', { days_valid: 0 })).status).toBe(400);
  });

  it('texto acima do teto de campo é recusado', async () => {
    const res = await req('/api/v1/projects/p1/ropa', 'POST', {
      processing_purpose: 'x'.repeat(600), // curto = max 500
      data_categories: 'a', data_subjects: 'a', legal_basis: 'a',
      retention_period: 'a', recipients: 'a', international_transfers: 'a', owner: 'a',
    });
    expect(res.status).toBe(400);
  });

  it('CNPJ com formato inválido é recusado antes de chamar a API externa', async () => {
    const res = await req('/api/v1/leads/qualquer/enrich-cnpj', 'POST', { cnpj: '123' });
    expect(res.status).toBe(400);
  });

  it('nota de auditor externo vazia é recusada', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auditor/tok-valido/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '   ' }),
      }),
      env as any
    );
    expect(res.status).toBe(400);
  });
});
