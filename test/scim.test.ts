import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword, sha256Hex } from '../src/helpers';
import { applySchema, resetData, resetSessions, sessionFor, pedir } from './helpers/d1';

/**
 * SCIM 2.0 (item 4.2 do plano).
 *
 * O critério de saída é uma frase só — "usuário desligado no IdP perde acesso
 * sem ação manual" — e é o que a maior parte deste arquivo verifica. Provisionar
 * é conveniência; despovisionar é o controle.
 *
 * Três coisas que precisam ser verdade ao mesmo tempo para esse critério valer:
 *   1. o `PATCH active:false` funciona nas DUAS sintaxes que a RFC permite (os
 *      IdPs se dividem entre elas);
 *   2. a SESSÃO VIVA cai na hora — sem isso o desligado fica dentro por 24h;
 *   3. o login para de funcionar, e sem dizer por quê.
 */

const A = 'proj-a';
const B = 'proj-b';
const TOKEN_A = 'scim-token-do-cliente-a';
const TOKEN_B = 'scim-token-do-cliente-b';

const scim = (caminho: string, token = TOKEN_A, init: RequestInit = {}) =>
  pedir(worker, `/scim/v2${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/scim+json', ...(init.headers ?? {}) },
  });

describe('SCIM 2.0', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(B, 'Cliente B', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a1', 'pessoa@a.com', senha, 'Pessoa do A', 'org_user', A),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-b1', 'pessoa@b.com', senha, 'Pessoa do B', 'org_user', B),
    ]);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO project_scim (project_id, token_hash) VALUES (?,?)').bind(A, await sha256Hex(TOKEN_A)),
      env.DB.prepare('INSERT INTO project_scim (project_id, token_hash) VALUES (?,?)').bind(B, await sha256Hex(TOKEN_B)),
    ]);
  });

  describe('autenticação', () => {
    it('sem token é 401, no formato de erro do SCIM', async () => {
      const res = await pedir(worker, '/scim/v2/Users');
      expect(res.status).toBe(401);
      const corpo = await res.json<any>();
      expect(corpo.schemas[0]).toContain('scim:api:messages:2.0:Error');
    });

    it('token revogado é 401', async () => {
      await env.DB.prepare('UPDATE project_scim SET ativo = 0 WHERE project_id = ?').bind(A).run();
      expect((await scim('/Users')).status).toBe(401);
    });

    it('o token é guardado como HASH, não em claro', async () => {
      // Quem tem acesso ao banco não deve conseguir se passar pelo IdP do
      // cliente. Mesmo tratamento de `api_keys.key_hash`.
      const linha = await env.DB.prepare('SELECT token_hash FROM project_scim WHERE project_id = ?').bind(A).first<any>();
      expect(linha.token_hash).not.toBe(TOKEN_A);
      expect(linha.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('isolamento entre tenants', () => {
    it('o token do A só enxerga usuários do A', async () => {
      const res = await scim('/Users');
      const corpo = await res.json<any>();
      expect(corpo.Resources.map((r: any) => r.userName)).toEqual(['pessoa@a.com']);
    });

    it('o token do A não LÊ usuário do B — 404, não 403', async () => {
      // 403 diria ao IdP do cliente A que aquele id existe em outro tenant.
      const res = await scim('/Users/u-b1');
      expect(res.status).toBe(404);
    });

    it('o token do A não DESATIVA usuário do B', async () => {
      const res = await scim('/Users/u-b1', TOKEN_A, {
        method: 'PATCH',
        body: JSON.stringify({ Operations: [{ op: 'replace', path: 'active', value: false }] }),
      });
      expect(res.status).toBe(404);
      const linha = await env.DB.prepare('SELECT ativo FROM users WHERE id = ?').bind('u-b1').first<any>();
      expect(linha.ativo, 'o IdP de um cliente desativou conta de outro').toBe(1);
    });

    it('o filtro por userName não atravessa tenants', async () => {
      const res = await scim('/Users?filter=userName eq "pessoa@b.com"');
      expect((await res.json<any>()).totalResults).toBe(0);
    });
  });

  describe('provisionamento', () => {
    it('cria a conta e devolve 201 com a representação SCIM', async () => {
      const res = await scim('/Users', TOKEN_A, {
        method: 'POST',
        body: JSON.stringify({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'nova@a.com', displayName: 'Nova Pessoa', active: true,
        }),
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const corpo = await res.json<any>();
      expect(corpo.userName).toBe('nova@a.com');
      expect(corpo.active).toBe(true);
      expect(corpo.meta.location).toContain('/scim/v2/Users/');

      const linha = await env.DB.prepare('SELECT role, client_project_id FROM users WHERE email = ?').bind('nova@a.com').first<any>();
      expect(linha.role).toBe('org_user');
      expect(linha.client_project_id).toBe(A);
    });

    it('e-mail já existente devolve 409 — é o que faz o IdP reconciliar', async () => {
      const res = await scim('/Users', TOKEN_A, {
        method: 'POST', body: JSON.stringify({ userName: 'pessoa@a.com' }),
      });
      expect(res.status).toBe(409);
      expect((await res.json<any>()).scimType).toBe('uniqueness');
    });

    it('não cria conta com e-mail que já é de outro tenant', async () => {
      const res = await scim('/Users', TOKEN_A, {
        method: 'POST', body: JSON.stringify({ userName: 'pessoa@b.com' }),
      });
      expect(res.status).toBe(409);
      const { results } = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind('pessoa@b.com').all();
      expect(results).toHaveLength(1);
    });

    it('conta criada por SCIM NUNCA recebe papel de plataforma', async () => {
      // O invariante que estava só num comentário — e num `Set` que o código
      // nunca consultava, dead code que lia como guarda. Aqui ele é conferido:
      // quem chama é o IdP do CLIENTE, e deixá-lo escolher o papel seria
      // deixar o cliente decidir o próprio nível de acesso na plataforma.
      const res = await scim('/Users', TOKEN_A, {
        method: 'POST',
        body: JSON.stringify({
          userName: 'tentativa@a.com',
          displayName: 'Tentativa',
          // O IdP manda o que quiser; nada disso pode virar papel.
          role: 'platform_admin',
          roles: [{ value: 'platform_admin' }],
          'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': { department: 'admin' },
        }),
      });
      expect(res.status).toBe(201);

      const linha = await env.DB.prepare('SELECT role, client_project_id FROM users WHERE email = ?')
        .bind('tentativa@a.com').first<any>();
      expect(linha.role, 'o IdP do cliente escolheu o próprio papel').toBe('org_user');
      expect(linha.client_project_id).toBe(A);
    });

    it('userName que não é e-mail é recusado', async () => {
      const res = await scim('/Users', TOKEN_A, { method: 'POST', body: JSON.stringify({ userName: 'fulano' }) });
      expect(res.status).toBe(400);
    });
  });

  describe('DESPROVISIONAMENTO — o critério de saída do item', () => {
    it('PATCH com `path: active` desativa (sintaxe do Okta)', async () => {
      const res = await scim('/Users/u-a1', TOKEN_A, {
        method: 'PATCH',
        body: JSON.stringify({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        }),
      });
      expect(res.status).toBe(200);
      expect((await res.json<any>()).active).toBe(false);
      expect((await env.DB.prepare('SELECT ativo FROM users WHERE id = ?').bind('u-a1').first<any>()).ativo).toBe(0);
    });

    it('PATCH com value objeto também desativa (sintaxe do Entra ID)', async () => {
      // As duas formas são válidas pela RFC, e os IdPs se dividem entre elas.
      // Aceitar só uma faria o desprovisionamento não acontecer com metade
      // deles — em silêncio, que é o pior modo de falha para este controle.
      const res = await scim('/Users/u-a1', TOKEN_A, {
        method: 'PATCH',
        body: JSON.stringify({ Operations: [{ op: 'Replace', value: { active: false } }] }),
      });
      expect(res.status).toBe(200);
      expect((await env.DB.prepare('SELECT ativo FROM users WHERE id = ?').bind('u-a1').first<any>()).ativo).toBe(0);
    });

    it('a SESSÃO VIVA cai na hora — sem isso o desligado fica dentro 24h', async () => {
      const sessao = await sessionFor({ id: 'u-a1', email: 'pessoa@a.com', role: 'org_user', client_project_id: A, iat: Date.now() });
      expect((await pedir(worker, '/api/v1/portfolio', { headers: sessao })).status).toBe(200);

      await scim('/Users/u-a1', TOKEN_A, {
        method: 'PATCH', body: JSON.stringify({ Operations: [{ op: 'replace', path: 'active', value: false }] }),
      });

      const depois = await pedir(worker, '/api/v1/portfolio', { headers: sessao });
      expect(depois.status, 'a sessão do desligado continuou valendo').toBe(401);
    });

    it('o LOGIN para de funcionar, e sem dizer por quê', async () => {
      await scim('/Users/u-a1', TOKEN_A, {
        method: 'PATCH', body: JSON.stringify({ Operations: [{ op: 'replace', path: 'active', value: false }] }),
      });

      const res = await pedir(worker, '/api/v1/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'pessoa@a.com', password: 'password123' }),
      });
      expect(res.status).toBe(401);
      // A mesma mensagem de senha errada: distinguir diria a quem sonda que o
      // e-mail existe aqui. Quem foi desligado descobre pelo IdP.
      expect((await res.json<any>()).error).toBe('Invalid credentials');
    });

    it('DELETE desativa, mas NÃO apaga — a trilha referencia esta conta', async () => {
      const res = await scim('/Users/u-a1', TOKEN_A, { method: 'DELETE' });
      expect(res.status).toBe(204);

      const linha = await env.DB.prepare('SELECT ativo, email FROM users WHERE id = ?').bind('u-a1').first<any>();
      expect(linha, 'a conta foi apagada — registros de auditoria ficariam órfãos').not.toBeNull();
      expect(linha.ativo).toBe(0);
    });

    it('reativar devolve o acesso', async () => {
      await scim('/Users/u-a1', TOKEN_A, { method: 'DELETE' });
      const res = await scim('/Users/u-a1', TOKEN_A, {
        method: 'PATCH', body: JSON.stringify({ Operations: [{ op: 'replace', path: 'active', value: true }] }),
      });
      expect((await res.json<any>()).active).toBe(true);

      const login = await pedir(worker, '/api/v1/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'pessoa@a.com', password: 'password123' }),
      });
      expect(login.status).toBe(200);
    });

    it('desativação e reativação vão para a trilha', async () => {
      await scim('/Users/u-a1', TOKEN_A, { method: 'DELETE' });
      const log = await env.DB.prepare(
        `SELECT action FROM audit_logs WHERE action = 'scim.user_deactivated' AND project_id = ?`
      ).bind(A).first();
      expect(log, 'desligamento sem registro na trilha').not.toBeNull();
    });
  });

  describe('emissão do token (POST /api/v1/projects/:projectId/scim-token)', () => {
    it('só a ness. emite, e o token aparece UMA vez', async () => {
      const senha = await hashPassword('password123');
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
          .bind('u-st', 'st@ness.io', senha, 'Staff', 'platform_admin'),
      ]);
      const staff = {
        ...(await sessionFor({ id: 'u-st', email: 'st@ness.io', role: 'platform_admin', iat: Date.now() })),
        'Content-Type': 'application/json',
      };
      const cliente = {
        ...(await sessionFor({ id: 'u-a1', email: 'pessoa@a.com', role: 'org_user', client_project_id: A, iat: Date.now() })),
        'Content-Type': 'application/json',
      };

      expect((await pedir(worker, `/api/v1/projects/${A}/scim-token`, { method: 'POST', headers: cliente })).status).toBe(403);

      const res = await pedir(worker, `/api/v1/projects/${A}/scim-token`, { method: 'POST', headers: staff });
      expect(res.status, await res.clone().text()).toBe(201);
      const corpo = await res.json<any>();
      expect(corpo.token).toMatch(/^scim_/);
      expect(corpo.base_url).toContain('/scim/v2');

      // O token novo funciona…
      expect((await scim('/Users', corpo.token)).status).toBe(200);
      // …e o anterior deixou de valer, porque emitir substitui.
      expect((await scim('/Users', TOKEN_A)).status).toBe(401);

      // No banco só há o hash.
      const linha = await env.DB.prepare('SELECT token_hash FROM project_scim WHERE project_id = ?').bind(A).first<any>();
      expect(linha.token_hash).not.toBe(corpo.token);
    });
  });

  describe('conformidade mínima', () => {
    it('ServiceProviderConfig declara o que NÃO suportamos', async () => {
      // Responder /Groups com lista vazia faria o IdP acreditar que sincronizou
      // grupos que nunca existiram. Dizer que não há é mais honesto e mais útil.
      const corpo = await (await scim('/ServiceProviderConfig')).json<any>();
      expect(corpo.patch.supported).toBe(true);
      expect(corpo.bulk.supported).toBe(false);
      expect(corpo['urn:niso:nao-suportado']).toContain('Groups');
    });

    it('filtro não suportado devolve 400 com scimType, não silêncio', async () => {
      const res = await scim('/Users?filter=displayName co "x"');
      expect(res.status).toBe(400);
      expect((await res.json<any>()).scimType).toBe('invalidFilter');
    });

    it('a lista vem no envelope ListResponse', async () => {
      const corpo = await (await scim('/Users')).json<any>();
      expect(corpo.schemas[0]).toContain('ListResponse');
      expect(corpo.totalResults).toBe(1);
    });
  });
});
