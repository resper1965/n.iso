import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, execSql, sessionFor, workerEnv } from './helpers/d1';
import { FAIXA_DA_TABELA, faixaDoCaminho, recusaDeModulo } from '../src/modulos';
import migration0060 from '../migrations/0060_modulos_do_contrato.sql?raw';

/**
 * n.iso e n.privacy são produtos separados sobre o mesmo cadastro. O que o projeto habilitou (`projeto_modulos`) decide a faixa:
 * núcleo (qualquer produto), só n.iso ou só n.privacy. Toda rota de projeto precisa estar classificada.
 */
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const rotasDeProjeto = () => [...new Set((app.routes as { method: string; path: string }[])
  .filter((r) => METODOS.includes(r.method) && /^\/api\/v1\/projects\/:[^/]+/.test(r.path)).map((r) => r.path))];

describe('classificação', () => {
  it('toda rota de projeto cai numa faixa (rota nova sem faixa reprova: classifique em src/modulos.ts)', () => {
    const rotas = rotasDeProjeto();
    expect(rotas.length).toBeGreaterThan(100);
    expect(rotas.filter((r) => faixaDoCaminho(r) === null)).toEqual([]);
  });

  it('as faixas que importam: cadastro compartilhado, só n.iso e só n.privacy', () => {
    const f = (p: string) => faixaDoCaminho(`/api/v1/projects/p1/${p}`);
    for (const p of ['', 'partes', 'documentos', 'documentos/d1', 'evidence', 'ropa', 'ropa/r1/approve', 'dpia', 'assets', 'governance', 'modulos']) expect(f(p), p).toBe('nucleo');
    for (const p of ['controls', 'risks', 'audits', 'capa', 'certification', 'phases', 'checklist-progress', 'readiness-check', 'auditor-token']) expect(f(p), p).toBe('iso');
    for (const p of ['terceiros', 'encarregado', 'titular-pedidos', 'incidentes', 'consentimentos', 'requisitos/lacunas', 'ropa/importar',
      'ropa/r1/ligacoes', 'ropa/r1/lia', 'ropa/r1/dpia', 'documentos/d1/requisitos', 'evidence/e1/validade', 'evidence/e1/requisitos']) expect(f(p), p).toBe('privacy');
    expect(faixaDoCaminho('/api/v1/requisitos')).toBeNull(); // catálogo global: fora da trava de projeto
  });

  it('toda tabela de recurso por id tem faixa', () => {
    for (const t of ['risks', 'vendors', 'training_records', 'ropa_records', 'corrective_actions', 'compliance_controls', 'evidence', 'itens', 'stakeholders',
      'dpia_assessments', 'audit_schedule', 'certification_tracking', 'audit_findings', 'management_reviews', 'performance_metrics', 'webhooks', 'api_keys', 'auditor_notes']) {
      expect(FAIXA_DA_TABELA[t], t).toBeTruthy();
    }
  });

  it('recusaDeModulo', () => {
    expect(recusaDeModulo('nucleo', ['privacy'])).toBeNull();
    expect(recusaDeModulo('iso', ['privacy'])).toBe('Produto n.iso não habilitado neste projeto');
    expect(recusaDeModulo('privacy', ['iso'])).toBe('Produto n.privacy não habilitado neste projeto');
    expect(recusaDeModulo('privacy', ['iso', 'privacy'])).toBeNull();
    expect(recusaDeModulo('privacy', [])).toBeNull(); // sem módulo = projeto inexistente: a rota responde 404
  });
});

describe('trava no servidor', () => {
  let admin: Record<string, string>, consultor: Record<string, string>;
  const chamar = (h: Record<string, string>, m: string, p: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + p, {
    method: m, headers: { 'Content-Type': 'application/json', ...h }, body: m === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, modulos_contratados) VALUES ('org_dupla', 'Dupla', 'dupla', '["iso","privacy"]'), ('org_priv', 'Só privacidade', 'so-priv', '["privacy"]')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('so-iso', 'A', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('so-priv', 'B', '', 'Controller', 'Active', 'org_priv')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('dois', 'C', 'ISO 27001', 'Controller', 'Active', 'org_dupla')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_priv')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'so-priv', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctl-priv', 'so-priv', 'ISO 27001:2022', 'A.5.1 — x'), ('ctl-iso', 'so-iso', 'ISO 27001:2022', 'A.5.1 — x')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r-iso', 'so-iso', 'Folha'), ('r-priv', 'so-priv', 'Folha')`),
    ]);
    admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_priv' });
  });

  it('o projeto nasce com o que a organização contratou (gatilho da 0060)', async () => {
    const m = async (id: string) => (await env.DB.prepare('SELECT group_concat(modulo) AS m FROM (SELECT modulo FROM projeto_modulos WHERE project_id = ? ORDER BY modulo)').bind(id).first<{ m: string }>())!.m;
    expect(await m('so-iso')).toBe('iso');
    expect(await m('so-priv')).toBe('privacy');
    expect(await m('dois')).toBe('iso,privacy');
  });

  it('projeto só n.iso: n.privacy é 403; cadastro e n.iso respondem', async () => {
    for (const p of ['terceiros', 'encarregado', 'titular-pedidos', 'ropa/r-iso/ligacoes']) {
      const r = await chamar(admin, 'GET', `/api/v1/projects/so-iso/${p}`);
      expect(r.status, p).toBe(403);
      expect((await r.json() as { error: string }).error).toBe('Produto n.privacy não habilitado neste projeto');
    }
    for (const p of ['ropa', 'partes', 'documentos', 'controls']) expect((await chamar(admin, 'GET', `/api/v1/projects/so-iso/${p}`)).status, p).toBe(200);
  });

  it('projeto só n.privacy: n.iso é 403 (também para o platform_admin e pelo id do recurso); cadastro e n.privacy respondem', async () => {
    for (const p of ['controls', 'risks', 'phases']) expect((await chamar(admin, 'GET', `/api/v1/projects/so-priv/${p}`)).status, p).toBe(403);
    for (const p of ['ropa', 'partes', 'documentos', 'terceiros', 'encarregado', 'ropa/r-priv/ligacoes']) expect((await chamar(admin, 'GET', `/api/v1/projects/so-priv/${p}`)).status, p).toBe(200);
    const r = await chamar(consultor, 'PUT', '/api/v1/controls/ctl-priv', { status: 'Implemented' });
    expect(r.status).toBe(403);
    expect((await r.json() as { error: string }).error).toContain('n.iso');
    expect((await chamar(consultor, 'GET', '/api/v1/projects/so-priv/encarregado')).status).toBe(200);
  });

  it('projeto com os dois: tudo responde, e o cadastro é o mesmo nos dois produtos', async () => {
    for (const p of ['controls', 'terceiros', 'ropa', 'encarregado']) expect((await chamar(admin, 'GET', `/api/v1/projects/dois/${p}`)).status, p).toBe(200);
  });

  it('a lista de projetos traz os produtos de cada um', async () => {
    const l = await (await chamar(admin, 'GET', '/api/v1/projects')).json() as { id: string; modulos: string[] }[];
    const m = Object.fromEntries(l.map((p) => [p.id, p.modulos]));
    expect(m).toMatchObject({ 'so-iso': ['iso'], 'so-priv': ['privacy'], dois: ['iso', 'privacy'] });
  });

  it('criar projeto escolhe produtos dentro do contrato; só n.privacy nasce sem a trilha da ISO; fora do contrato é 409', async () => {
    const criar = (corpo: object, org: string) => app.fetch(new Request('http://localhost/api/v1/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Org-Id': org, ...admin }, body: JSON.stringify({ client_name: 'Novo', ...corpo }),
    }), workerEnv());
    const r1 = await criar({ modulos: ['privacy'] }, 'org_dupla');
    expect(r1.status, await r1.clone().text()).toBe(201);
    const p1 = await r1.json() as { id: string; modulos: string[] };
    expect(p1.modulos).toEqual(['privacy']);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM project_phases WHERE project_id = ?').bind(p1.id).first<{ n: number }>())!.n).toBe(0);
    const r2 = await criar({}, 'org_dupla');
    expect((await r2.json() as { modulos: string[] }).modulos).toEqual(['iso', 'privacy']);
    expect((await criar({ modulos: ['iso'] }, 'org_priv')).status).toBe(409);
    expect((await criar({ modulos: ['nada'] }, 'org_dupla')).status).toBe(400);
  });

  it('desligar o n.privacy esconde o produto e não apaga o dado; religar devolve', async () => {
    await env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em) VALUES ('inc-d', 'dois', 'IN-2026-0001', 'X', '2026-10-01')`).run();
    expect((await chamar(admin, 'PUT', '/api/v1/projects/dois/modulos/privacy', { habilitado: false })).status).toBe(200);
    expect((await chamar(admin, 'GET', '/api/v1/projects/dois/incidentes')).status).toBe(403);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM incidentes WHERE id = 'inc-d'`).first<{ n: number }>())!.n).toBe(1);
    expect((await chamar(admin, 'PUT', '/api/v1/projects/dois/modulos/privacy', { habilitado: true })).status).toBe(200);
    expect((await (await chamar(admin, 'GET', '/api/v1/projects/dois/incidentes')).json() as unknown[]).length).toBe(1);
  });
});

describe('migration 0060', () => {
  it('troca o gatilho: contrato da organização, padrão n.iso sem organização ou com contrato inválido; existentes não mudam', async () => {
    await applySchema();
    // Estado de antes da 0060: o gatilho antigo (sempre `iso`). Cada comando em linha própria: execSql fecha gatilho na linha do END.
    await execSql(`DROP TRIGGER IF EXISTS projeto_modulos_do_contrato;
CREATE TRIGGER IF NOT EXISTS projeto_modulo_iso_padrao AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (NEW.id, 'iso', 'sistema');
END;`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, modulos_contratados) VALUES ('o-priv', 'P', 'o-priv', '["privacy"]'), ('o-ruim', 'R', 'o-ruim', 'nao-e-json')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('antigo', 'A', 'x', 'c', 'Active', 'o-priv')`),
    ]);
    await execSql(migration0060);
    await execSql(migration0060); // repetível
    expect(await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = 'projeto_modulo_iso_padrao'").first()).toEqual({ n: 0 });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('novo-priv', 'N', 'x', 'c', 'Active', 'o-priv'), ('novo-ruim', 'N', 'x', 'c', 'Active', 'o-ruim'), ('novo-sem', 'N', 'x', 'c', 'Active', 'org-que-nao-existe')`),
    ]);
    const m = async (id: string) => (await env.DB.prepare('SELECT group_concat(modulo) AS m FROM projeto_modulos WHERE project_id = ?').bind(id).first<{ m: string }>())!.m;
    expect(await m('antigo')).toBe('iso'); // existente: não muda
    expect(await m('novo-priv')).toBe('privacy');
    expect(await m('novo-ruim')).toBe('iso');
    expect(await m('novo-sem')).toBe('iso');
  });
});

describe('CORS do n.privacy', () => {
  it('a origem nprivacy.ness.com.br é aceita; outra origem não', async () => {
    const pre = (origin: string) => app.fetch(new Request('http://localhost/api/v1/auth/me', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }), workerEnv());
    expect((await pre('https://nprivacy.ness.com.br')).headers.get('access-control-allow-origin')).toBe('https://nprivacy.ness.com.br');
    expect((await pre('https://niso.ness.com.br')).headers.get('access-control-allow-origin')).toBe('https://niso.ness.com.br');
    expect((await pre('https://malicioso.exemplo.com')).headers.get('access-control-allow-origin')).toBeFalsy();
  });
});
