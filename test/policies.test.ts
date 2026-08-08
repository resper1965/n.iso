import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

/**
 * Edição manual de política (POST /api/v1/projects/:id/controls/:controlId/policy)
 * contra D1 real (miniflare).
 *
 * Esta rota não chama IA — é gravação direta do texto fornecido pelo chamador.
 * O binding AI é dublado mesmo assim porque o worker inteiro é montado no
 * fetch() (outras rotas do mesmo app dependem dele), mas nenhum caminho aqui
 * o invoca de fato.
 */
const aiStub = { run: async () => ({ response: 'stub' }) };

function testEnv() {
  return { ...env, AI: aiStub } as any;
}

async function req(path: string, init: RequestInit, headers: Record<string, string>) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { ...headers, 'Content-Type': 'application/json' },
    }),
    testEnv()
  );
}

describe('Edição manual de política (D1 real)', () => {
  let headers: Record<string, string>;
  const PROJ = 'proj-policy-1';
  const CONTROL_ID = 'ctrl-a51';

  // `beforeEach` + reset: um teste cria a versao 1 pela rota e o outro semeia a
  // versao 1 e espera a 2 — cada um precisa comecar sem versoes previas (o pool
  // novo isola storage so por arquivo).
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`
    ).bind(PROJ, 'Cliente Política', 'ISO 27001', 'controller', 'Active').run();

    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('user-pol','consultor@ness.dev','x','Consultor','platform_admin')`
    ).run();

    await env.DB.prepare(
      `INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES (?, ?, ?, ?, ?)`
    ).bind(CONTROL_ID, PROJ, 'ISO 27001:2022', 'Políticas de segurança da informação', 'Texto original da política.').run();

    headers = await sessionFor({ id: 'user-pol', email: 'consultor@ness.dev', role: 'platform_admin' });
  });

  it('cria a primeira versão, atualiza a descrição do controle e zera aprovações', async () => {
    // Simula aprovações prévias, que devem ser zeradas pela edição.
    await env.DB.prepare(
      `UPDATE compliance_controls SET ciso_approved_by = 'ciso@ness.dev', ciso_approved_at = CURRENT_TIMESTAMP,
        ceo_approved_by = 'ceo@ness.dev', ceo_approved_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(CONTROL_ID).run();

    const res = await req(
      `/api/v1/projects/${PROJ}/controls/${CONTROL_ID}/policy`,
      { method: 'POST', body: JSON.stringify({ text: 'Novo texto da política, versão 1.' }) },
      headers
    );
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.control_id).toBe(CONTROL_ID);
    expect(body.version).toBe(1);

    const control = await env.DB.prepare('SELECT * FROM compliance_controls WHERE id = ?').bind(CONTROL_ID).first<any>();
    expect(control.description).toBe('Novo texto da política, versão 1.');
    expect(control.ciso_approved_by).toBeNull();
    expect(control.ciso_approved_at).toBeNull();
    expect(control.ceo_approved_by).toBeNull();
    expect(control.ceo_approved_at).toBeNull();

    const versions = await env.DB.prepare(
      'SELECT * FROM policy_versions WHERE project_id = ? AND control_id = ? ORDER BY version ASC'
    ).bind(PROJ, CONTROL_ID).all();
    expect(versions.results.length).toBe(1);
    expect((versions.results[0] as any).version).toBe(1);
    expect((versions.results[0] as any).policy_text).toBe('Novo texto da política, versão 1.');
  });

  it('incrementa a versão corretamente quando já existe versão anterior', async () => {
    // O pool de testes do Workers isola o storage por `it()` — a versão criada
    // no teste anterior não está visível aqui. Semeia a versão 1 diretamente.
    await env.DB.prepare(
      `INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, 1, 'Texto da versão 1.', 'seed@ness.dev')`
    ).bind('ver-seed-1', PROJ, CONTROL_ID).run();

    const res = await req(
      `/api/v1/projects/${PROJ}/controls/${CONTROL_ID}/policy`,
      { method: 'POST', body: JSON.stringify({ text: 'Texto da política, versão 2.' }) },
      headers
    );
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.version).toBe(2);

    const versions = await env.DB.prepare(
      'SELECT version FROM policy_versions WHERE project_id = ? AND control_id = ? ORDER BY version ASC'
    ).bind(PROJ, CONTROL_ID).all();
    expect(versions.results.map((r: any) => r.version)).toEqual([1, 2]);

    const control = await env.DB.prepare('SELECT description FROM compliance_controls WHERE id = ?').bind(CONTROL_ID).first<any>();
    expect(control.description).toBe('Texto da política, versão 2.');
  });

  it('devolve 404 se o projeto não existe', async () => {
    const res = await req(
      `/api/v1/projects/proj-inexistente/controls/${CONTROL_ID}/policy`,
      { method: 'POST', body: JSON.stringify({ text: 'Texto qualquer.' }) },
      headers
    );
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/Projeto não encontrado/);
  });

  it('devolve 404 se o controle não existe no projeto', async () => {
    const res = await req(
      `/api/v1/projects/${PROJ}/controls/ctrl-inexistente/policy`,
      { method: 'POST', body: JSON.stringify({ text: 'Texto qualquer.' }) },
      headers
    );
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/Controle não encontrado/);
  });

  it('rejeita corpo grande demais para ser gravado', async () => {
    // A guarda global de corpo (`bodyGuard`, aplicada a toda rota POST/PUT/PATCH)
    // já corta requisições JSON acima de 1MB com 413, antes de chegar ao handler.
    // O handler também tem seu próprio teto de 2MB (mesmo padrão de
    // approve-document), como segunda camada — mas para JSON ele nunca chega a
    // ser o primeiro a barrar, porque o guard global é mais estrito. O que
    // importa para o chamador é que o limite é respeitado de ponta a ponta.
    const res = await req(
      `/api/v1/projects/${PROJ}/controls/${CONTROL_ID}/policy`,
      { method: 'POST', body: JSON.stringify({ text: 'a'.repeat(2 * 1024 * 1024 + 1) }) },
      headers
    );
    expect(res.status).toBe(413);
    const body = await res.json() as any;
    expect(body.error).toMatch(/1 ?MB/);
  });

  it('rejeita texto vazio', async () => {
    const res = await req(
      `/api/v1/projects/${PROJ}/controls/${CONTROL_ID}/policy`,
      { method: 'POST', body: JSON.stringify({ text: '   ' }) },
      headers
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/text é obrigatório/);
  });
});
