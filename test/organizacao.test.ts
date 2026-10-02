import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { lerConfigOrg, formatarNumeroProposta } from '../src/services/organizacao';

const worker = app;
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(
    new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'X-Agente-Confirmado': '1' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE } as any,
  );

describe('configuração da organização', () => {
  let adm: Record<string, string>, comercial: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor',NULL)`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
    ]);
    adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
    comercial = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' });
    consultor = await sessionFor({ id: 'u-con', email: 'con@ness.lat', role: 'consultor' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p-a' });
  });

  it('GET devolve a ness. com os padrões de preço do motor atual', async () => {
    const r = await chamar('GET', '/api/v1/org/config', comercial);
    expect(r.status).toBe(200);
    const c = await r.json<any>();
    expect(c.nome).toBe('ness.');
    expect(c.prefixoProposta).toBe('NESS');
    expect(c.preco.diaria).toEqual({ '1': 2200, '2': 2900, '3': 3600 });
    expect(c.preco.tetoDesconto).toBe(15);
    expect(c.sugestaoNumero).toMatch(/^NESS-\d{4}-001$/);
  });

  it('consultor, cliente e agente não leem: a configuração tem custo e margem', async () => {
    expect((await chamar('GET', '/api/v1/org/config', consultor)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/org/config', cliente)).status).toBe(403);
    expect((await comoAgente('GET', '/api/v1/org/config')).status).toBe(403);
  });

  it('PUT: só platform_admin grava; comercial leva 403', async () => {
    const corpo = { corDestaque: '#1f7a5c', prefixoProposta: 'NESS', preco: { diaria: { '1': 2000, '2': 2800, '3': 3500 } } };
    expect((await chamar('PUT', '/api/v1/org/config', comercial, corpo)).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/org/config', adm, corpo)).status).toBe(200);
    const c = await (await chamar('GET', '/api/v1/org/config', comercial)).json<any>();
    expect(c.corDestaque).toBe('#1f7a5c');
    expect(c.preco.diaria['2']).toBe(2800);
    expect(c.preco.tetoDesconto).toBe(15); // o que não veio no corpo continua
  });

  it('PUT parcial de preço não apaga o que já foi gravado (merge campo a campo)', async () => {
    await chamar('PUT', '/api/v1/org/config', adm, { preco: { tetoDesconto: 20 } });
    await chamar('PUT', '/api/v1/org/config', adm, { preco: { diaria: { '3': 3700 } } });
    const c = await (await chamar('GET', '/api/v1/org/config', comercial)).json<any>();
    expect(c.preco.tetoDesconto).toBe(20);
    expect(c.preco.diaria).toEqual({ '1': 2000, '2': 2800, '3': 3700 });
    await chamar('PUT', '/api/v1/org/config', adm, { preco: { tetoDesconto: 15 } });
  });

  it.each([
    [{ corDestaque: 'azul' }, 'corDestaque'],
    [{ prefixoProposta: 'NE SS' }, 'prefixoProposta'],
    [{ prefixoProposta: 'A/B' }, 'prefixoProposta'],
    [{ preco: { diaria: { '1': 0 } } }, 'preco.diaria.1'],
    [{ preco: { tetoDesconto: 60 } }, 'preco.tetoDesconto'],
    [{ proximoNumero: 0 }, 'proximoNumero'],
  ])('corpo inválido %j → 400 apontando %s', async (corpo, campo) => {
    const r = await chamar('PUT', '/api/v1/org/config', adm, corpo);
    expect(r.status).toBe(400);
    const b = await r.json<any>();
    expect(b.details.map((d: any) => d.path)).toContain(campo);
  });

  it('texto com <script> é guardado como veio (escape é na saída)', async () => {
    await chamar('PUT', '/api/v1/org/config', adm, { textos: { sobre: '<script>x</script>' } });
    const c = await (await chamar('GET', '/api/v1/org/config', comercial)).json<any>();
    expect(c.textos.sobre).toBe('<script>x</script>');
  });

  it('a gravação vai para a trilha', async () => {
    const t = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'org.config_atualizada' ORDER BY created_at DESC LIMIT 1`).first<any>();
    expect(t?.actor).toBe('adm@ness.lat');
  });

  it('organização ausente: lerConfigOrg falha fechado', async () => {
    await expect(lerConfigOrg(env.DB, 'org_inexistente')).rejects.toThrow(/não configurada/);
  });
});

describe('formatarNumeroProposta', () => {
  it('zera à esquerda até três dígitos e não corta números maiores', () => {
    expect(formatarNumeroProposta('NESS', 2026, 14)).toBe('NESS-2026-014');
    expect(formatarNumeroProposta('PONTE', 2026, 1234)).toBe('PONTE-2026-1234');
  });
});
