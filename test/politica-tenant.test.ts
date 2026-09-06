import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions, sessionFor, pedir } from './helpers/d1';
import { ipPermitido, avaliarPolitica } from '../src/politica-tenant';

/**
 * Política de segurança por tenant (item 4.3 do plano).
 *
 * Metade deste arquivo testa a política funcionando. A outra metade — a que
 * importa mais — testa os jeitos de TRANCAR GENTE PARA FORA, porque é assim que
 * um controle de segurança causa dano: não deixando o atacante entrar, mas
 * impedindo o dono de voltar.
 *
 * Os três caminhos de saída que precisam continuar abertos:
 *   1. conta de staff nunca é alcançada pela política de um tenant;
 *   2. MFA obrigatório não bloqueia o caminho de CONFIGURAR o MFA;
 *   3. allowlist malformada é recusada na escrita, não descoberta no acesso.
 */

const A = 'proj-a';

async function politica(campos: Partial<{ mfa: number; ttl: number | null; ips: string | null }>) {
  await env.DB.prepare(
    `INSERT INTO project_security_policy (project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist)
     VALUES (?,?,?,?)
     ON CONFLICT(project_id) DO UPDATE SET
       mfa_obrigatorio = excluded.mfa_obrigatorio,
       sessao_ttl_seg = excluded.sessao_ttl_seg,
       ip_allowlist = excluded.ip_allowlist`
  ).bind(A, campos.mfa ?? 0, campos.ttl ?? null, campos.ips ?? null).run();
}

describe('ipPermitido', () => {
  it('lista vazia não restringe nada', () => {
    expect(ipPermitido('203.0.113.7', null)).toBe(true);
    expect(ipPermitido(null, '')).toBe(true);
  });

  it('casa IP exato e prefixo CIDR', () => {
    expect(ipPermitido('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(ipPermitido('203.0.113.7', '203.0.113.0/24')).toBe(true);
    expect(ipPermitido('203.0.114.7', '203.0.113.0/24')).toBe(false);
    expect(ipPermitido('10.1.2.3', '10.0.0.0/8, 192.168.0.0/16')).toBe(true);
  });

  it('/0 aceita tudo — e não o contrário', () => {
    // Em JS `x << 32` é `x << 0`. Sem o caso especial, /0 viraria máscara cheia
    // e a allowlist mais permissiva possível passaria a negar todo mundo.
    expect(ipPermitido('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('/32 casa só o endereço exato', () => {
    expect(ipPermitido('203.0.113.7', '203.0.113.7/32')).toBe(true);
    expect(ipPermitido('203.0.113.8', '203.0.113.7/32')).toBe(false);
  });

  it('sem IP conhecido, com lista preenchida, NEGA', () => {
    // Allowlist é lista de permissões: não saber a origem não pode virar
    // permissão. É a diferença entre falhar fechado e falhar aberto.
    expect(ipPermitido(null, '203.0.113.0/24')).toBe(false);
  });

  it('entrada malformada ou IPv6 não casa — allowlist não aceita o que não entende', () => {
    expect(ipPermitido('203.0.113.7', 'nao-e-ip')).toBe(false);
    expect(ipPermitido('203.0.113.7', '2001:db8::/32')).toBe(false);
    expect(ipPermitido('203.0.113.7', '999.0.0.1')).toBe(false);
    expect(ipPermitido('203.0.113.7', '203.0.113.0/99')).toBe(false);
  });
});

describe('avaliarPolitica', () => {
  const base = { caminho: '/api/v1/portfolio', ip: '203.0.113.7', totpAtivo: false, iat: Date.now() };

  it('sem política, nada é recusado', () => {
    expect(avaliarPolitica({ ...base, politica: null })).toBeNull();
  });

  it('origem vem antes do resto — quem está fora da rede não descobre o próximo obstáculo', () => {
    const r = avaliarPolitica({
      ...base,
      ip: '198.51.100.1',
      politica: { project_id: A, mfa_obrigatorio: 1, sessao_ttl_seg: 1, ip_allowlist: '203.0.113.0/24' },
    });
    expect(r?.status).toBe(403);
    expect(r?.erro).toContain('origem');
  });

  it('sessão mais velha que o TTL do cliente expira', () => {
    const r = avaliarPolitica({
      ...base,
      iat: Date.now() - 4000 * 1000,
      politica: { project_id: A, mfa_obrigatorio: 0, sessao_ttl_seg: 3600, ip_allowlist: null },
    });
    expect(r?.status).toBe(401);
    expect(r?.erro).toContain('expirada');
  });

  it('MFA obrigatório NÃO bloqueia o caminho de configurar o MFA', () => {
    // Sem esta exceção a exigência se autoinviabiliza: ninguém consegue
    // cadastrar o fator que a política passou a exigir.
    const pol = { project_id: A, mfa_obrigatorio: 1, sessao_ttl_seg: null, ip_allowlist: null };
    for (const caminho of ['/api/v1/auth/mfa/setup', '/api/v1/auth/mfa/activate', '/api/v1/auth/me', '/api/v1/auth/logout']) {
      expect(avaliarPolitica({ ...base, caminho, politica: pol }), caminho).toBeNull();
    }
    expect(avaliarPolitica({ ...base, caminho: '/api/v1/portfolio', politica: pol })?.status).toBe(401);
  });

  it('com o fator já ativo, a exigência não atrapalha', () => {
    const r = avaliarPolitica({
      ...base,
      totpAtivo: true,
      politica: { project_id: A, mfa_obrigatorio: 1, sessao_ttl_seg: null, ip_allowlist: null },
    });
    expect(r).toBeNull();
  });
});

describe('Política aplicada na requisição', () => {
  let cliente: Record<string, string>;
  let staff: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'a@x.com', senha, 'A', 'org_admin', A),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
        .bind('u-s', 's@ness.io', senha, 'Staff', 'platform_admin'),
    ]);
    cliente = {
      ...(await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: A, iat: Date.now() })),
      'Content-Type': 'application/json',
    };
    staff = {
      ...(await sessionFor({ id: 'u-s', email: 's@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  it('sem política, o cliente entra como sempre', async () => {
    expect((await pedir(worker, '/api/v1/portfolio', { headers: cliente })).status).toBe(200);
  });

  it('MFA obrigatório barra quem não tem o fator, e diz como resolver', async () => {
    await politica({ mfa: 1 });
    const res = await pedir(worker, '/api/v1/portfolio', { headers: cliente });
    expect(res.status).toBe(401);
    const corpo = await res.json<any>();
    expect(corpo.mfa_setup_required).toBe(true);
    expect(corpo.error).toContain('mfa/setup');
  });

  it('quem JÁ tem o fator passa — e o estado vem do banco, não da sessão', async () => {
    // A sessão foi gravada antes de a política existir. Se a checagem lesse dela,
    // ninguém sairia da exigência sem deslogar.
    await politica({ mfa: 1 });
    await env.DB.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').bind('u-a').run();
    expect((await pedir(worker, '/api/v1/portfolio', { headers: cliente })).status).toBe(200);
  });

  it('a política do cliente NÃO alcança conta de staff', async () => {
    // O caminho de conserto de uma política mal configurada passa por aqui.
    await politica({ mfa: 1, ips: '203.0.113.0/24' });
    expect((await pedir(worker, '/api/v1/portfolio', { headers: staff })).status).toBe(200);
  });

  it('allowlist barra origem de fora e libera a de dentro', async () => {
    await politica({ ips: '203.0.113.0/24' });

    const fora = await pedir(worker, '/api/v1/portfolio', {
      headers: { ...cliente, 'CF-Connecting-IP': '198.51.100.1' },
    });
    expect(fora.status).toBe(403);

    const dentro = await pedir(worker, '/api/v1/portfolio', {
      headers: { ...cliente, 'CF-Connecting-IP': '203.0.113.42' },
    });
    expect(dentro.status).toBe(200);
  });
});

describe('PUT /api/v1/projects/:projectId/security-policy', () => {
  let cliente: Record<string, string>;
  let staff: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'a@x.com', senha, 'A', 'org_admin', A),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
        .bind('u-s', 's@ness.io', senha, 'Staff', 'platform_admin'),
    ]);
    cliente = {
      ...(await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: A, iat: Date.now() })),
      'Content-Type': 'application/json',
    };
    staff = {
      ...(await sessionFor({ id: 'u-s', email: 's@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  it('recusa allowlist malformada NA ESCRITA, não no acesso', async () => {
    // Uma lista que não casa com nada tranca o cliente inteiro, e o conserto
    // exige justamente o acesso que ela nega. Recusar aqui é muito mais barato.
    const res = await pedir(worker, `/api/v1/projects/${A}/security-policy`, {
      method: 'PUT', headers: staff,
      body: JSON.stringify({ ip_allowlist: '203.0.113.0/24, escritorio-do-cliente' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<any>()).error).toContain('escritorio-do-cliente');
    expect(await env.DB.prepare('SELECT project_id FROM project_security_policy').first()).toBeNull();
  });

  it('recusa TTL absurdamente curto — o conserto passa por uma sessão', async () => {
    const res = await pedir(worker, `/api/v1/projects/${A}/security-policy`, {
      method: 'PUT', headers: staff, body: JSON.stringify({ sessao_ttl_seg: 5 }),
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('300');
  });

  it('cliente LÊ a própria política, mas não escreve', async () => {
    const leitura = await pedir(worker, `/api/v1/projects/${A}/security-policy`, { headers: cliente });
    expect(leitura.status).toBe(200);
    expect((await leitura.json<any>()).politica.padrao_da_plataforma).toBe(true);

    const escrita = await pedir(worker, `/api/v1/projects/${A}/security-policy`, {
      method: 'PUT', headers: cliente, body: JSON.stringify({ mfa_obrigatorio: false }),
    });
    expect(escrita.status, 'cliente desligou a própria exigência de MFA').toBe(403);
  });

  it('staff grava, e a gravação vai para a trilha', async () => {
    const res = await pedir(worker, `/api/v1/projects/${A}/security-policy`, {
      method: 'PUT', headers: staff,
      body: JSON.stringify({ mfa_obrigatorio: true, sessao_ttl_seg: 3600, ip_allowlist: '203.0.113.0/24' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    const p = await env.DB.prepare('SELECT * FROM project_security_policy WHERE project_id = ?').bind(A).first<any>();
    expect(p.mfa_obrigatorio).toBe(1);
    expect(p.sessao_ttl_seg).toBe(3600);
    expect(p.updated_by).toBe('s@ness.io');

    const log = await env.DB.prepare(
      `SELECT action FROM audit_logs WHERE action = 'project.security_policy_updated' AND project_id = ?`
    ).bind(A).first();
    expect(log, 'mudança de política de segurança sem registro na trilha').not.toBeNull();
  });

  it('cliente não lê a política do vizinho', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active').run();
    const res = await pedir(worker, '/api/v1/projects/proj-b/security-policy', { headers: cliente });
    expect(res.status).toBe(403);
  });
});
