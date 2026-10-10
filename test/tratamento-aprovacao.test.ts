import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';

/**
 * Fatia 4.3: aprovação do tratamento por pedido (`tipo = 'tratamento'`, ref_id = o registro do RoPA). O conteúdo congelado é o
 * registro e tudo o que ele liga; a aprovação é DERIVADA (vale o pedido aprovado com o hash do conteúdo de hoje).
 */
const SENHA = 'Senha-forte-123!';
const P = 'ta-proj';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, ciso: Record<string, string>;
type Reg = { id: string; aprovacao_pedido: { ciso: { por: string } | null; ceo: { por: string } | null }; ciso_approved_by: string | null };
const registro = async (id: string) => (await json<{ records: Reg[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa`))).records.find((r) => r.id === id)!;
async function novo(finalidade = 'Folha de pagamento') {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: finalidade, data_subjects: 'Colaboradores' });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}
const pedir = (ref: string, papel = 'ciso') =>
  chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'tratamento', ref_id: ref, papel_exigido: papel, destinatarios: [{ email: 'ciso@cliente.com' }] });
const pedido = async (ref: string) => {
  const r = await pedir(ref);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const aprovar = (id: string) => chamar(ciso, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
const statusPedidos = async (ref: string) =>
  (await env.DB.prepare(`SELECT status FROM pedidos WHERE tipo = 'tratamento' AND ref_id = ? ORDER BY criado_em, rowid`).bind(ref).all<{ status: string }>()).results.map((r) => r.status);

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ciso', 'ciso@cliente.com', ?, 'Cida', 'org_user', ?, 'org_ness')`).bind(senha, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-ciso', ?1, 'Cida Matriz', 'ciso@cliente.com', 'executivo', 'CISO')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('ta-i1', ?, 'ERP', 'sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('ta-d1', ?, 'RH')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ta-pa1', ?, 'organizacao', 'Operadora Exemplo')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_user', client_project_id: P });
}, 60_000);

describe('pedido de aprovação do tratamento', () => {
  it('congela o registro e as ligações; a aprovação aparece na lista e nada é assinado no registro', async () => {
    const id = await novo();
    await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/itens`, { itens: ['ta-i1'] });
    await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/departamentos`, { departamentos: ['ta-d1'] });
    await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/ta-pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: id });
    await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/transferencias`, { pais: 'Chile', destinatario_parte_id: 'ta-pa1', mecanismo: 'cláusulas' });
    expect((await registro(id)).aprovacao_pedido).toEqual({ ciso: null, ceo: null });

    const ped = await pedido(id);
    const p = await env.DB.prepare('SELECT titulo, conteudo_json, status, papel_exigido FROM pedidos WHERE id = ?').bind(ped).first<{ titulo: string; conteudo_json: string; status: string; papel_exigido: string }>();
    expect(p).toMatchObject({ titulo: 'Tratamento: Folha de pagamento', status: 'aberto', papel_exigido: 'ciso' });
    expect(JSON.parse(p!.conteudo_json)).toMatchObject({
      finalidade: 'Folha de pagamento', titulares: 'Colaboradores',
      itens: ['ERP (sistema)'], departamentos: ['RH'], partes: ['operador: Operadora Exemplo'], transferencias: ['Chile | Operadora Exemplo | cláusulas'],
    });

    const r = await aprovar(ped);
    expect(r.status, await r.clone().text()).toBe(200);
    const reg = await registro(id);
    expect(reg.aprovacao_pedido.ciso).toMatchObject({ por: 'Cida Matriz' });
    expect(reg.aprovacao_pedido.ceo).toBeNull();
    expect(reg.ciso_approved_by).toBeNull(); // o pedido não escreve na aprovação direta antiga
  });

  it('ciência não vale para tratamento; registro alheio ou inexistente é 404', async () => {
    const id = await novo('Para validar');
    expect((await pedir(id, 'ciente')).status).toBe(400);
    expect((await pedir('nao-existe')).status).toBe(404);
  });

  it('mudar o registro invalida a aprovação sozinho e substitui o pedido aberto; a prova antiga fica', async () => {
    const id = await novo('Para editar');
    const ped = await pedido(id);
    await aprovar(ped);
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();

    const r = await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Para editar', retention_period: '5 anos' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
    expect(await statusPedidos(id)).toEqual(['aprovado']); // aprovado não é reaberto nem apagado
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM pedido_destinatarios WHERE pedido_id = ? AND status = 'aprovado'`).bind(ped).first()).toEqual({ n: 1 });
  });

  it.each([
    ['item', (id: string) => chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/itens`, { itens: ['ta-i1'] })],
    ['departamento', (id: string) => chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/departamentos`, { departamentos: ['ta-d1'] })],
    ['transferência', (id: string) => chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/transferencias`, { pais: 'Chile' })],
    ['parte', (id: string) => chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/ta-pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: id })],
  ])('mudar %s invalida a aprovação', async (_n, mudar) => {
    const id = await novo(`Muda ${_n}`);
    await aprovar(await pedido(id));
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();
    expect((await mudar(id)).status).toBeLessThan(300);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
  });

  it('remover o vínculo da parte e a transferência também invalida', async () => {
    const id = await novo('Remove ligações');
    const v = await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/ta-pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: id });
    const vinculoId = (await json<{ id: string }>(v)).id;
    const t = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/transferencias`, { pais: 'Chile' });
    const transfId = (await json<{ id: string }>(t)).id;
    await aprovar(await pedido(id));
    expect((await chamar(consultor, 'DELETE', `/api/v1/projects/${P}/partes/ta-pa1/vinculos/${vinculoId}`)).status).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
    await aprovar(await pedido(id));
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();
    expect((await chamar(consultor, 'DELETE', `/api/v1/projects/${P}/ropa/${id}/transferencias/${transfId}`)).status).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
  });

  it('pedido ainda aberto é substituído por um novo quando uma ligação muda (e quando só o status muda, não)', async () => {
    const id = await novo('Pedido aberto');
    await pedido(id);
    expect(await statusPedidos(id)).toEqual(['aberto']);
    await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Pedido aberto', status: 'Under Review' });
    expect(await statusPedidos(id)).toEqual(['aberto']);
    expect((await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/itens`, { itens: ['ta-i1'] })).status).toBe(200);
    expect(await statusPedidos(id)).toEqual(['substituido', 'aberto']);
  });

  it('mudar só o status não invalida a aprovação do conteúdo', async () => {
    const id = await novo('Só status');
    await aprovar(await pedido(id));
    const r = await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Só status', status: 'Under Review' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();
  });

  it('a aprovação direta antiga segue funcionando ao lado da derivada', async () => {
    const id = await novo('Aprovação direta');
    const admin = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_admin', client_project_id: P });
    const direta = await chamar(admin, 'POST', `/api/v1/projects/${P}/ropa/${id}/approve`, { role: 'ciso' });
    expect(direta.status, await direta.clone().text()).toBe(200);
    expect((await registro(id)).ciso_approved_by).toBe('Cida Matriz');
    expect((await registro(id)).aprovacao_pedido).toEqual({ ciso: null, ceo: null });
  });
});
