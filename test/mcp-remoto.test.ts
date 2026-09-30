import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { INSTRUCOES } from '../src/mcp/contexto';

const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
const f = (caminho: string, init: RequestInit = {}) =>
  // ctx real: o OAuthProvider grava `ctx.props` nas chamadas ao /mcp.
  worker.fetch(new Request(BASE + caminho, init), workerEnv() as any, createExecutionContext());
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

async function tokenDoAgente(email = 'cons@ness.lat'): Promise<string> {
  const reg = await (await f('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Teste', token_endpoint_auth_method: 'none' }) })).json<any>();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: `${BASE}/mcp` });
  const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
  await f('/oauth/authorize/entrar', form({ pedido, email, senha: 'senha-forte-123', codigo: '' }));
  const destino = (await (await f('/oauth/authorize/confirmar', form({ pedido, projeto: 'p-a' }))).text()).match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&');
  const code = new URL(destino).searchParams.get('code')!;
  const tok = await (await f('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }).toString() })).json<any>();
  return tok.access_token;
}

const rpcBruto = (token: string, method: string, params: unknown = {}) =>
  f('/mcp', {
    method: 'POST',
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

async function rpc(token: string, method: string, params: unknown = {}) {
  const r = await f('/mcp', {
    method: 'POST',
    // Cliente HTTP real sempre manda Host; o `new Request` do teste não, e o handler o exige.
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const texto = await r.text();
  expect(r.status, texto).toBe(200);
  // Tráfego 2025 (sem envelope 2026-07-28) sai em SSE pelo fallback sem estado; o cliente MCP aceita os dois.
  const json = r.headers.get('Content-Type')?.includes('text/event-stream')
    ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6)
    : texto;
  return JSON.parse(json).result;
}

describe('/mcp remoto', () => {
  let token: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Twyn','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Outro','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      // Consultores descartáveis: cada teste de revogação derruba o acesso de um.
      ...['rev', 'gov', 'exp'].flatMap((k) => [
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultor')`).bind(`u-${k}`, `${k}@ness.lat`, senha, k),
        env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a', ?, ?, 'consultor', 'Consultor')`).bind(k, `${k}@ness.lat`),
      ]),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-b','p-b','b.md','k','h','x')`),
      env.DB.prepare(`INSERT INTO auditor_notes (id, project_id, auditor_token, content) VALUES ('nota-b','p-b','tok','Pergunta de B')`),
    ]);
    token = await tokenDoAgente();
  });

  it('sem token é 401 com o desafio OAuth', async () => {
    const r = await f('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401);
    expect(r.headers.get('WWW-Authenticate')).toContain('Bearer');
  });

  it('instructions cabem no limite do Claude Code e mandam começar por niso_contexto', () => {
    expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
    expect(INSTRUCOES).toContain('niso_contexto');
  });

  it('initialize entrega as instructions no handshake', async () => {
    const res = await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '0' } });
    expect(res.instructions).toBe(INSTRUCOES);
  });

  it('lista ferramentas do consultor, sem lote, sem auditoria, com niso_contexto', async () => {
    const nomes: string[] = (await rpc(token, 'tools/list')).tools.map((t: any) => t.name);
    expect(nomes).toContain('niso_contexto');
    expect(nomes).toContain('niso_create_risk');
    expect(nomes).not.toContain('niso_generate_policies_bulk');
    expect(nomes).not.toContain('niso_create_audit_finding');
    expect(nomes).not.toContain('niso_create_auditor_note');
  });

  it('niso_contexto diz o cliente, o papel e os roteiros', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_contexto', arguments: {} });
    const texto = res.content[0].text;
    expect(texto).toContain('Twyn');
    expect(texto).toContain('p-a');
    expect(texto).toContain('Diagnóstico');
  });

  it('ferramenta de leitura funciona no próprio cliente', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_list_risks', arguments: { projectId: 'p-a' } });
    expect(res.isError, res.content?.[0]?.text).toBeFalsy();
  });

  // Review Focus 2
  it('projectId de outro cliente é recusado', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_list_risks', arguments: { projectId: 'p-b' } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('fora do escopo');
  });

  it('ferramenta fora do papel é recusada mesmo chamada direto', async () => {
    for (const name of ['niso_create_audit_finding', 'niso_create_auditor_note', 'niso_generate_policies_bulk']) {
      const res = await rpc(token, 'tools/call', { name, arguments: { projectId: 'p-a', auditId: 'x' } });
      expect(res.isError, name).toBe(true);
      expect(res.content[0].text, name).toContain('indisponível');
    }
  });

  it('evidência em texto passa pelo transporte interno com o tipo declarado', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_create_evidence', arguments: { projectId: 'p-a', fileName: 'nota.md', content: '# Evidência' } });
    expect(res.isError, res.content?.[0]?.text).toBeFalsy();
    const ev = await env.DB.prepare(`SELECT file_type, uploaded_by FROM evidence WHERE project_id = 'p-a' AND file_name = 'nota.md'`).first<any>();
    expect(ev).toEqual({ file_type: 'text/markdown', uploaded_by: 'agente de cons@ness.lat (Twyn / p-a)' });
  });

  it('escrita pelo agente sai com a autoria do humano', async () => {
    // niso_create_risk exige asset/threat (TOOLS da Task 2), não title.
    const res = await rpc(token, 'tools/call', { name: 'niso_create_risk', arguments: { projectId: 'p-a', asset: 'Base de clientes', threat: 'Vazamento via MCP', impact: 3, probability: 2 } });
    expect(res.isError, res.content?.[0]?.text).toBeFalsy();
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs ORDER BY rowid DESC LIMIT 1`).first<{ actor: string }>();
    expect(log!.actor).toBe('agente de cons@ness.lat (Twyn / p-a)');
  });

  // Revisão final, achado 1: id interpolado no caminho não pode levar o agente
  // a outra rota (`..`, `#`, `%XX` decodificado pelo Hono).
  it('evidenceId com travessia de caminho não alcança a geração em lote', async () => {
    const antes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE details LIKE 'Bulk policy generated%'`).first<any>();
    const res = await rpc(token, 'tools/call', {
      name: 'niso_evaluate_evidence',
      arguments: { evidenceId: '../projects/p-a/%67enerate-policies-bulk#', text: 'x' },
    });
    expect(res.isError, res.content?.[0]?.text).toBe(true);
    const depois = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE details LIKE 'Bulk policy generated%'`).first<any>();
    expect(depois.n).toBe(antes.n);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM policy_versions WHERE project_id = 'p-a'`).first<any>()).n).toBe(0);
  });

  // Revisão final, item 7: ferramenta sem projectId recebe id de outro cliente.
  it('responder nota de auditor de outro cliente é recusado e a nota fica intacta', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_respond_auditor_note', arguments: { noteId: 'nota-b', response: 'invadido' } });
    expect(res.isError).toBe(true);
    const nota = await env.DB.prepare(`SELECT response, responded_by FROM auditor_notes WHERE id = 'nota-b'`).first<any>();
    expect(nota).toEqual({ response: null, responded_by: null });
  });

  it('avaliar evidência de outro cliente é recusado', async () => {
    const res = await rpc(token, 'tools/call', { name: 'niso_evaluate_evidence', arguments: { evidenceId: 'ev-b', text: 'x' } });
    expect(res.isError).toBe(true);
    const ev = await env.DB.prepare(`SELECT evaluation_status FROM evidence WHERE id = 'ev-b'`).first<any>();
    expect(ev.evaluation_status ?? 'pending').toBe('pending');
  });

  // Revisão final, achado 2: acesso revogado/expirado é 401 de verdade no /mcp,
  // para o cliente MCP reabrir o fluxo OAuth — não isError dentro de um 200.
  async function espera401(tk: string) {
    for (const metodo of ['tools/list', 'initialize']) {
      const r = await rpcBruto(tk, metodo, metodo === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } : {});
      expect(r.status, metodo).toBe(401);
      expect(r.headers.get('WWW-Authenticate'), metodo).toContain('error="invalid_token"');
    }
  }

  it('concessão revogada pelo org_admin: /mcp responde 401', async () => {
    const tk = await tokenDoAgente('rev@ness.lat');
    expect((await rpcBruto(tk, 'tools/list')).status).toBe(200);
    const { id } = (await env.DB.prepare(`SELECT id FROM agente_concessoes WHERE user_id = 'u-rev'`).first<any>())!;
    const s = await sessionFor({ id: 'u-o', email: 'dono@twyn.com', role: 'org_admin', client_project_id: 'p-a' });
    const rev = await f(`/api/v1/projects/p-a/agentes/${id}/revogar`, { method: 'POST', headers: s });
    expect(rev.status).toBe(200);
    await espera401(tk);
  });

  it('designação removida da governança: /mcp responde 401', async () => {
    const tk = await tokenDoAgente('gov@ness.lat');
    expect((await rpcBruto(tk, 'tools/list')).status).toBe(200);
    await env.DB.prepare(`DELETE FROM project_governance WHERE email = 'gov@ness.lat'`).run();
    await espera401(tk);
  });

  it('concessão expirada: /mcp responde 401', async () => {
    const tk = await tokenDoAgente('exp@ness.lat');
    expect((await rpcBruto(tk, 'tools/list')).status).toBe(200);
    await env.DB.prepare(`UPDATE agente_concessoes SET expira_em = datetime('now', '-1 minute') WHERE user_id = 'u-exp'`).run();
    await espera401(tk);
  });
});
