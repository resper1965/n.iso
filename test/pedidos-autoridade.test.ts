import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, autoridadeDeAssinatura } from '../src/helpers';
import { podePedir, autoridadeNoPedido, criarPedido } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Fatia 4 do acesso de stakeholders: quem PEDE e quem APROVA. Uma regra só para pedir (todas as
 * rotas de pedido do projeto) e uma só para a autoridade do pedido, por papel exigido, por cima de
 * `autoridadeDeAssinatura`/`recusaDeAssinatura`. Falha fechado: sem linha na matriz, sem aprovação.
 */
const SENHA = 'Senha-forte-123!';
const P = 'au-proj';
const P2 = 'au-proj2';
const DPIA = 'au-dpia';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

const S: Record<string, Record<string, string>> = {};
const U: Record<string, any> = {};

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  const usuarios: [string, string, string, string, string | null][] = [
    // id, email, nome, papel, client_project_id
    ['a-cons', 'cons@ness.lat', 'Cons', 'consultor', null],
    ['a-cons2', 'cons2@ness.lat', 'Cons2', 'consultor', null],
    ['a-cadm', 'cadm@ness.lat', 'Cadm', 'consultoria_admin', null],
    ['a-com', 'com@ness.lat', 'Com', 'comercial', null],
    ['a-adm', 'adm@ness.lat', 'Adm', 'platform_admin', null],
    ['a-oa', 'dono@cliente.com', 'Dono', 'org_admin', P],
    ['a-dpo', 'dpo@cliente.com', 'Dora', 'stakeholder', P],
    ['a-ceo', 'ceo@cliente.com', 'Caio', 'stakeholder', P],
    ['a-lider', 'lider@cliente.com', 'Lia', 'stakeholder', P],
    ['a-sem', 'sem@cliente.com', 'Sem Matriz', 'stakeholder', P],
    ['a-ana', 'ana@cliente.com', 'Ana', 'stakeholder', P],
    ['a-multi', 'multi@cliente.com', 'Multi', 'stakeholder', P],
    ['a-gerente', 'gerente@cliente.com', 'Gil', 'stakeholder', P],
    ['a-lc', 'lc@cliente.com', 'Lucas', 'stakeholder', P],
  ];
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outro', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P2),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES (?, ?, 'Folha', 'Under Review')`).bind(DPIA, P),
    ...usuarios.map(([id, email, nome, papel, proj]) =>
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES (?, ?, ?, ?, ?, ?, 'org_ness')`)
        .bind(id, email, senha, nome, papel, proj)),
    // A ordem importa: a linha de consultor do "multi" vem ANTES da de DPO.
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('ag-cons', ?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('ag-cons2', ?2, 'Cons2', 'cons2@ness.lat', 'consultor', 'Consultor'),
      ('ag-dpo', ?1, 'Dora DPO', 'dpo@cliente.com', 'executivo', 'DPO'),
      ('ag-ceo', ?1, 'Caio CEO', 'ceo@cliente.com', 'executivo', 'CEO'),
      ('ag-lider', ?1, 'Lia', 'lider@cliente.com', 'executivo', 'Líder SGSI e Diretora'),
      ('ag-ana', ?1, 'Ana', ' Ana@Cliente.com ', 'executivo', 'DPO'),
      ('ag-multi1', ?1, 'Multi', 'multi@cliente.com', 'consultor', 'Consultor'),
      ('ag-multi2', ?1, 'Multi', 'multi@cliente.com', 'executivo', 'CISO'),
      ('ag-adm', ?1, 'Adm', 'adm@ness.lat', 'executivo', 'CISO'),
      ('ag-gerente', ?1, 'Gil', 'gerente@cliente.com', 'operacional', 'Gerente de TI'),
      ('ag-lc1', ?1, 'Lucas', 'lc@cliente.com', 'executivo', 'CEO'),
      ('ag-lc2', ?1, 'Lucas', 'lc@cliente.com', 'executivo', 'Líder SGSI')`).bind(P, P2),
  ]);
  for (const [id, email, , papel, proj] of usuarios) {
    U[id] = { id, email, role: papel, client_project_id: proj, org_id: 'org_ness' };
    S[id] = await sessionFor(U[id]);
  }
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B', 'b')`).run().catch(() => undefined);
  U['a-cadmb'] = { id: 'a-cadmb', email: 'cadm@b.lat', role: 'consultoria_admin', client_project_id: null, org_id: 'org_b' };
}, 60_000);

const pedir = (h: Record<string, string>, papel: string, emails: string[], projeto = P) =>
  chamar(h, 'POST', `/api/v1/projects/${projeto}/pedidos`, { tipo: 'dpia', ref_id: DPIA, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })) });

/** Cria (pelo consultor) um pedido só para `quem` e tenta aprovar com a sessão dele. */
async function aprovarComo(quem: string, papel: string) {
  // Direto pelo serviço: a rota já recusa destinatário sem a autoridade; aqui se prova a conferência na decisão.
  const criado = await criarPedido(env.DB, { projectId: P, tipo: 'dpia', refId: DPIA, papel: papel as 'ciso' | 'ceo', destinatarios: [{ email: U[quem].email }], criadoPor: 'cons@ness.lat' });
  const id = criado!.id;
  await env.DB.prepare(`UPDATE dpia_assessments SET dpo_signature = NULL, ceo_signature = NULL WHERE id = ?`).bind(DPIA).run();
  const res = await chamar(S[quem], 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
  return { res, id, corpo: await res.clone().json<any>().catch(() => ({})) };
}

describe('quem pede: uma regra só', () => {
  it('podePedir: org_admin do projeto, consultor designado e consultoria_admin da org', async () => {
    for (const id of ['a-oa', 'a-cons', 'a-cadm']) expect(await podePedir(env.DB, U[id], P), id).toBeNull();
  });

  it('podePedir: stakeholder, consultor de outro projeto, platform_admin e comercial recusam com motivo', async () => {
    for (const id of ['a-dpo', 'a-cons2', 'a-adm', 'a-com', 'a-cadmb']) {
      const motivo = await podePedir(env.DB, U[id], P);
      expect(motivo, id).toBeTruthy();
    }
    expect(await podePedir(env.DB, U['a-cons2'], P)).toContain('não está designado');
    expect(await podePedir(env.DB, U['a-dpo'], P)).toContain('consultor designado');
  });

  it('as rotas de pedido do projeto (criar, ciência, listar, abrir, reenviar) recusam quem não pede', async () => {
    const r = await pedir(S['a-cons'], 'ciente', ['dpo@cliente.com']);
    const { id } = await r.json<any>();
    for (const quem of ['a-dpo', 'a-adm', 'a-com', 'a-cons2']) {
      const respostas = [
        await pedir(S[quem], 'ciente', ['x@cliente.com']),
        await chamar(S[quem], 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'dpia', ref_id: DPIA, destinatarios: [{ email: 'x@cliente.com' }] }),
        await chamar(S[quem], 'GET', `/api/v1/projects/${P}/pedidos`),
        await chamar(S[quem], 'GET', `/api/v1/projects/${P}/pedidos/${id}`),
        await chamar(S[quem], 'POST', `/api/v1/projects/${P}/pedidos/${id}/reenviar`, {}),
      ];
      for (const res of respostas) expect(res.status, quem).toBe(403);
    }
    for (const quem of ['a-oa', 'a-cadm']) expect((await chamar(S[quem], 'GET', `/api/v1/projects/${P}/pedidos/${id}`)).status, quem).toBe(200);
  });
});

describe('quem aprova, por papel exigido', () => {
  it("'ciso': aprova o designado com cargo DPO/CISO; cargo fora disso recusa dizendo o que falta", async () => {
    expect((await aprovarComo('a-dpo', 'ciso')).res.status).toBe(200);
    const { res, corpo } = await aprovarComo('a-gerente', 'ciso');
    expect(res.status).toBe(403);
    expect(corpo.error).toContain('Líder SGSI');
    expect(corpo.error).toContain('Gerente de TI');
  });

  it("'ceo': aprova a Direção; o Líder SGSI nunca, mesmo com cargo de Direção (segregação)", async () => {
    expect((await aprovarComo('a-ceo', 'ceo')).res.status).toBe(200);
    const { res, corpo } = await aprovarComo('a-lider', 'ceo');
    expect(res.status).toBe(403);
    expect(corpo.error).toContain('Segregação de Funções');
    const ger = await aprovarComo('a-gerente', 'ceo');
    expect(ger.res.status).toBe(403);
    expect(ger.corpo.error).toContain('Direção');
  });

  it("linhas 'CEO' e 'Líder SGSI' da mesma pessoa: 'ceo' recusa (segregação olha todas as linhas), 'ciso' aprova", async () => {
    const ceo = await aprovarComo('a-lc', 'ceo');
    expect(ceo.res.status).toBe(403);
    expect(ceo.corpo.error).toContain('Segregação de Funções');
    expect((await aprovarComo('a-lc', 'ciso')).res.status).toBe(200);
  });

  it('platform_admin nunca aprova nem dá ciência, mesmo designado na matriz e destinatário', async () => {
    for (const papel of ['ciso', 'ciente']) {
      const { res, corpo } = await aprovarComo('a-adm', papel);
      expect(res.status, papel).toBe(403);
      expect(corpo.error).toContain('administração da plataforma');
    }
  });

  it("'ciente': basta ser destinatário, mesmo sem linha na matriz", async () => {
    expect((await aprovarComo('a-sem', 'ciente')).res.status).toBe(200);
  });

  it('sem linha na matriz, nenhuma aprovação (falha fechado), e a mensagem diz o que falta', async () => {
    for (const papel of ['ciso', 'ceo']) {
      const { res, id, corpo } = await aprovarComo('a-sem', papel);
      expect(res.status, papel).toBe(403);
      expect(corpo.error).toContain('Você não está designado na matriz de Governança deste projeto');
      const d = await env.DB.prepare('SELECT status FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first<any>();
      expect(d.status).toBe('pendente');
    }
    const dpia = await env.DB.prepare('SELECT dpo_signature, ceo_signature FROM dpia_assessments WHERE id = ?').bind(DPIA).first<any>();
    expect(dpia).toMatchObject({ dpo_signature: null, ceo_signature: null });
  });

  it('autoridadeNoPedido: a mesma regra fora da rota', async () => {
    const pedido = (papel: string) => ({ project_id: P, papel_exigido: papel }) as any;
    expect((await autoridadeNoPedido(env.DB, pedido('ciso'), U['a-dpo'])).recusa).toBeNull();
    expect((await autoridadeNoPedido(env.DB, pedido('ciso'), U['a-dpo'])).nome).toBe('Dora DPO');
    expect((await autoridadeNoPedido(env.DB, pedido('ceo'), U['a-lider'])).recusa).toContain('Segregação');
    expect((await autoridadeNoPedido(env.DB, pedido('ciente'), U['a-sem'])).recusa).toBeNull();
    expect((await autoridadeNoPedido(env.DB, pedido('ciente'), U['a-adm'])).recusa).toContain('administração da plataforma');
  });
});

describe('e-mail da matriz sem caixa nem espaço', () => {
  it("matriz ' Ana@Cliente.com ' e conta 'ana@cliente.com': aprova", async () => {
    const a = await autoridadeDeAssinatura(env.DB, P, { email: 'ana@cliente.com', role: 'stakeholder' });
    expect(a).toMatchObject({ designado: true, ehLiderSgsi: true, nome: 'Ana' });
    expect((await aprovarComo('a-ana', 'ciso')).res.status).toBe(200);
  });

  it('e-mail diferente continua sem designação', async () => {
    for (const email of ['ana@cliente.com.br', 'ana.cliente.com', '']) {
      expect((await autoridadeDeAssinatura(env.DB, P, { email, role: 'stakeholder' })).designado, email).toBe(false);
    }
  });

  it('pessoa com duas linhas na matriz (consultor e CISO): vale o cargo que cobre o papel, e a segregação olha todas', async () => {
    expect((await aprovarComo('a-multi', 'ciso')).res.status).toBe(200);
    const a = await autoridadeDeAssinatura(env.DB, P, { email: 'MULTI@cliente.com', role: 'stakeholder' });
    expect(a.ehLiderSgsi).toBe(true);
  });
});
