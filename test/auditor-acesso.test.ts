import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

/**
 * A consultoria gera, lista e revoga o link do auditor externo; o cliente não. E o critério da
 * fatia: o auditor recebe um link e vê a SoA com a evidência de cada controle, e baixa o arquivo.
 */
const P = 'ac-proj';
const OUTRO = 'ac-outro';
const CONS = 'cons@ness.lat';
let consultor: Record<string, string>;
let cliente: Record<string, string>;

const chamar = (headers: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.8.0.1', ...headers },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const portal = (acao: string, corpo: Record<string, unknown>) => chamar({}, 'POST', `/api/v1/public/auditor/${acao}`, corpo);
const tokenDoLink = (url: string) => url.match(/\/auditor#([0-9a-f]{64})$/)?.[1] ?? '';

type Gerado = { id: string; url: string; expires_at: string };
type Lista = { tokens: { id: string; created_by: string | null; created_at: string; expires_at: string }[] };
type Ver = { controles: { id: string; evidencias: { id: string; file_name: string }[] }[] };

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity) VALUES ('ac-c1', ?, 'ISO 27001:2022', 'A.5.1 — Políticas de segurança da informação', 'Implemented', 3)`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
                    VALUES ('ac-e1', 'ac-c1', ?, 'politica.pdf', 'ac/politica.pdf', 'h1', 'application/pdf', 9, ?, 'conforming')`).bind(P, CONS),
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('ac-t-outro', ?, ?, datetime('now', '+1 day'))`).bind(OUTRO, await sha256Hex('tok-outro')),
  ]);
  await env.STORAGE.put('ac/politica.pdf', 'PDF-falso');
  await designarConsultor(CONS, P);
  consultor = await sessionFor({ id: `cons:${CONS}`, email: CONS, role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.lat', role: 'org_admin', client_project_id: P });
});

describe('critério: o auditor recebe um link e vê a SoA com a evidência de cada controle', () => {
  it('consultor gera o link; o auditor abre, vê o controle com a evidência e baixa o arquivo', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 7 });
    expect(r.status, await r.clone().text()).toBe(201);
    const token = tokenDoLink((await r.json<Gerado>()).url);
    const ver = await portal('ver', { token });
    expect(ver.status, await ver.clone().text()).toBe(200);
    const d = await ver.json<Ver>();
    expect(d.controles.find((c) => c.id === 'ac-c1')?.evidencias.map((e) => e.file_name)).toEqual(['politica.pdf']);
    const arq = await portal('evidencia', { token, evidence_id: 'ac-e1' });
    expect(arq.status).toBe(200);
    expect(await arq.text()).toBe('PDF-falso');
  });
});

describe('gestão do link pela consultoria', () => {
  it('lista os links válidos sem token nem hash; revogar derruba o acesso na hora e fica na trilha', async () => {
    const gerado = await (await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 30 })).json<Gerado>();
    const token = tokenDoLink(gerado.url);
    const lista = await chamar(consultor, 'GET', `/api/v1/projects/${P}/auditor-token`);
    const texto = await lista.clone().text();
    expect(lista.status, texto).toBe(200);
    expect(texto).not.toContain(token);
    expect(texto).not.toContain(await sha256Hex(token));
    const { tokens } = await lista.json<Lista>();
    expect(tokens.find((t) => t.id === gerado.id)).toMatchObject({ created_by: CONS, expires_at: gerado.expires_at });
    expect(tokens.some((t) => t.id === 'ac-t-outro')).toBe(false);

    const rev = await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token/${gerado.id}/revogar`);
    expect(rev.status, await rev.clone().text()).toBe(200);
    expect((await portal('ver', { token })).status).toBe(404);
    const depois = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/auditor-token`)).json<Lista>();
    expect(depois.tokens.some((t) => t.id === gerado.id)).toBe(false);
    expect(await env.DB.prepare('SELECT revoked_by FROM auditor_tokens WHERE id = ?').bind(gerado.id).first('revoked_by')).toBe(CONS);
    const { results } = await env.DB.prepare(`SELECT action FROM audit_logs WHERE project_id = ? AND details LIKE ?`)
      .bind(P, `%${gerado.id}%`).all<{ action: string }>();
    expect(results.map((l) => l.action).sort()).toEqual(['auditor_token.created', 'auditor_token.revoked']);
    // Revogar de novo: 404, nada muda.
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token/${gerado.id}/revogar`)).status).toBe(404);
  });

  it('link de outro projeto pela rota do próprio: 404, e o link alheio continua valendo', async () => {
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/auditor-token/ac-t-outro/revogar`)).status).toBe(404);
    expect(await env.DB.prepare(`SELECT revoked_at FROM auditor_tokens WHERE id = 'ac-t-outro'`).first('revoked_at')).toBeNull();
    expect((await portal('ver', { token: 'tok-outro' })).status).toBe(200);
  });

  it('o cliente (org_admin) não gera, não lista e não revoga', async () => {
    const tentativas: [string, string, unknown?][] = [
      ['POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 7 }],
      ['GET', `/api/v1/projects/${P}/auditor-token`],
      ['POST', `/api/v1/projects/${P}/auditor-token/qualquer/revogar`],
    ];
    for (const [metodo, caminho, corpo] of tentativas) {
      const r = await chamar(cliente, metodo, caminho, corpo);
      expect([r.status, (await r.json<{ error: string }>()).error], `${metodo} ${caminho}`)
        .toEqual([403, 'Somente a consultoria gere o acesso do auditor externo']);
    }
  });
});

describe('GET /projects/:id/auditor-notes', () => {
  it('nota apontando controle de outro projeto não expõe o título dele', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity) VALUES ('ac-c-outro', ?, 'ISO 27001:2022', 'A.9.9 — Segredo do outro', 'Implemented', 1)`).bind(OUTRO),
      env.DB.prepare(`INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content) VALUES ('ac-n1', ?, 'ac-t-outro', 'ac-c-outro', 'question', 'x')`).bind(P),
    ]);
    const r = await chamar(consultor, 'GET', `/api/v1/projects/${P}/auditor-notes`);
    const d = await r.json<{ notes: { id: string; control_title: string | null }[] }>();
    expect(r.status).toBe(200);
    expect(d.notes.find((n) => n.id === 'ac-n1')?.control_title).toBeNull();
    expect(JSON.stringify(d)).not.toContain('Segredo do outro');
  });
});
