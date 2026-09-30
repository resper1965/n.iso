import { createExecutionContext } from 'cloudflare:test';
import worker from '../../src/index';
import { workerEnv } from './d1';

export const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
export const f = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request(BASE + caminho, init), workerEnv() as any, createExecutionContext());
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

/** Faz o OAuth completo como o consultor e escolhe `projeto`. Senha: senha-forte-123. */
export async function tokenDoAgente(email: string, projeto: string): Promise<string> {
  const reg = await (await f('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Teste', token_endpoint_auth_method: 'none' }) })).json<any>();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: `${BASE}/mcp` });
  const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
  await f('/oauth/authorize/entrar', form({ pedido, email, senha: 'senha-forte-123', codigo: '' }));
  const destino = (await (await f('/oauth/authorize/confirmar', form({ pedido, projeto }))).text()).match(/url=([^"]+)"/)![1].replace(/&amp;/g, '&');
  const code = new URL(destino).searchParams.get('code')!;
  const tok = await (await f('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }).toString() })).json<any>();
  return tok.access_token;
}

/** tools/call e devolve o `result` (lida com resposta JSON ou SSE). */
export async function chamarFerramenta(token: string, name: string, args: unknown): Promise<{ isError?: boolean; content: { type: string; text: string }[] }> {
  const r = await f('/mcp', {
    method: 'POST',
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const texto = await r.text();
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${texto}`);
  const corpo = r.headers.get('Content-Type')?.includes('text/event-stream')
    ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6)
    : texto;
  return JSON.parse(corpo).result;
}
