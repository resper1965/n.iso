import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { catalogoInicialNess } from '../src/services/catalogo-inicial';
import { servicoSchema } from '../src/schemas';

const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(
    new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'X-Agente-Confirmado': '1' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE } as any,
  );

const avulso = {
  nome: 'Revisão de políticas', tipo: 'avulso', formaPreco: 'fixo', valorFixo: 12000, norma: 'ISO/IEC 27001:2022',
  descricao: 'Revisão das políticas existentes.', premissas: ['Políticas fornecidas em formato editável'], exclusoes: [],
  entregaveis: ['Relatório de revisão'], criterioAceite: 'Relatório entregue e aceito pelo cliente.',
};
const acoes = async () =>
  (await env.DB.prepare(`SELECT action FROM audit_logs WHERE action LIKE 'servico.%' ORDER BY rowid`).all<any>()).results.map((r) => r.action);

describe('catálogo de serviços', () => {
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

  it('o catálogo inicial passa no servicoSchema', () => {
    expect(catalogoInicialNess().every((s) => servicoSchema.safeParse(s).success)).toBe(true);
  });

  it('comercial cria, lista e lê o serviço igual ao enviado', async () => {
    const r = await chamar('POST', '/api/v1/servicos', comercial, avulso);
    expect(r.status).toBe(201);
    const criado = await r.json<any>();
    expect(criado).toMatchObject({ ...avulso, ativo: true, orgId: 'org_ness' });
    const lista = await (await chamar('GET', '/api/v1/servicos', comercial)).json<any[]>();
    expect(lista.map((s) => s.id)).toContain(criado.id);
    const um = await (await chamar('GET', `/api/v1/servicos/${criado.id}`, comercial)).json<any>();
    expect(um).toEqual(criado);
  }, 30_000);

  it('consultor, cliente e agente levam 403 em GET e POST: o catálogo tem preço', async () => {
    for (const h of [consultor, cliente]) {
      expect((await chamar('GET', '/api/v1/servicos', h)).status).toBe(403);
      expect((await chamar('POST', '/api/v1/servicos', h, avulso)).status).toBe(403);
    }
    expect((await comoAgente('GET', '/api/v1/servicos')).status).toBe(403);
    expect((await comoAgente('POST', '/api/v1/servicos', avulso)).status).toBe(403);
  }, 30_000);

  it('corpo inválido (fases somando 90) → 400 com details', async () => {
    const corpo = { ...catalogoInicialNess()[0], fases: catalogoInicialNess()[0].fases!.map((f: any, i: number) => (i === 0 ? { ...f, pct: f.pct - 10 } : f)) };
    const r = await chamar('POST', '/api/v1/servicos', comercial, corpo);
    expect(r.status).toBe(400);
    expect(Array.isArray((await r.json<any>()).details)).toBe(true);
  });

  it('PUT substitui; arquivar sai de ?ativos=1 mas GET /:id devolve ativo false; reativar volta', async () => {
    const { id } = await (await chamar('POST', '/api/v1/servicos', comercial, { ...avulso, nome: 'Para editar' })).json<any>();
    const r = await chamar('PUT', `/api/v1/servicos/${id}`, comercial, { ...avulso, nome: 'Editado', valorFixo: 15000 });
    expect(r.status).toBe(200);
    expect(await r.json<any>()).toMatchObject({ id, nome: 'Editado', valorFixo: 15000, ativo: true });

    expect((await chamar('POST', `/api/v1/servicos/${id}/arquivar`, comercial)).status).toBe(200);
    const ativos = await (await chamar('GET', '/api/v1/servicos?ativos=1', comercial)).json<any[]>();
    expect(ativos.map((s) => s.id)).not.toContain(id);
    expect((await (await chamar('GET', `/api/v1/servicos/${id}`, comercial)).json<any>()).ativo).toBe(false);

    await chamar('POST', `/api/v1/servicos/${id}/reativar`, comercial);
    const de_novo = await (await chamar('GET', '/api/v1/servicos?ativos=1', comercial)).json<any[]>();
    expect(de_novo.map((s) => s.id)).toContain(id);
  }, 30_000);

  it('serviço de outra organização: GET, PUT e arquivar → 404', async () => {
    await env.DB.prepare(
      `INSERT INTO servicos (id, org_id, nome, tipo, forma_preco, valor_fixo, entregaveis, criterio_aceite)
       VALUES ('srv_b','org_b','Do outro','avulso','fixo',1000,'["x"]','ok')`).run();
    expect((await chamar('GET', '/api/v1/servicos/srv_b', comercial)).status).toBe(404);
    expect((await chamar('PUT', '/api/v1/servicos/srv_b', comercial, avulso)).status).toBe(404);
    expect((await chamar('POST', '/api/v1/servicos/srv_b/arquivar', comercial)).status).toBe(404);
    const lista = await (await chamar('GET', '/api/v1/servicos', comercial)).json<any[]>();
    expect(lista.map((s) => s.id)).not.toContain('srv_b');
    const linha = await env.DB.prepare(`SELECT ativo, nome FROM servicos WHERE id = 'srv_b'`).first<any>();
    expect(linha).toEqual({ ativo: 1, nome: 'Do outro' });
  }, 30_000);

  it('cada escrita gera linha na trilha', async () => {
    const a = await acoes();
    expect(a).toEqual(expect.arrayContaining(['servico.criado', 'servico.atualizado', 'servico.arquivado', 'servico.reativado']));
  });

  describe('semear-padrao', () => {
    beforeAll(async () => { await env.DB.prepare('DELETE FROM servicos').run(); });

    it('comercial leva 403', async () => {
      expect((await chamar('POST', '/api/v1/servicos/semear-padrao', comercial)).status).toBe(403);
    });

    it('platform_admin semeia 3 serviços, dois ativos; a segunda chamada → 409', async () => {
      const r = await chamar('POST', '/api/v1/servicos/semear-padrao', adm);
      expect(r.status).toBe(201);
      const semeados = await r.json<any[]>();
      expect(semeados).toHaveLength(3);
      expect(semeados.filter((s) => s.ativo)).toHaveLength(2);
      expect(semeados.find((s) => s.nome === 'Manutenção do SGSI').ativo).toBe(false);
      expect((await chamar('POST', '/api/v1/servicos/semear-padrao', adm)).status).toBe(409);
      expect((await chamar('GET', '/api/v1/servicos', comercial).then((x) => x.json<any[]>()))).toHaveLength(3);
    }, 30_000);

    it('a implementação semeada tem 7 fases somando 100 e dias 45/90/160', async () => {
      const lista = await (await chamar('GET', '/api/v1/servicos', comercial)).json<any[]>();
      const impl = lista.find((s) => s.tipo === 'projeto');
      expect(impl.fases).toHaveLength(7);
      expect(impl.fases.reduce((n: number, f: any) => n + f.pct, 0)).toBe(100);
      expect(impl.diasPorFaixa).toEqual({ '1': 45, '2': 90, '3': 160 });
    });
  });
});
