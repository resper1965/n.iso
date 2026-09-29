import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword, sha256Hex } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Testes de API contra D1 e KV REAIS (miniflare).
 *
 * A versão anterior deste arquivo montava um `mockEnv` cujo D1 devolvia
 * `{ ok: true }` para qualquer `first()` e `{ success: true }` para qualquer
 * `run()`. Com isso a suíte não conseguia falhar: uma consulta a tabela
 * inexistente, um INSERT com coluna errada ou uma constraint violada passavam
 * todos como sucesso. Foi assim que o código chegou a produção consultando
 * tabelas que não existiam.
 *
 * Agora cada requisição executa o SQL de verdade contra o schema.sql canônico.
 * As asserções de autorização continuam as mesmas — o que mudou é que agora
 * elas só passam se o handler por trás também funcionar.
 *
 * Projetos da fixture: `proj-123` (o do usuário) e `proj-999` (o outro tenant).
 */

const PROJ = 'proj-123';
const OUTRO = 'proj-999';

/** IA e Vectorize não têm binding no ambiente de teste; nenhum caminho aqui depende deles. */
function testEnv(extra: Record<string, unknown> = {}) {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) }, ...extra } as any;
}

async function req(path: string, init: RequestInit = {}, e = testEnv()) {
  return worker.fetch(new Request(`http://localhost${path}`, init), e);
}

const CHAVE_LEITURA = 'chave-de-leitura';
const CHAVE_ESCRITA = 'chave-de-escrita';

describe('nISO API (D1 e KV reais)', () => {
  let admin: Record<string, string>;
  let orgAdmin: Record<string, string>;
  let orgUser: Record<string, string>;
  let client: Record<string, string>;
  let legacyAdmin: Record<string, string>;
  let consultor: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(PROJ, 'Cliente Um', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(OUTRO, 'Cliente Dois', 'ISO 27001', 'controller', 'Active'),

      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-admin', 'admin@ness.io', senha, 'Admin', 'platform_admin', null),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-orgadmin', 'orgadmin@cliente.com', senha, 'Org Admin', 'org_admin', PROJ),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-orguser', 'orguser@cliente.com', senha, 'Org User', 'org_user', PROJ),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-client', 'client@cliente.com', senha, 'Cliente', 'client', PROJ),
      // Alvo das operações de PUT/DELETE em /users/:id.
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-alvo', 'alvo@cliente.com', senha, 'Alvo', 'org_user', PROJ),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-recuperar', 'test@example.com', senha, 'Recuperar', 'org_user', PROJ),

      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES (?,?,?,?,?)`)
        .bind('ctrl-proprio', PROJ, 'ISO 27001:2022', 'Controle próprio', 'Missing'),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES (?,?,?,?,?)`)
        .bind('ctrl-alheio', OUTRO, 'ISO 27001:2022', 'Controle alheio', 'Missing'),

      env.DB.prepare(
        `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind('ev-proprio', PROJ, 'a.md', 'k/a.md', 'aa', 'text/markdown', 2, 'x@y', 'pending'),
      env.DB.prepare(
        `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind('ev-alheio', OUTRO, 'b.md', 'k/b.md', 'bb', 'text/markdown', 2, 'x@y', 'pending'),

      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?,?)`)
        .bind('at-1', PROJ, 'tok123', '2099-01-01T00:00:00Z'),

      env.DB.prepare(`INSERT INTO assessments (id, client_name, status, access_token) VALUES (?,?,?,?)`)
        .bind('assess-1', 'Empresa X', 'In Progress', 'tok456'),

      env.DB.prepare(`INSERT INTO policy_templates (id, title, iso_ref) VALUES (?,?,?)`)
        .bind('isp', 'Information Security Policy (ISP)', '5.1'),

      // Chaves de API: o banco guarda o SHA-256, nunca o valor em claro.
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?,?,?,?,?,?)`)
        .bind('key-ro', PROJ, await sha256Hex(CHAVE_LEITURA), 'leitura', 'read', 'Active'),
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?,?,?,?,?,?)`)
        .bind('key-rw', PROJ, await sha256Hex(CHAVE_ESCRITA), 'escrita', 'write', 'Active'),
    ]);

    admin = await sessionFor({ id: 'usr-admin', email: 'admin@ness.io', role: 'platform_admin' });
    orgAdmin = await sessionFor({ id: 'usr-orgadmin', email: 'orgadmin@cliente.com', role: 'org_admin', client_project_id: PROJ });
    orgUser = await sessionFor({ id: 'usr-orguser', email: 'orguser@cliente.com', role: 'org_user', client_project_id: PROJ });
    client = await sessionFor({ id: 'usr-client', email: 'client@cliente.com', role: 'client', client_project_id: PROJ });
    consultor = await sessionFor({ id: 'usr-admin', email: 'admin@ness.io', role: 'consultant' });
    // Papel legado, mapeado para platform_admin pelo authMiddleware.
    legacyAdmin = await sessionFor({ id: 'usr-admin', email: 'admin@ness.io', role: 'admin' });
  });

  it('rota pública de pricing responde 200 sem sessão', async () => {
    const res = await req('/api/v1/public/pricing');
    expect(res.status).toBe(200);
    expect((await res.json() as any).ok).toBe(true);
  });

  it('rota protegida sem token responde 401', async () => {
    expect((await req('/api/v1/dashboard/stats')).status).toBe(401);
  });

  describe('RBAC e isolamento entre clientes', () => {
    it('platform_admin lista usuários', async () => {
      const res = await req('/api/v1/admin/users', { headers: admin });
      expect(res.status).toBe(200);
      // Sem mock: são os usuários que a fixture criou de verdade.
      expect((await res.json() as any[]).length).toBeGreaterThan(0);
    });

    it('client não acessa a listagem de usuários', async () => {
      expect((await req('/api/v1/admin/users', { headers: client })).status).toBe(403);
    });

    it('client não acessa projeto de outro cliente (IDOR)', async () => {
      expect((await req(`/api/v1/projects/${OUTRO}`, { headers: client })).status).toBe(403);
    });

    // /api/v1/controls está montado FORA de /api/v1/projects/:projectId/*, então o
    // projectAccessMiddleware não passa por aqui. Sem checagem explícita em cada
    // rota, o UPDATE casa só por id e atravessa o tenant.
    describe('controles de outro tenant não são alcançáveis por id', () => {
      it('PUT /controls/:id não reescreve controle alheio', async () => {
        const r = await req('/api/v1/controls/ctrl-alheio', {
          method: 'PUT',
          headers: { ...orgAdmin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'INVADIDO' }),
        });
        expect(r.status).toBe(403);
        const l = await env.DB.prepare('SELECT title FROM compliance_controls WHERE id = ?').bind('ctrl-alheio').first<any>();
        expect(l.title).toBe('Controle alheio');
      });

      it('PUT /controls/:id/status não falseia o SGSI alheio', async () => {
        const r = await req('/api/v1/controls/ctrl-alheio/status', {
          method: 'PUT',
          headers: { ...orgAdmin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Implemented' }),
        });
        expect(r.status).toBe(403);
        const l = await env.DB.prepare('SELECT status FROM compliance_controls WHERE id = ?').bind('ctrl-alheio').first<any>();
        expect(l.status).toBe('Missing');
      });

      it('PUT /controls/:id/approve não assina controle alheio, nem com project_id no corpo', async () => {
        // O `project_id` do corpo era o que definia o escopo do UPDATE — mandar o
        // projeto alheio bastava para assinar o controle do outro tenant.
        const r = await req('/api/v1/controls/ctrl-alheio/approve', {
          method: 'PUT',
          headers: { ...orgAdmin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'password123', project_id: OUTRO }),
        });
        expect(r.status).toBe(403);
        const l = await env.DB.prepare('SELECT status FROM compliance_controls WHERE id = ?').bind('ctrl-alheio').first<any>();
        expect(l.status).toBe('Missing');
      });

      it('mas o controle do próprio projeto continua editável e assinável', async () => {
        const edicao = await req('/api/v1/controls/ctrl-proprio', {
          method: 'PUT',
          headers: { ...orgAdmin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Título novo' }),
        });
        expect(edicao.status, await edicao.clone().text()).toBe(200);

        const assinatura = await req('/api/v1/controls/ctrl-proprio/approve', {
          method: 'PUT',
          headers: { ...orgAdmin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'password123' }),
        });
        expect(assinatura.status, await assinatura.clone().text()).toBe(200);

        const l = await env.DB.prepare('SELECT title, status FROM compliance_controls WHERE id = ?').bind('ctrl-proprio').first<any>();
        expect(l.title).toBe('Título novo');
        expect(l.status).toBe('Approved');
      });
    });

    it('platform_admin altera e remove usuário, e a linha some do banco', async () => {
      const put = await req('/api/v1/users/usr-alvo', {
        method: 'PUT',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nome Novo', role: 'org_admin' }),
      });
      expect(put.status).toBe(200);
      const alterado = await env.DB.prepare("SELECT name, role FROM users WHERE id='usr-alvo'").first<any>();
      expect(alterado.name).toBe('Nome Novo');
      expect(alterado.role).toBe('org_admin');

      const del = await req('/api/v1/users/usr-alvo', { method: 'DELETE', headers: admin });
      expect(del.status).toBe(200);
      const removido = await env.DB.prepare("SELECT id FROM users WHERE id='usr-alvo'").first<any>();
      expect(removido).toBeNull();
    });

    it('platform_admin cria usuário e a senha é gravada com hash', async () => {
      const res = await req('/api/v1/users', {
        method: 'POST',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'novo@example.com', password: 'password123', name: 'Novo', role: 'org_admin', client_project_id: PROJ }),
      });
      const data = await res.json() as any;
      expect(res.status, JSON.stringify(data)).toBe(201);
      expect(data.email).toBe('novo@example.com');
      expect(data.role).toBe('org_admin');

      const gravado = await env.DB.prepare("SELECT password_hash FROM users WHERE email='novo@example.com'").first<any>();
      expect(gravado.password_hash).not.toBe('password123');
      expect(gravado.password_hash).toContain(':'); // salt:hash do PBKDF2
    });

    it('org_admin cria usuário sempre no próprio projeto, mesmo pedindo outro', async () => {
      const res = await req('/api/v1/users', {
        method: 'POST',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dele@example.com', password: 'password123', name: 'Dele', role: 'org_user', client_project_id: OUTRO }),
      });
      const data = await res.json() as any;
      expect(res.status, JSON.stringify(data)).toBe(201);
      expect(data.client_project_id).toBe(PROJ);

      // O que vale é o que ficou no banco, não o que a resposta disse.
      const gravado = await env.DB.prepare("SELECT client_project_id FROM users WHERE email='dele@example.com'").first<any>();
      expect(gravado.client_project_id).toBe(PROJ);
    });

    it('org_admin não cria platform_admin', async () => {
      const res = await req('/api/v1/users', {
        method: 'POST',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'mau@example.com', password: 'password123', name: 'Mau', role: 'platform_admin' }),
      });
      expect(res.status).toBe(403);
      const criado = await env.DB.prepare("SELECT id FROM users WHERE email='mau@example.com'").first<any>();
      expect(criado).toBeNull();
    });

    it('org_user é bloqueado em escrita geral mas pode marcar checklist', async () => {
      const bloqueado = await req(`/api/v1/projects/${PROJ}/risks`, {
        method: 'POST',
        headers: { ...orgUser, 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: 'A', threat: 'T', impact: 3, probability: 3 }),
      });
      expect(bloqueado.status).toBe(403);

      const permitido = await req(`/api/v1/projects/${PROJ}/checklist-progress`, {
        method: 'PUT',
        headers: { ...orgUser, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: 'p1_1', phase_number: 1, is_checked: 1 }),
      });
      expect(permitido.status).not.toBe(403);
    });

    it('assets: cria no próprio projeto, lista, e é bloqueado no alheio', async () => {
      const criar = await req(`/api/v1/projects/${PROJ}/assets`, {
        method: 'POST',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Database RDS', type: 'Software', category: 'Software', criticality: 'High', owner: 'DevOps', location: 'AWS' }),
      });
      expect(criar.status, await criar.clone().text()).toBe(201);

      const listar = await req(`/api/v1/projects/${PROJ}/assets`, { headers: orgAdmin });
      expect(listar.status).toBe(200);
      const lista = await listar.json() as any;
      const itens = Array.isArray(lista) ? lista : lista.assets || lista.results;
      expect(itens.some((a: any) => a.name === 'Database RDS')).toBe(true);

      expect((await req(`/api/v1/projects/${OUTRO}/assets`, { headers: orgAdmin })).status).toBe(403);
    });

    it('assets: PUT atualiza campos parciais e recusa asset de outro projeto ou inexistente', async () => {
      const criar = await req(`/api/v1/projects/${PROJ}/assets`, {
        method: 'POST',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Servidor de Arquivos', type: 'Hardware', category: 'Hardware', criticality: 'Medium', owner: 'TI' }),
      });
      const { id: assetId } = await criar.json() as any;

      const atualizar = await req(`/api/v1/projects/${PROJ}/assets/${assetId}`, {
        method: 'PUT',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ criticality: 'Critical', owner: 'Infraestrutura' }),
      });
      expect(atualizar.status, await atualizar.clone().text()).toBe(200);
      const atualizado = await env.DB.prepare('SELECT criticality, owner, name FROM assets WHERE id = ?').bind(assetId).first<any>();
      expect(atualizado.criticality).toBe('Critical');
      expect(atualizado.owner).toBe('Infraestrutura');
      // Campo não enviado permanece intacto — atualização é parcial.
      expect(atualizado.name).toBe('Servidor de Arquivos');

      // Ativo de outro projeto: mesmo asset id, mas na URL do projeto errado.
      const assetAlheioId = 'asset-alheio';
      await env.DB.prepare(
        `INSERT INTO assets (id, project_id, name, type, category, owner, criticality) VALUES (?,?,?,?,?,?,?)`
      ).bind(assetAlheioId, OUTRO, 'Ativo Alheio', 'Hardware', 'Hardware', 'Terceiros', 'Low').run();
      const cruzado = await req(`/api/v1/projects/${PROJ}/assets/${assetAlheioId}`, {
        method: 'PUT',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ criticality: 'Critical' }),
      });
      expect(cruzado.status).toBe(404);
      const intacto = await env.DB.prepare('SELECT criticality FROM assets WHERE id = ?').bind(assetAlheioId).first<any>();
      expect(intacto.criticality).toBe('Low');

      const inexistente = await req(`/api/v1/projects/${PROJ}/assets/nao-existe`, {
        method: 'PUT',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ criticality: 'Critical' }),
      });
      expect(inexistente.status).toBe(404);
    });

    it('assets: DELETE é soft delete (status Removido) e some da listagem', async () => {
      const criar = await req(`/api/v1/projects/${PROJ}/assets`, {
        method: 'POST',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Notebook Corporativo', type: 'Hardware', category: 'Hardware' }),
      });
      const { id: assetId } = await criar.json() as any;

      const remover = await req(`/api/v1/projects/${PROJ}/assets/${assetId}`, { method: 'DELETE', headers: orgAdmin });
      expect(remover.status, await remover.clone().text()).toBe(200);

      const linha = await env.DB.prepare('SELECT status FROM assets WHERE id = ?').bind(assetId).first<any>();
      expect(linha.status).toBe('Removido');

      const listar = await req(`/api/v1/projects/${PROJ}/assets`, { headers: orgAdmin });
      const lista = await listar.json() as any;
      const itens = Array.isArray(lista) ? lista : lista.assets || lista.results;
      expect(itens.some((a: any) => a.id === assetId)).toBe(false);

      // Ativo de outro projeto não pode ser removido pela URL do projeto do atacante.
      const assetOutroId = 'asset-outro-delete';
      await env.DB.prepare(
        `INSERT INTO assets (id, project_id, name, type, category) VALUES (?,?,?,?,?)`
      ).bind(assetOutroId, OUTRO, 'Ativo do Outro Tenant', 'Hardware', 'Hardware').run();
      const cruzado = await req(`/api/v1/projects/${PROJ}/assets/${assetOutroId}`, { method: 'DELETE', headers: orgAdmin });
      expect(cruzado.status).toBe(404);
      const aindaAtivo = await env.DB.prepare('SELECT status FROM assets WHERE id = ?').bind(assetOutroId).first<any>();
      expect(aindaAtivo.status).toBe('Active');
    });

    it('certificação: DELETE remove de verdade, loga auditoria, e 404 se já não existir ou for de outro projeto', async () => {
      const criar = await req(`/api/v1/projects/${PROJ}/certification`, {
        method: 'POST',
        headers: { ...orgAdmin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ standard: 'ISO 27001:2022', stage: 'Gap Assessment' }),
      });
      expect(criar.status, await criar.clone().text()).toBe(201);
      const { certification } = await criar.json() as any;
      const certId = certification.id as string;

      const remover = await req(`/api/v1/certification/${certId}`, { method: 'DELETE', headers: orgAdmin });
      expect(remover.status, await remover.clone().text()).toBe(200);

      const sumiu = await env.DB.prepare('SELECT id FROM certification_tracking WHERE id = ?').bind(certId).first();
      expect(sumiu).toBeNull();

      const log = await env.DB.prepare(
        "SELECT * FROM audit_logs WHERE action = 'certification.deleted' AND project_id = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(PROJ).first<any>();
      expect(log).not.toBeNull();

      // Repetir a remoção não encontra mais o registro. Usa papel de staff
      // (platform_admin) porque requireResourceAccess só chega ao 404 do
      // handler quando não é um org_admin/client barrado antes por não achar
      // project_id nenhum para comparar — mesmo comportamento do PUT.
      const denovo = await req(`/api/v1/certification/${certId}`, { method: 'DELETE', headers: admin });
      expect(denovo.status).toBe(404);

      // Registro de outro projeto: org_admin do PROJ não pode remover (IDOR).
      const certOutroId = 'cert-outro-tenant';
      await env.DB.prepare(
        `INSERT INTO certification_tracking (id, project_id, standard, stage) VALUES (?,?,?,?)`
      ).bind(certOutroId, OUTRO, 'ISO 27701:2019', 'Gap Assessment').run();
      const cruzado = await req(`/api/v1/certification/${certOutroId}`, { method: 'DELETE', headers: orgAdmin });
      expect(cruzado.status).toBe(403);
      const aindaExiste = await env.DB.prepare('SELECT id FROM certification_tracking WHERE id = ?').bind(certOutroId).first();
      expect(aindaExiste).not.toBeNull();
    });

    it('client acessa riscos do próprio projeto e é bloqueado no alheio', async () => {
      expect((await req(`/api/v1/projects/${PROJ}/risks`, { headers: client })).status).toBe(200);
      expect((await req(`/api/v1/projects/${OUTRO}/risks`, { headers: client })).status).toBe(403);
    });

    it('papel de staff alcança qualquer projeto', async () => {
      expect((await req(`/api/v1/projects/${OUTRO}/risks`, { headers: consultor })).status).toBe(200);
    });

    it('papel read-only não apaga nem aprova evidência, mas faz upload', async () => {
      expect((await req('/api/v1/evidence/ev-proprio', { method: 'DELETE', headers: orgUser })).status).toBe(403);

      const aprovar = await req('/api/v1/evidence/ev-proprio/approve', {
        method: 'POST', headers: { ...orgUser, 'Content-Type': 'application/json' }, body: '{}',
      });
      expect(aprovar.status).toBe(403);

      const fd = new FormData();
      fd.append('file', new File(['evidencia'], 'evidence.txt', { type: 'text/plain' }));
      const upload = await req(`/api/v1/projects/${PROJ}/evidence/upload`, { method: 'POST', headers: orgUser, body: fd });
      expect(upload.status, await upload.clone().text()).toBe(201);

      // A evidência não pode ter sido apagada pelo DELETE recusado.
      const ainda = await env.DB.prepare("SELECT id FROM evidence WHERE id='ev-proprio'").first<any>();
      expect(ainda).not.toBeNull();
    });

    it('chave de API válida autentica; inválida responde 401', async () => {
      const ok = await req(`/api/v1/projects/${PROJ}/risks`, { headers: { 'X-API-Key': CHAVE_LEITURA } });
      expect(ok.status).toBe(200);

      const ruim = await req(`/api/v1/projects/${PROJ}/risks`, { headers: { 'X-API-Key': 'chave-inexistente' } });
      expect(ruim.status).toBe(401);
    });

    it('chave de API não alcança projeto de outro cliente', async () => {
      expect((await req(`/api/v1/projects/${OUTRO}/risks`, { headers: { 'X-API-Key': CHAVE_LEITURA } })).status).toBe(403);
    });

    it('chave read não escreve; chave write escreve', async () => {
      const semPermissao = await req(`/api/v1/projects/${PROJ}/evidence/upload`, {
        method: 'POST', headers: { 'X-API-Key': CHAVE_LEITURA },
      });
      expect(semPermissao.status).toBe(403);

      const fd = new FormData();
      fd.append('file', new File(['x'], 'e.txt', { type: 'text/plain' }));
      const comPermissao = await req(`/api/v1/projects/${PROJ}/evidence/upload`, {
        method: 'POST', headers: { 'X-API-Key': CHAVE_ESCRITA }, body: fd,
      });
      expect(comPermissao.status, await comPermissao.clone().text()).toBe(201);
    });

    it('trilha de auditoria identifica a pessoa por trás da chave, não só o id', async () => {
      const fd = new FormData();
      fd.append('file', new File(['x'], 'auditoria.txt', { type: 'text/plain' }));
      const envio = await req(`/api/v1/projects/${PROJ}/evidence/upload`, {
        method: 'POST', headers: { 'X-API-Key': CHAVE_ESCRITA }, body: fd,
      });
      expect(envio.status, await envio.clone().text()).toBe(201);

      const log = await env.DB.prepare(
        "SELECT actor FROM audit_logs WHERE action = 'evidence.uploaded' ORDER BY created_at DESC"
      ).first<any>();
      // O nome da chave ('escrita', da fixture) é o que o auditor lê; o id fica
      // junto porque é ele que identifica a chave sem ambiguidade.
      expect(log.actor).toBe('apikey:key-rw (escrita)');

      // Mesma identidade na evidência, senão o `uploaded_by` contradiz o log.
      const ev = await env.DB.prepare(
        'SELECT uploaded_by FROM evidence WHERE file_name = ?'
      ).bind('auditoria.txt').first<any>();
      expect(ev.uploaded_by).toBe('apikey:key-rw (escrita)');
    });

    it('nome da chave não falsifica ator no log: prefixo vem antes, e quebra de linha some', async () => {
      await env.DB.prepare(
        `INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?,?,?,?,?,?)`
      ).bind('key-spoof', PROJ, await sha256Hex('chave-spoof'), 'admin@ness.io\nactor: admin@ness.io', 'write', 'Active').run();

      const fd = new FormData();
      fd.append('file', new File(['x'], 'spoof.txt', { type: 'text/plain' }));
      await req(`/api/v1/projects/${PROJ}/evidence/upload`, {
        method: 'POST', headers: { 'X-API-Key': 'chave-spoof' }, body: fd,
      });

      const log = await env.DB.prepare(
        "SELECT actor FROM audit_logs WHERE action = 'evidence.uploaded' ORDER BY created_at DESC"
      ).first<any>();
      expect(log.actor).toBe('apikey:key-spoof (admin@ness.io actor: admin@ness.io)');
      expect(log.actor.startsWith('apikey:')).toBe(true);
      expect(log.actor).not.toContain('\n');
    });

    it('chave sem projeto não autentica — senão enxergaria o portfólio inteiro', async () => {
      // Se uma chave assim passasse pela autenticação, viraria um `client` sem
      // `client_project_id`, e o filtro do portfólio (que só restringe quando
      // esse campo é truthy) devolveria os projetos de todos os tenants.
      //
      // A linha órfã deixou de ser inserível: `api_keys.project_id` virou NOT NULL
      // (migration 0021). O que continua precisando de cobertura é a guarda de
      // RUNTIME — ela é a última linha enquanto houver banco sem a migration
      // aplicada. Daí o D1 legado abaixo, que devolve a chave sem projeto.
      const dbLegado = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({
              id: 'key-sem-proj', project_id: null, name: 'orfa',
              permissions: 'read', status: 'Active', expires_at: null,
            }),
            run: async () => ({ success: true }),
            all: async () => ({ results: [] }),
          }),
        }),
      };

      const r = await req(
        '/api/v1/portfolio',
        { headers: { 'X-API-Key': 'chave-sem-projeto' } },
        testEnv({ DB: dbLegado })
      );
      expect(r.status).toBe(401);
    });

    it('chave revogada não autentica', async () => {
      await env.DB.prepare("UPDATE api_keys SET status='Revoked' WHERE id='key-ro'").run();
      expect((await req(`/api/v1/projects/${PROJ}/risks`, { headers: { 'X-API-Key': CHAVE_LEITURA } })).status).toBe(401);
    });

    it('rotas públicas por token dispensam sessão', async () => {
      // O token no caminho é a credencial; não há header de autenticação.
      expect((await req('/api/v1/auditor/tok123/notes')).status).toBe(200);
      expect((await req('/api/v1/assessments/public/tok456')).status).toBe(200);
    });

    it('auditor-notes interno continua exigindo sessão', async () => {
      expect((await req(`/api/v1/projects/${PROJ}/auditor-notes`)).status).toBe(401);
    });

    it('bloqueia acesso cross-project nos três estilos de montagem de rota', async () => {
      // As rotas com escopo de projeto são montadas de 3 formas e todas resolvem
      // para /api/v1/projects/<id>/... — o middleware precisa cobrir as três.
      const paths = [
        `/api/v1/projects/${OUTRO}/evidence`,           // A: sub-app em /projects/:projectId
        `/api/v1/projects/${OUTRO}/stakeholders`,       // B: montado em /api/v1
        `/api/v1/projects/${OUTRO}/webhooks`,           // C: montado em '' com path completo
        `/api/v1/projects/${OUTRO}/risks`,              // C
        `/api/v1/projects/${OUTRO}/export/audit-log`,   // C (export CSV)
      ];
      for (const p of paths) {
        const res = await req(p, { headers: client });
        expect(res.status, `${p} deveria negar acesso cross-project`).toBe(403);
      }
    });

    it('papel legado admin é mapeado para platform_admin', async () => {
      expect((await req('/api/v1/users', { headers: legacyAdmin })).status).toBe(200);
    });
  });

  describe('Escopo de leitura por papel', () => {
    it('client só enxerga o próprio projeto na listagem', async () => {
      const res = await req('/api/v1/projects', { headers: client });
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(PROJ);
    });

    it('client só enxerga os controles do próprio projeto', async () => {
      const res = await req('/api/v1/controls', { headers: client });
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data.length).toBeGreaterThan(0);
      expect(data.every(c => c.project_id === PROJ)).toBe(true);
    });

    it('client não vê detalhe de evidência de outro projeto', async () => {
      expect((await req('/api/v1/evidence/ev-alheio/detail', { headers: client })).status).toBe(403);
    });

    it('client não atualiza maturidade de controle de outro projeto', async () => {
      const res = await req('/api/v1/controls/ctrl-alheio/maturity', {
        method: 'PUT',
        headers: { ...client, 'Content-Type': 'application/json' },
        body: JSON.stringify({ maturity: 3 }),
      });
      expect(res.status).toBe(403);

      const ctrl = await env.DB.prepare("SELECT maturity FROM compliance_controls WHERE id='ctrl-alheio'").first<any>();
      expect(ctrl.maturity).toBe(0);
    });

    it('client não acessa o dashboard global da plataforma', async () => {
      expect((await req('/api/v1/dashboard', { headers: client })).status).toBe(403);
    });
  });

  describe('Recuperação de senha', () => {
    it('gera token de recuperação e o guarda no KV', async () => {
      const res = await req('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }, testEnv({ ENVIRONMENT: 'development' }));

      const data = await res.json() as any;
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.reset_token).toBeTruthy();

      // O token existe no KV de verdade, sob a chave que o reset espera.
      const guardado = await env.SESSIONS.get(`reset_token:${data.reset_token}`);
      expect(guardado).not.toBeNull();
      expect(JSON.parse(guardado!).email).toBe('test@example.com');
    });

    it('redefine a senha com token válido, invalida o token e grava o novo hash', async () => {
      // Fluxo inteiro no mesmo teste: o storage é isolado por teste, então um
      // token criado noutro `it` não existiria aqui.
      const pedido = await req('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }, testEnv({ ENVIRONMENT: 'development' }));
      const { reset_token } = await pedido.json() as any;

      const antes = await env.DB.prepare("SELECT password_hash FROM users WHERE email='test@example.com'").first<any>();

      const res = await req('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: reset_token, newPassword: 'novaSenha123' }),
      });
      expect(res.status).toBe(200);
      expect((await res.json() as any).ok).toBe(true);

      const depois = await env.DB.prepare("SELECT password_hash FROM users WHERE email='test@example.com'").first<any>();
      expect(depois.password_hash).not.toBe(antes.password_hash);

      // Token de uso único: precisa sumir do KV.
      expect(await env.SESSIONS.get(`reset_token:${reset_token}`)).toBeNull();
    });

    it('token inválido não redefine senha', async () => {
      const res = await req('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'nao-existe', newPassword: 'qualquer123' }),
      });
      expect(res.status).not.toBe(200);
    });
  });

  describe('Templates de política', () => {
    it('lista os templates que estão no banco', async () => {
      const res = await req('/api/v1/policy-templates', { headers: admin });
      const data = await res.json() as any;
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.templates.some((t: any) => t.id === 'isp')).toBe(true);
    });

    it('marketplace enriquece os templates do banco', async () => {
      const res = await req('/api/v1/marketplace/templates', { headers: admin });
      const data = await res.json() as any;
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.templates[0]).toHaveProperty('popularity');
    });
  });

  describe('Portal público de políticas (OTP)', () => {
    it('gera OTP e guarda no KV com expiração', async () => {
      const res = await req('/api/v1/public/policies/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: PROJ, name: 'Maria Silva', email: 'maria@empresa.com' }),
      });
      const data = await res.json() as any;
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.demo_otp).toBeTruthy();

      const guardado = await env.SESSIONS.get(`otp_${PROJ}_maria@empresa.com`);
      expect(guardado).not.toBeNull();
      expect(JSON.parse(guardado!).otp).toBe(data.demo_otp);
    });

    it('verifica o OTP, devolve token e consome o código', async () => {
      const pedido = await req('/api/v1/public/policies/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: PROJ, name: 'Maria Silva', email: 'maria@empresa.com' }),
      });
      const { demo_otp } = await pedido.json() as any;

      const res = await req('/api/v1/public/policies/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: PROJ, email: 'maria@empresa.com', otp: demo_otp }),
      });
      const data = await res.json() as any;
      expect(res.status).toBe(200);
      expect(data.token).toBeTruthy();

      // OTP é de uso único.
      expect(await env.SESSIONS.get(`otp_${PROJ}_maria@empresa.com`)).toBeNull();
    });

    it('OTP errado não concede token', async () => {
      await req('/api/v1/public/policies/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: PROJ, name: 'Maria Silva', email: 'maria@empresa.com' }),
      });

      const res = await req('/api/v1/public/policies/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: PROJ, email: 'maria@empresa.com', otp: '000000' }),
      });
      expect(res.status).not.toBe(200);
    });
  });
});
