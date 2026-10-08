import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { hashConteudo, criarPedido } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Aprovação de política por pedido: a direção do cliente que só tem conta `org_user` (read-only, o
 * write-guard barra POST /controls/:id/approve) aprova pelo pedido. A assinatura cai no controle
 * pela mesma assinaturaPolitica da aprovação direta, com a autoridade da matriz de governança.
 */
const SENHA = 'Senha-forte-123!';
const P = 'pp-proj';
const CTRL = 'ctrl_b_a51';
const TITULO = 'A.5.1 Políticas de segurança da informação';
const TEXTO = 'Política de segurança da informação: texto para aprovação da direção.';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const controle = () => env.DB.prepare('SELECT * FROM compliance_controls WHERE id = ?').bind(CTRL).first<any>();
const pedido = (id: string) => env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first<any>();
const dest = (id: string) => env.DB.prepare('SELECT * FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first<any>();

let consultor: Record<string, string>, ciso: Record<string, string>, dir: Record<string, string>, analista: Record<string, string>;

const criar = (papel: string, emails: string[], ref = 'A.5.1', h = consultor) =>
  chamar(h, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'politica', ref_id: ref, papel_exigido: papel, destinatarios: emails.map((email) => ({ email })) });
const criado = async (papel: string, emails: string[]) => {
  const r = await criar(papel, emails);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json() as any).id as string;
};
// Pedido que a rota recusaria (destinatário sem a autoridade): a matriz pode mudar depois da criação, e a decisão confere de novo.
const criadoSemChecagem = async (papel: 'ciso' | 'ceo', emails: string[]) =>
  (await criarPedido(env.DB, { projectId: P, tipo: 'politica', refId: CTRL, papel, destinatarios: emails.map((email) => ({ email })), criadoPor: 'cons@ness.lat' }))!.id;
const decidir = (h: Record<string, string>, id: string, acao: 'aprovar' | 'recusar', corpo: Record<string, unknown> = { senha: SENHA }) =>
  chamar(h, 'POST', `/api/v1/pedidos/${id}/${acao}`, corpo);

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, status) VALUES (?, ?, 'ISO 27001:2022', ?, ?, 'Partial')`).bind(CTRL, P, TITULO, TEXTO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ciso', 'ciso@cliente.com', ?, 'Cida', 'org_user', ?, 'org_ness'),
      ('u-dir', 'dir@cliente.com', ?, 'Davi', 'org_user', ?, 'org_ness'),
      ('u-ana', 'analista@cliente.com', ?, 'Ana', 'org_user', ?, 'org_ness')`).bind(senha, senha, P, senha, P, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-ciso', ?, 'Cida Matriz', 'ciso@cliente.com', 'executivo', 'CISO'),
      ('g-dir', ?, 'Davi Matriz', 'dir@cliente.com', 'executivo', 'Diretor Executivo'),
      ('g-ana', ?, 'Ana', 'analista@cliente.com', 'executivo', 'Analista de TI')`).bind(P, P, P, P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_user', client_project_id: P });
  dir = await sessionFor({ id: 'u-dir', email: 'dir@cliente.com', role: 'org_user', client_project_id: P });
  analista = await sessionFor({ id: 'u-ana', email: 'analista@cliente.com', role: 'org_user', client_project_id: P });
});

// O controle volta ao texto original e sem assinatura antes de cada teste. Pedidos de testes
// anteriores ficam no banco (prova imutável) e são substituídos se o texto mudar: não interferem.
beforeEach(async () => {
  await env.DB.prepare(
    `UPDATE compliance_controls SET title = ?, description = ?, status = 'Partial',
       ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL,
       ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL WHERE id = ?`
  ).bind(TITULO, TEXTO, CTRL).run();
});

describe('aprovação de política por pedido', () => {
  it('o consultor pede pelo código; o pedido guarda o id da linha e congela título e texto', async () => {
    const id = await criado('ciso', ['ciso@cliente.com']);
    const p = await pedido(id);
    expect(p).toMatchObject({ tipo: 'politica', ref_id: CTRL, papel_exigido: 'ciso', status: 'aberto' });
    expect(JSON.parse(p.conteudo_json)).toEqual({ title: TITULO, description: TEXTO });
    expect(p.hash).toBe(await hashConteudo({ title: TITULO, description: TEXTO }));
  });

  it('ciência de política por conta é recusada (é pelo lote por link); controle fora do projeto: 404', async () => {
    expect((await criar('ciente', ['ciso@cliente.com'])).status).toBe(400);
    expect((await criar('ciso', ['ciso@cliente.com'], 'A.99.9')).status).toBe(404);
  });

  it('org_user não cria pedido de política', async () => {
    expect((await criar('ciso', ['ciso@cliente.com'], 'A.5.1', ciso)).status).toBe(403);
  });

  it('org_user CISO aprova pelo pedido: assinatura no controle com o nome da matriz, prova gravada, status da SoA intacto', async () => {
    const id = await criado('ciso', ['ciso@cliente.com']);
    const r = await decidir(ciso, id, 'aprovar');
    expect(r.status, await r.clone().text()).toBe(200);
    const k = await controle();
    expect(k.ciso_approved_by).toBe('Cida Matriz');
    expect(k.ciso_approved_at).toBeTruthy();
    expect(k.ceo_approved_by).toBeNull();
    expect(k.status).toBe('Partial');
    const p = await pedido(id);
    expect(p.status).toBe('aprovado');
    const d = await dest(id);
    expect(d.status).toBe('aprovado');
    expect(d.hash_lido).toBe(p.hash);
  });

  it('a Direção aprova o pedido de papel ceo', async () => {
    const id = await criado('ceo', ['dir@cliente.com']);
    expect((await decidir(dir, id, 'aprovar')).status).toBe(200);
    expect((await controle()).ceo_approved_by).toBe('Davi Matriz');
  });

  it('quem não tem o cargo na matriz não aprova: 403 e nada gravado', async () => {
    const id = await criadoSemChecagem('ciso', ['analista@cliente.com']);
    const r = await decidir(analista, id, 'aprovar');
    expect(r.status).toBe(403);
    expect((await controle()).ciso_approved_by).toBeNull();
    expect((await dest(id)).status).toBe('pendente');
  });

  it('o CISO não aprova pedido de papel ceo (segregação de funções)', async () => {
    const id = await criadoSemChecagem('ceo', ['ciso@cliente.com']);
    const r = await decidir(ciso, id, 'aprovar');
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('Segregação de Funções');
    expect((await controle()).ceo_approved_by).toBeNull();
  });

  it('mudar o texto substitui o pedido; o antigo dá 409 e o novo assina', async () => {
    const id = await criado('ceo', ['dir@cliente.com']);
    const ed = await chamar(consultor, 'POST', `/api/v1/projects/${P}/controls/${CTRL}/policy`, { text: 'Texto revisto da política.' });
    expect(ed.status, await ed.clone().text()).toBe(200);
    const antigo = await pedido(id);
    expect(antigo.status).toBe('substituido');
    expect((await decidir(dir, id, 'aprovar')).status).toBe(409);
    const novo = await pedido(antigo.substituido_por);
    expect(JSON.parse(novo.conteudo_json).description).toBe('Texto revisto da política.');
    expect((await decidir(dir, novo.id, 'aprovar')).status).toBe(200);
    expect((await controle()).ceo_approved_by).toBe('Davi Matriz');
  });

  it('texto alterado por fora entre o pedido e a decisão: 409 e nada assinado', async () => {
    const id = await criado('ciso', ['ciso@cliente.com']);
    await env.DB.prepare('UPDATE compliance_controls SET description = ? WHERE id = ?').bind('Mudado direto no banco', CTRL).run();
    expect((await decidir(ciso, id, 'aprovar')).status).toBe(409);
    expect((await controle()).ciso_approved_by).toBeNull();
  });

  it('a recusa aparece para quem pediu, com o motivo, e não assina', async () => {
    const id = await criado('ceo', ['dir@cliente.com']);
    const r = await decidir(dir, id, 'recusar', { senha: SENHA, motivo: 'Falta a seção de backup' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await controle()).ceo_approved_by).toBeNull();

    const painel = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos/${id}`)).json() as any;
    expect(painel.pedido.status).toBe('recusado');
    expect(painel.destinatarios[0]).toMatchObject({ email: 'dir@cliente.com', situacao: 'recusado', motivo: 'Falta a seção de backup' });

    const lista = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/pedidos`)).json() as any;
    expect(lista.pedidos.find((p: any) => p.id === id)).toMatchObject({ tipo: 'politica', papel_exigido: 'ceo', status: 'recusado' });
  });

  it.each([[null], ['   '], ['Universal ISMS requirement.']])('política vazia (%j) não pode ser pedida: 400 e nenhum pedido gravado', async (texto) => {
    await env.DB.prepare('UPDATE compliance_controls SET description = ? WHERE id = ?').bind(texto, CTRL).run();
    const antes = (await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<any>()).n;
    const r = await criar('ciso', ['ciso@cliente.com']);
    expect(r.status).toBe(400);
    expect((await r.json() as any).error).toBe('A política está vazia: escreva o texto antes de pedir aprovação');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos').first<any>()).n).toBe(antes);
  });
});
