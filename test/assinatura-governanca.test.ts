import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Quem pode assinar o ROPA como Líder SGSI e como Direção Executiva.
 *
 * A regra saía de dois e-mails fixos no código (`resper@bekaa.eu`): um
 * PROIBIA aquela pessoa de assinar como Direção, o outro a ISENTAVA da
 * checagem de cargo do CISO. Os dois afirmavam a mesma coisa — "esta pessoa é
 * o Líder SGSI" — que é justamente o que `project_governance` registra.
 *
 * Estes testes fixam a regra pelo DADO. O último deles é o que prova que a
 * identidade fixa sumiu: o mesmo e-mail que antes tinha tratamento especial
 * passa a ser tratado pelo cargo, como qualquer outro.
 */
const PROJ = 'proj-gov';

function testEnv() {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) } } as any;
}

async function aprovar(headers: Record<string, string>, role: 'ciso' | 'ceo') {
  return worker.fetch(
    new Request(`http://localhost/api/v1/projects/${PROJ}/ropa/rec-1/approve`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),
    testEnv()
  );
}

describe('Assinatura do ROPA sai da matriz de governança, não de e-mail fixo', () => {
  let liderSgsi: Record<string, string>;
  let direcao: Record<string, string>;
  let semCargo: Record<string, string>;
  let emailOutrora: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(PROJ, 'Cliente Gov', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?,?,?)`)
        .bind('rec-1', PROJ, 'Cadastro de clientes'),

      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-sgsi', 'sgsi@cliente.com', 'x', 'Lider SGSI', 'org_admin', PROJ),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-ceo', 'ceo@cliente.com', 'x', 'Direcao', 'org_admin', PROJ),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-outro', 'analista@cliente.com', 'x', 'Analista', 'org_admin', PROJ),
      // Mesmo endereço que antes era privilegiado no código — aqui SEM cargo de
      // SGSI na matriz. Se o tratamento especial ainda existisse, ele assinaria
      // como ciso mesmo assim.
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-antigo', 'resper@bekaa.eu', 'x', 'Antigo Privilegiado', 'org_admin', PROJ),

      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?,?,?,?,?,?)`)
        .bind('g-sgsi', PROJ, 'Lider SGSI', 'sgsi@cliente.com', 'tech', 'Líder do SGSI'),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?,?,?,?,?,?)`)
        .bind('g-ceo', PROJ, 'Direcao', 'ceo@cliente.com', 'exec', 'Diretor Executivo'),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?,?,?,?,?,?)`)
        .bind('g-outro', PROJ, 'Analista', 'analista@cliente.com', 'tech', 'Analista de Suporte'),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?,?,?,?,?,?)`)
        .bind('g-antigo', PROJ, 'Antigo Privilegiado', 'resper@bekaa.eu', 'tech', 'Analista de Suporte'),
    ]);

    liderSgsi = await sessionFor({ id: 'u-sgsi', email: 'sgsi@cliente.com', role: 'org_admin', client_project_id: PROJ });
    direcao = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', role: 'org_admin', client_project_id: PROJ });
    semCargo = await sessionFor({ id: 'u-outro', email: 'analista@cliente.com', role: 'org_admin', client_project_id: PROJ });
    emailOutrora = await sessionFor({ id: 'u-antigo', email: 'resper@bekaa.eu', role: 'org_admin', client_project_id: PROJ });
  });

  it('o Líder SGSI designado assina como ciso', async () => {
    const r = await aprovar(liderSgsi, 'ciso');
    expect(r.status, await r.clone().text()).toBe(200);
  });

  it('a Direção designada assina como ceo', async () => {
    const r = await aprovar(direcao, 'ceo');
    expect(r.status, await r.clone().text()).toBe(200);
  });

  it('segregação de funções: o Líder SGSI NÃO assina como Direção', async () => {
    const r = await aprovar(liderSgsi, 'ceo');
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('Segregação de Funções');
  });

  it('quem não tem o cargo não assina como ciso', async () => {
    const r = await aprovar(semCargo, 'ciso');
    expect(r.status).toBe(403);
  });

  it('quem não tem o cargo não assina como ceo', async () => {
    const r = await aprovar(semCargo, 'ceo');
    expect(r.status).toBe(403);
  });

  it('o e-mail antes privilegiado no código não tem mais tratamento especial', async () => {
    // Cargo "Analista de Suporte" na matriz: mesmo desfecho do analista comum.
    // Enquanto a isenção existia, esta chamada respondia 200.
    const r = await aprovar(emailOutrora, 'ciso');
    expect(r.status).toBe(403);
  });
});
