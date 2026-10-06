import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { criarPedido } from '../src/services/pedidos';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * A tela de DPIA (frontend/src/views/privacy.js) cria e edita pelas colunas system_name,
 * data_flow_description, data_subjects_types, personal_data_categories, risks_identified,
 * mitigation_measures e dpo_opinion, e é por elas que lista e mostra o detalhe. A API só gravava
 * as colunas novas (processing_name...): o texto digitado sumia sem erro. As duas famílias existem
 * em `dpia_assessments`; a API passa a gravar as duas.
 */
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);

const P = 'p-ct';
const TELA = {
  system_name: 'CRM', data_flow_description: 'Entra pelo site', data_subjects_types: 'Clientes',
  personal_data_categories: 'Nome, e-mail', necessity_proportionality: 'Contrato',
  risks_identified: 'Vazamento', mitigation_measures: 'TLS', dpo_opinion: 'De acordo',
};

// No topo do arquivo: com `-t`, o beforeAll de um describe filtrado não roda.
beforeAll(applySchema);

describe('DPIA: campos da tela são gravados', () => {
  let ed: Record<string, string>;
  const ler = async (id: string) => {
    const r = await chamar('GET', `/api/v1/projects/${P}/dpia`, ed);
    return ((await r.json<any>()).assessments as any[]).find((a) => a.id === id);
  };

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,'CT','ISO 27701','controller','Active')`).bind(P),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-ct','ct@x.com','x','Ed','org_admin',?)`).bind(P),
    ]);
    ed = await sessionFor({ id: 'u-ct', email: 'ct@x.com', role: 'org_admin', client_project_id: P });
  });

  it('POST pela tela: GET devolve o que foi digitado', async () => {
    const r = await chamar('POST', `/api/v1/projects/${P}/dpia`, ed, TELA);
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await r.json<any>();
    expect(await ler(id)).toMatchObject(TELA);
  }, 30_000);

  it('PUT pela tela: altera o campo enviado e preserva os demais', async () => {
    const { id } = await (await chamar('POST', `/api/v1/projects/${P}/dpia`, ed, TELA)).json<any>();
    const r = await chamar('PUT', `/api/v1/dpia/${id}`, ed, { mitigation_measures: 'TLS e MFA' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ler(id)).toMatchObject({ ...TELA, mitigation_measures: 'TLS e MFA' });
  }, 30_000);

  it('relatório mostra os campos da tela, escapados', async () => {
    const { id } = await (await chamar('POST', `/api/v1/projects/${P}/dpia`, ed, { ...TELA, risks_identified: '<script>x</script>' })).json<any>();
    await env.DB.prepare(`UPDATE projects SET client_name = '<img src=x onerror=alert(1)>' WHERE id = ?`).bind(P).run();
    try {
      const r = await chamar('GET', `/api/v1/projects/${P}/dpia/${id}/report`, ed);
      expect(r.status).toBe(200);
      const html = await r.text();
      for (const v of ['CRM', 'Entra pelo site', 'TLS', 'De acordo']) expect(html).toContain(v);
      expect(html).not.toContain('<script>x</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<img src=x onerror');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    } finally {
      await env.DB.prepare(`UPDATE projects SET client_name = 'CT' WHERE id = ?`).bind(P).run();
    }
  }, 30_000);

  it('PUT de texto da tela com pedido de aprovação aberto: pedido vira substituido', async () => {
    const { id } = await (await chamar('POST', `/api/v1/projects/${P}/dpia`, ed, TELA)).json<any>();
    const pedido = await criarPedido(env.DB, {
      projectId: P, tipo: 'dpia', refId: id, papel: 'ciso', destinatarios: [{ email: 'dpo@x.com' }], criadoPor: 'u-ct',
    });
    expect(pedido).toBeTruthy();
    const r = await chamar('PUT', `/api/v1/dpia/${id}`, ed, { risks_identified: 'Vazamento e acesso indevido' });
    expect(r.status, await r.clone().text()).toBe(200);
    const linha = await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(pedido!.id).first<any>();
    expect(linha.status).toBe('substituido');
  }, 30_000);
});

describe('relatório ROPA escapa o nome do cliente', () => {
  it('client_name com <img onerror> sai escapado', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-rr','<img src=x onerror=alert(1)>','ISO 27701','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-rr','rr@x.com','x','Rr','org_admin','p-rr')`),
    ]);
    const h = await sessionFor({ id: 'u-rr', email: 'rr@x.com', role: 'org_admin', client_project_id: 'p-rr' });
    const r = await chamar('GET', '/api/v1/projects/p-rr/ropa/report', h);
    expect(r.status, await r.clone().text()).toBe(200);
    const html = await r.text();
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  }, 30_000);
});
