import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { criarDocumento, publicarVersao } from '../src/services/documentos';

/** Fatia 2: catálogo de requisitos (leitura por todos, escrita só do platform_admin), vínculo com documento e lacunas. */
const P = 'rq-proj';
const OUTRO = 'rq-outro';
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-rq' };

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;

let admin: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
const A51 = 'iso27001:2022:A.5.1', A52 = 'iso27001:2022:A.5.2', A53 = 'iso27001:2022:A.5.3', A54 = 'iso27001:2022:A.5.4', A55 = 'iso27001:2022:A.5.5';
const validado = { estado: 'validado_juridico', validado_por: 'Dra. Teste', validado_em: '2026-10-01' };

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES
      ('lgpd:art7', 'lgpd', 'art. 7', 'Bases legais'), ('lgpd:art8', 'lgpd', 'art. 8', 'Consentimento'), ('lgpd:art9', 'lgpd', 'art. 9', 'Acesso facilitado'),
      ('lgpd:art37', 'lgpd', 'art. 37', 'Registro das operações'), ('lgpd:art46', 'lgpd', 'art. 46', 'Segurança')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-adm', 'adm@ness.lat', 'x', 'Adm', 'platform_admin', NULL, 'org_ness'),
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-rq', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-rq', 'u-cons', ?, datetime('now','+30 days'))`).bind(P),
    // Controles do projeto, ligados aos requisitos ISO. Status decide se cobrem.
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES
      ('c51', ?1, 'ISO 27001:2022', 'A.5.1 — x', 'Implemented', ?2), ('c52', ?1, 'ISO 27001:2022', 'A.5.2 — x', 'Implemented', ?3),
      ('c53', ?1, 'ISO 27001:2022', 'A.5.3 — x', 'Implemented', ?4), ('c54', ?1, 'ISO 27001:2022', 'A.5.4 — x', 'Not Applicable', ?5),
      ('c55', ?1, 'ISO 27001:2022', 'A.5.5 — x', 'Implemented', ?6)`).bind(P, A51, A52, A53, A54, A55),
  ]);
  admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
  const mapa = (de: string, para: string, tipo: string, extra: object = {}) => chamar(admin, 'POST', '/api/v1/requisitos/mapeamentos', { de_id: de, para_id: para, tipo, ...extra });
  expect((await mapa(A51, 'lgpd:art46', 'equivalente', validado)).status).toBe(201);
  expect((await mapa(A52, 'lgpd:art37', 'parcial', validado)).status).toBe(201);
  expect((await mapa(A53, 'lgpd:art37', 'equivalente')).status).toBe(201); // proposto: não cobre
  expect((await mapa(A54, 'lgpd:art7', 'equivalente', validado)).status).toBe(201); // controle N/A: não cobre
  expect((await mapa(A55, 'lgpd:art9', 'relacionado', validado)).status).toBe(201); // relacionado: não cobre
});

describe('leitura do catálogo', () => {
  it('fontes e lista valem para todos os papéis; fonte filtra', async () => {
    for (const h of [admin, consultor, cliente]) {
      const f = await json<{ id: string; requisitos: number }[]>(await chamar(h, 'GET', '/api/v1/requisitos/fontes'));
      expect(f.map((x) => x.id)).toEqual(['iso27001:2022', 'iso27701:2025', 'lgpd', 'gdpr']);
      expect(f.find((x) => x.id === 'lgpd')!.requisitos).toBe(5);
    }
    const lista = await json<{ fonte_id: string }[]>(await chamar(cliente, 'GET', '/api/v1/requisitos?fonte=lgpd'));
    expect(lista).toHaveLength(5);
    expect(new Set(lista.map((x) => x.fonte_id))).toEqual(new Set(['lgpd']));
  });

  it('cliente nunca recebe mapeamento proposto; consultor e administrador recebem os dois', async () => {
    const ver = async (h: Record<string, string>) =>
      (await json<{ mapeamentos: { estado: string }[] }>(await chamar(h, 'GET', '/api/v1/requisitos/lgpd:art37'))).mapeamentos.map((m) => m.estado).sort();
    expect(await ver(cliente)).toEqual(['validado_juridico']);
    expect(await ver(consultor)).toEqual(['proposto', 'validado_juridico']);
    expect(await ver(admin)).toEqual(['proposto', 'validado_juridico']);
  });

  it('requisito inexistente é 404', async () => {
    expect((await chamar(admin, 'GET', '/api/v1/requisitos/nao-existe')).status).toBe(404);
  });
});

describe('escrita no catálogo', () => {
  it('só o platform_admin escreve: cliente, consultor e agente recebem 403', async () => {
    const corpo = { titulo: 'Novo título' };
    for (const h of [cliente, consultor]) {
      expect((await chamar(h, 'PUT', '/api/v1/requisitos/lgpd:art7', corpo)).status).toBe(403);
      expect((await chamar(h, 'POST', '/api/v1/requisitos/semear')).status).toBe(403);
      expect((await chamar(h, 'DELETE', '/api/v1/requisitos/mapeamentos?de=a&para=b')).status).toBe(403);
    }
    const ag = (m: string, p: string, b?: unknown) => chamar({}, m, p, b, { AGENTE });
    expect((await ag('PUT', '/api/v1/requisitos/lgpd:art7', corpo)).status).toBe(403);
    expect((await ag('POST', '/api/v1/requisitos/semear')).status).toBe(403);
    expect((await ag('GET', '/api/v1/requisitos/fontes')).status).toBe(200);
  });

  it('administrador edita o título e a mudança entra na trilha', async () => {
    const r = await chamar(admin, 'PUT', '/api/v1/requisitos/lgpd:art8', { titulo: 'Consentimento do titular' });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare(`SELECT titulo FROM requisitos WHERE id = 'lgpd:art8'`).first()).toEqual({ titulo: 'Consentimento do titular' });
    const log = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'requisitos.titulo'`).first<{ actor: string; details: string }>();
    expect(log!.actor).toBe('adm@ness.lat');
    expect(log!.details).toContain('Consentimento do titular');
    expect((await chamar(admin, 'PUT', '/api/v1/requisitos/lgpd:art8', { titulo: '' })).status).toBe(400);
    expect((await chamar(admin, 'PUT', '/api/v1/requisitos/lgpd:art8', { titulo: 'x', extra: 1 })).status).toBe(400);
  });

  it('semear de novo não cria nada e não desfaz a edição', async () => {
    const r = await json<{ fontes: number; requisitos: number }>(await chamar(admin, 'POST', '/api/v1/requisitos/semear'));
    expect(r).toMatchObject({ ok: true, fontes: 0, requisitos: 0 });
  });

  it('mapeamento: validado exige quem e quando; auto-referência, duplicata e requisito inexistente são recusados', async () => {
    const post = (b: object) => chamar(admin, 'POST', '/api/v1/requisitos/mapeamentos', b);
    expect((await post({ de_id: 'lgpd:art8', para_id: 'lgpd:art9', tipo: 'equivalente', estado: 'validado_juridico' })).status).toBe(400);
    expect((await post({ de_id: 'lgpd:art8', para_id: 'lgpd:art8', tipo: 'equivalente' })).status).toBe(400);
    expect((await post({ de_id: A51, para_id: 'lgpd:art46', tipo: 'parcial' })).status).toBe(409);
    expect((await post({ de_id: A51, para_id: 'nao-existe', tipo: 'parcial' })).status).toBe(404);
    expect((await post({ de_id: 'lgpd:art8', para_id: 'lgpd:art9', tipo: 'igual' })).status).toBe(400);
  });

  it('altera e remove o mapeamento; o que não existe é 404', async () => {
    expect((await chamar(admin, 'POST', '/api/v1/requisitos/mapeamentos', { de_id: 'lgpd:art8', para_id: 'lgpd:art9', tipo: 'relacionado' })).status).toBe(201);
    const put = await chamar(admin, 'PUT', '/api/v1/requisitos/mapeamentos', { de_id: 'lgpd:art8', para_id: 'lgpd:art9', tipo: 'parcial', ...validado });
    expect(put.status).toBe(200);
    expect(await env.DB.prepare(`SELECT tipo, estado, validado_por FROM requisito_mapeamentos WHERE de_id = 'lgpd:art8'`).first())
      .toEqual({ tipo: 'parcial', estado: 'validado_juridico', validado_por: 'Dra. Teste' });
    expect((await chamar(admin, 'DELETE', '/api/v1/requisitos/mapeamentos?de=lgpd:art8&para=lgpd:art9')).status).toBe(200);
    expect((await chamar(admin, 'DELETE', '/api/v1/requisitos/mapeamentos?de=lgpd:art8&para=lgpd:art9')).status).toBe(404);
    expect((await chamar(admin, 'PUT', '/api/v1/requisitos/mapeamentos', { de_id: 'lgpd:art8', para_id: 'lgpd:art9', tipo: 'parcial' })).status).toBe(404);
  });

  it('requisito em uso (controle, documento ou filho) não é apagado: 409; o livre é apagado', async () => {
    const r = await chamar(admin, 'DELETE', `/api/v1/requisitos/${A51}`);
    expect(r.status).toBe(409);
    expect(await json<{ controles: number }>(r)).toMatchObject({ controles: 1 });
    await env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo, pai_id) VALUES ('lgpd:art7:i', 'lgpd', 'art. 7, I', 'Inciso', 'lgpd:art7')`).run();
    expect((await chamar(admin, 'DELETE', '/api/v1/requisitos/lgpd:art7')).status).toBe(409);
    expect((await chamar(admin, 'DELETE', '/api/v1/requisitos/lgpd:art7:i')).status).toBe(200);
    expect((await chamar(admin, 'DELETE', '/api/v1/requisitos/lgpd:art7:i')).status).toBe(404);
  });
});

describe('documento e requisitos', () => {
  let doc: string, docRascunho: string, docOutro: string;
  beforeAll(async () => {
    const mk = async (projeto: string, titulo: string, publicar: boolean) => {
      const c = await criarDocumento(env.DB, projeto, 'cons@ness.lat', { tipo: 'politica', titulo, texto: 'Texto v1' });
      if (!c.ok) throw new Error(c.error);
      if (publicar) await publicarVersao(env.DB, projeto, c.id, 1, 'cons@ness.lat');
      return c.id;
    };
    doc = await mk(P, 'Política Vigente', true);
    docRascunho = await mk(P, 'Política em Rascunho', false);
    docOutro = await mk(OUTRO, 'Política de Outro', true);
  });
  const base = (d: string) => `/api/v1/projects/${P}/documentos/${d}/requisitos`;

  it('liga e troca os requisitos; id desconhecido é 400 e nada muda; repetidos contam uma vez', async () => {
    expect((await chamar(consultor, 'PUT', base(doc), { requisitos: ['lgpd:art8', 'lgpd:art8', A51] })).status).toBe(200);
    expect((await json<{ id: string }[]>(await chamar(cliente, 'GET', base(doc)))).map((x) => x.id).sort()).toEqual([A51, 'lgpd:art8'].sort());
    const ruim = await chamar(consultor, 'PUT', base(doc), { requisitos: ['lgpd:art8', 'fantasma'] });
    expect(ruim.status).toBe(400);
    expect(await json<{ desconhecidos: string[] }>(ruim)).toMatchObject({ desconhecidos: ['fantasma'] });
    expect((await json<unknown[]>(await chamar(consultor, 'GET', base(doc)))).length).toBe(2);
    expect((await chamar(consultor, 'PUT', base(doc), { requisitos: [] })).status).toBe(200);
    expect(await json<unknown[]>(await chamar(consultor, 'GET', base(doc)))).toEqual([]);
  });

  it('documento de outro projeto é 404, na leitura e na escrita', async () => {
    expect((await chamar(consultor, 'GET', base(docOutro))).status).toBe(404);
    expect((await chamar(consultor, 'PUT', base(docOutro), { requisitos: ['lgpd:art8'] })).status).toBe(404);
  });

  it('cliente de papel somente leitura não grava', async () => {
    expect((await chamar(cliente, 'PUT', base(doc), { requisitos: ['lgpd:art8'] })).status).toBe(403);
  });

  it('lacunas: documento vigente cobre, rascunho não; controle equivalente cobre, parcial é parcial; proposto, relacionado e N/A não cobrem', async () => {
    await chamar(consultor, 'PUT', base(doc), { requisitos: ['lgpd:art8'] });
    await chamar(consultor, 'PUT', base(docRascunho), { requisitos: ['lgpd:art9'] });
    const r = await json<{ resumo: Record<string, number>; itens: { requisito_id: string; situacao: string; origens: { tipo: string }[] }[] }>(
      await chamar(cliente, 'GET', `/api/v1/projects/${P}/requisitos/lacunas?fonte=lgpd`));
    const sit = Object.fromEntries(r.itens.map((i) => [i.requisito_id, i.situacao]));
    expect(sit).toEqual({ 'lgpd:art7': 'lacuna', 'lgpd:art8': 'coberto', 'lgpd:art9': 'lacuna', 'lgpd:art37': 'parcial', 'lgpd:art46': 'coberto' });
    expect(r.resumo).toEqual({ total: 5, cobertos: 2, parciais: 1, lacunas: 2 });
    expect(r.itens.find((i) => i.requisito_id === 'lgpd:art8')!.origens).toEqual([{ tipo: 'documento', id: doc, titulo: 'Política Vigente' }]);
  });

  it('lacunas não vazam documento nem controle de outro projeto', async () => {
    await env.DB.prepare(`INSERT OR IGNORE INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES (?, 'lgpd:art7', ?)`).bind(docOutro, OUTRO).run();
    const r = await json<{ itens: { requisito_id: string; situacao: string }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/requisitos/lacunas?fonte=lgpd`));
    expect(r.itens.find((i) => i.requisito_id === 'lgpd:art7')!.situacao).toBe('lacuna');
  });
});
