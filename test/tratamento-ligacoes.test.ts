import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/** Fatia 4.1: o registro do RoPA (o tratamento) aponta para itens, departamentos, partes, transferências e a base legal. */
const P = 'tl-proj';
const OUTRO = 'tl-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, cliente: Record<string, string>;
const base = (rid: string) => `/api/v1/projects/${P}/ropa/${rid}`;
type Lig = {
  base_legal: { id: string; referencia: string; titulo: string } | null;
  itens: { id: string; nome: string }[]; departamentos: { id: string; nome: string }[];
  partes: { vinculo_id: string; parte_id: string; nome: string; papel: string }[];
  transferencias: { id: string; pais: string; destinatario: string | null; mecanismo: string | null }[];
};
const ligacoes = async (rid: string) => json<Lig>(await chamar(consultor, 'GET', `${base(rid)}/ligacoes`));
async function novoRegistro(finalidade = 'Folha de pagamento', extra: object = {}) {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: finalidade, ...extra });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tl', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('it1', ?1, 'ERP', 'sistema'), ('it2', ?1, 'Folha', 'processo'), ('it-o', ?2, 'Sistema alheio', 'sistema')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('dp1', ?1, 'RH'), ('dp-o', ?2, 'RH alheio')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pa1', ?1, 'organizacao', 'Operadora Exemplo'), ('pa-o', ?2, 'organizacao', 'Parte alheia')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
    env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:art7:i', 'lgpd', 'art. 7, I', 'Base de teste')`),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('ligações do registro', () => {
  it('registro novo não tem ligação nenhuma', async () => {
    const rid = await novoRegistro();
    expect(await ligacoes(rid)).toEqual({ aprovacao: { ciso: null, ceo: null }, lia: { exigida: false, existe: false, status: null }, dpias: [], dpia_pendente: false, terceiros_com_avaliacao_vencida: [], base_legal: null, itens: [], departamentos: [], partes: [], transferencias: [] });
  });

  it('itens e departamentos: troca o conjunto, repetido conta uma vez, vazio limpa', async () => {
    const rid = await novoRegistro();
    expect((await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: ['it1', 'it2', 'it1'] })).status).toBe(200);
    expect((await ligacoes(rid)).itens.map((i) => i.id).sort()).toEqual(['it1', 'it2']);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/departamentos`, { departamentos: ['dp1'] })).status).toBe(200);
    expect((await ligacoes(rid)).departamentos.map((d) => d.id)).toEqual(['dp1']);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: ['it2'] })).status).toBe(200);
    expect((await ligacoes(rid)).itens.map((i) => i.id)).toEqual(['it2']);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: [] })).status).toBe(200);
    expect((await ligacoes(rid)).itens).toEqual([]);
  });

  it('item ou departamento de outro projeto é 400 e nada muda, mesmo misturado a um válido', async () => {
    const rid = await novoRegistro();
    await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: ['it1'] });
    const r = await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: ['it2', 'it-o'] });
    expect(r.status).toBe(400);
    expect(await json<{ invalidos: string[] }>(r)).toMatchObject({ invalidos: ['it-o'] });
    expect((await ligacoes(rid)).itens.map((i) => i.id)).toEqual(['it1']);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/departamentos`, { departamentos: ['dp-o'] })).status).toBe(400);
    expect((await ligacoes(rid)).departamentos).toEqual([]);
  });

  it('registro inexistente ou de outro projeto é 404 em toda rota', async () => {
    const alheio = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?, ?, 'Alheio')`).bind(alheio, OUTRO).run();
    for (const rid of [alheio, 'nao-existe']) {
      expect((await chamar(consultor, 'GET', `${base(rid)}/ligacoes`)).status, rid).toBe(404);
      expect((await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: [] })).status, rid).toBe(404);
      expect((await chamar(consultor, 'PUT', `${base(rid)}/departamentos`, { departamentos: [] })).status, rid).toBe(404);
      expect((await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Chile' })).status, rid).toBe(404);
    }
  });

  it('papel só de leitura não liga nada', async () => {
    const rid = await novoRegistro();
    expect((await chamar(cliente, 'PUT', `${base(rid)}/itens`, { itens: ['it1'] })).status).toBe(403);
    expect((await chamar(cliente, 'GET', `${base(rid)}/ligacoes`)).status).toBe(200);
  });
});

describe('transferências', () => {
  it('registra com destinatário e mecanismo, lista com o nome da parte e remove', async () => {
    const rid = await novoRegistro();
    const r = await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Estados Unidos', destinatario_parte_id: 'pa1', mecanismo: 'cláusulas-padrão' });
    expect(r.status, await r.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    expect((await ligacoes(rid)).transferencias).toEqual([{ id, pais: 'Estados Unidos', destinatario_parte_id: 'pa1', destinatario: 'Operadora Exemplo', mecanismo: 'cláusulas-padrão', observacao: null }]);
    expect((await chamar(consultor, 'DELETE', `${base(rid)}/transferencias/${id}`)).status).toBe(200);
    expect((await chamar(consultor, 'DELETE', `${base(rid)}/transferencias/${id}`)).status).toBe(404);
    expect((await ligacoes(rid)).transferencias).toEqual([]);
  });

  it('país obrigatório, campo desconhecido recusado e destinatário de outro projeto é 400', async () => {
    const rid = await novoRegistro();
    expect((await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: '  ' })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Chile', extra: 1 })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Chile', destinatario_parte_id: 'pa-o' })).status).toBe(400);
    expect((await ligacoes(rid)).transferencias).toEqual([]);
  });

  it('transferência de um registro não é removida pela rota de outro', async () => {
    const a = await novoRegistro('A'), b = await novoRegistro('B');
    const id = (await json<{ id: string }>(await chamar(consultor, 'POST', `${base(a)}/transferencias`, { pais: 'Chile' }))).id;
    expect((await chamar(consultor, 'DELETE', `${base(b)}/transferencias/${id}`)).status).toBe(404);
    expect((await ligacoes(a)).transferencias).toHaveLength(1);
  });
});

describe('partes do tratamento e base legal', () => {
  it('a parte vira operador do registro pelo vínculo existente e aparece nas ligações', async () => {
    const rid = await novoRegistro();
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: rid });
    expect(r.status, await r.clone().text()).toBe(201);
    expect((await ligacoes(rid)).partes).toMatchObject([{ parte_id: 'pa1', nome: 'Operadora Exemplo', papel: 'operador' }]);
  });

  it('papel que não se aplica a tratamento e registro de outro projeto são recusados', async () => {
    const rid = await novoRegistro();
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/pa1/vinculos`, { papel: 'dono_sistema', alvo_tipo: 'tratamento', alvo_id: rid })).status).toBe(400);
    const alheio = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES (?, ?, 'Alheio')`).bind(alheio, OUTRO).run();
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: alheio })).status).toBe(400);
  });

  it('base legal: criar e editar exigem requisito existente; aparece nas ligações; null desliga', async () => {
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: 'X', base_legal_id: 'nao-existe' })).status).toBe(400);
    const rid = await novoRegistro('Com base', { base_legal_id: 'lgpd:art7:i' });
    expect((await ligacoes(rid)).base_legal).toEqual({ id: 'lgpd:art7:i', referencia: 'art. 7, I', titulo: 'Base de teste' });
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Com base', base_legal_id: 'nao-existe' })).status).toBe(400);
    expect((await ligacoes(rid)).base_legal).not.toBeNull();
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Com base', base_legal_id: null })).status).toBe(200);
    expect((await ligacoes(rid)).base_legal).toBeNull();
  });
});

describe('exclusão do registro', () => {
  it('leva as ligações e os vínculos de parte, e não toca nos de outro registro', async () => {
    const a = await novoRegistro('A'), b = await novoRegistro('B');
    for (const rid of [a, b]) {
      await chamar(consultor, 'PUT', `${base(rid)}/itens`, { itens: ['it1'] });
      await chamar(consultor, 'PUT', `${base(rid)}/departamentos`, { departamentos: ['dp1'] });
      await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Chile' });
      await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: rid });
    }
    expect((await chamar(consultor, 'DELETE', `/api/v1/ropa/${a}`)).status).toBe(200);
    const n = async (t: string, col: string, id: string) => (await env.DB.prepare(`SELECT count(*) AS n FROM ${t} WHERE ${col} = ?`).bind(id).first<{ n: number }>())!.n;
    for (const [t, col] of [['tratamento_itens', 'ropa_id'], ['tratamento_departamentos', 'ropa_id'], ['tratamento_transferencias', 'ropa_id'], ['parte_vinculos', 'alvo_id']] as const) {
      expect(await n(t, col, a), `${t} do apagado`).toBe(0);
      expect(await n(t, col, b), `${t} do outro`).toBe(1);
    }
    // O item, o departamento e a parte continuam existindo.
    expect(await env.DB.prepare(`SELECT (SELECT count(*) FROM itens WHERE id = 'it1') AS i, (SELECT count(*) FROM departamentos WHERE id = 'dp1') AS d, (SELECT count(*) FROM partes WHERE id = 'pa1') AS p`).first())
      .toEqual({ i: 1, d: 1, p: 1 });
  });
});
