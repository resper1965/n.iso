import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';
import { criarPedido } from '../src/services/pedidos';

// Fatia 3.4: a hierarquia (política → norma → procedimento), a edição de metadados e a revisão são regras do servidor.
const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
const P = { userId: 'u-hi', email: 'cons-hi@ness.lat', projectId: 'proj-a', concessaoId: 'c-hi' };
let plat: Record<string, string>;
let parteA: string;
let parteB: string;

const chamar = (metodo: string, caminho: string, corpo?: unknown, e: object = workerEnv()) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...plat },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), e as any);
const json = async <T>(r: Response) => (await r.json()) as T;

type Doc = { id: string; tipo: string; titulo: string; pai_id: string | null; dono_parte_id: string | null; status: string; revisar_a_cada_meses: number | null; revisar_ate: string | null; versao_vigente: number | null };
const criar = async (tipo: string, titulo: string, pai_id?: string | null, extra: object = {}) => {
  const r = await chamar('POST', `${A}/documentos`, { tipo, titulo, texto: `Texto de ${titulo}`, ...(pai_id !== undefined ? { pai_id } : {}), ...extra });
  return { status: r.status, id: (await r.clone().json() as { id?: string }).id as string, r };
};
const ler = async (id: string) => json<Doc>(await chamar('GET', `${A}/documentos/${id}`));
const publicar = (id: string, n = 1) => chamar('POST', `${A}/documentos/${id}/versoes/${n}/publicar`);

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  parteA = (await json<{ id: string }>(await chamar('POST', `${A}/partes`, { nome: 'Ana Exemplo', email: 'ana@exemplo.com.br' }))).id;
  parteB = (await json<{ id: string }>(await chamar('POST', `${B}/partes`, { nome: 'Beto Exemplo' }))).id;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-hi', 'cons-hi@ness.lat', 'x', 'Cons', 'consultor')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Cons', 'cons-hi@ness.lat', 'consultor', 'Consultor')`),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-hi', 'u-hi', 'proj-a', datetime('now','+30 days'))`),
  ]);
});

describe('hierarquia por tipo', () => {
  it('política sem pai; norma sob política; procedimento sob norma ou política', async () => {
    const pol = await criar('politica', 'Política Raiz');
    expect(pol.status).toBe(201);
    const norma = await criar('norma', 'Norma sob a política', pol.id);
    expect(norma.status).toBe(201);
    expect((await criar('procedimento', 'Procedimento sob a norma', norma.id)).status).toBe(201);
    expect((await criar('procedimento', 'Procedimento sob a política', pol.id)).status).toBe(201);
  });

  it('combinação inválida é 400 e não grava: política com pai, norma sob norma ou procedimento, procedimento sob procedimento', async () => {
    const pol = await criar('politica', 'Raiz 2');
    const norma = await criar('norma', 'Norma 2', pol.id);
    const proc = await criar('procedimento', 'Procedimento 2', norma.id);
    const antes = (await env.DB.prepare(`SELECT count(*) AS n FROM documentos WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n;
    for (const [tipo, pai] of [['politica', pol.id], ['norma', norma.id], ['norma', proc.id], ['procedimento', proc.id]] as const) {
      expect((await criar(tipo, `Inválido ${tipo}`, pai)).status, `${tipo} sob pai inválido`).toBe(400);
    }
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM documentos WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n).toBe(antes);
  });
});

describe('editar metadados', () => {
  it('troca título, dono e periodicidade; dono de outro projeto e periodicidade fora de 1 a 120 são 400', async () => {
    const d = await criar('politica', 'Para editar');
    const r = await chamar('PUT', `${A}/documentos/${d.id}`, { titulo: 'Título novo', dono_parte_id: parteA, revisar_a_cada_meses: 6 });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ler(d.id)).toMatchObject({ titulo: 'Título novo', dono_parte_id: parteA, revisar_a_cada_meses: 6 });
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, { dono_parte_id: parteB })).status).toBe(400);
    for (const meses of [0, 121, 1.5]) expect((await chamar('PUT', `${A}/documentos/${d.id}`, { revisar_a_cada_meses: meses })).status, String(meses)).toBe(400);
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, {})).status).toBe(400);
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, { dono_parte_id: null, revisar_a_cada_meses: null })).status).toBe(200);
    expect(await ler(d.id)).toMatchObject({ dono_parte_id: null, revisar_a_cada_meses: null });
  });

  it('o pai não pode ser o próprio documento nem um descendente: as regras de tipo já tornam o ciclo impossível', async () => {
    const pol = await criar('politica', 'Ciclo raiz');
    const norma = await criar('norma', 'Ciclo norma', pol.id);
    const proc = await criar('procedimento', 'Ciclo proc', norma.id);
    expect((await chamar('PUT', `${A}/documentos/${pol.id}`, { pai_id: pol.id })).status).toBe(400);
    expect((await chamar('PUT', `${A}/documentos/${pol.id}`, { pai_id: proc.id })).status).toBe(400);
    expect((await chamar('PUT', `${A}/documentos/${norma.id}`, { pai_id: proc.id })).status).toBe(400); // procedimento não é pai de norma, e é descendente
    expect((await ler(pol.id)).pai_id).toBeNull();
  });

  it('trocar o tipo de quem tem filhos só vale se os filhos continuarem válidos; sem filhos, vale', async () => {
    const pol = await criar('politica', 'Tipo raiz');
    const norma = await criar('norma', 'Tipo norma', pol.id);
    await criar('procedimento', 'Tipo proc', norma.id);
    expect((await chamar('PUT', `${A}/documentos/${pol.id}`, { tipo: 'procedimento' })).status).toBe(400); // filha norma exige pai política
    expect((await chamar('PUT', `${A}/documentos/${norma.id}`, { tipo: 'procedimento' })).status).toBe(400); // procedimento não é pai de procedimento
    const solta = await criar('politica', 'Sem filhos');
    expect((await chamar('PUT', `${A}/documentos/${solta.id}`, { tipo: 'norma', pai_id: pol.id })).status).toBe(200);
    expect(await ler(solta.id)).toMatchObject({ tipo: 'norma', pai_id: pol.id });
  });

  it('obsoleto: sai do portal; voltar a vigente exige versão vigente', async () => {
    const d = await criar('politica', 'Vai a obsoleto');
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, { status: 'vigente' })).status).toBe(409); // só rascunho
    await publicar(d.id);
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, { status: 'obsoleto' })).status).toBe(200);
    expect((await ler(d.id)).status).toBe('obsoleto');
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, { status: 'vigente' })).status).toBe(200);
    expect((await ler(d.id)).status).toBe('vigente');
  });

  it('mudar o título de documento vigente substitui o pedido de ciência aberto (o título é conteúdo congelado)', async () => {
    const d = await criar('politica', 'Título antigo');
    await publicar(d.id);
    const ped = await criarPedido(env.DB, { projectId: 'proj-a', tipo: 'documento', refId: d.id, papel: 'ciente', destinatarios: [{ email: 'x@cliente.com' }], criadoPor: 'cons@ness.lat' });
    expect(ped).not.toBeNull();
    expect((await chamar('PUT', `${A}/documentos/${d.id}`, { titulo: 'Título novo' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(ped!.id).first())).toEqual({ status: 'substituido' });
  });

  it('documento de outro projeto: 404', async () => {
    const d = await criar('politica', 'Só do A');
    expect((await app.fetch(new Request(`http://localhost${B}/documentos/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...plat }, body: JSON.stringify({ titulo: 'x' }) }), workerEnv() as any)).status).toBe(404);
  });
});

describe('marcar como revisado', () => {
  it('renova revisar_ate (hoje + periodicidade) sem criar versão', async () => {
    const d = await criar('politica', 'Para revisar', null, { revisar_a_cada_meses: 12 });
    await publicar(d.id);
    await env.DB.prepare(`UPDATE documentos SET revisar_ate = date('now', '-10 days') WHERE id = ?`).bind(d.id).run(); // venceu
    const r = await chamar('POST', `${A}/documentos/${d.id}/revisar`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await env.DB.prepare(`SELECT revisar_ate = date('now', '+12 months') AS certo FROM documentos WHERE id = ?`).bind(d.id).first<{ certo: number }>())?.certo).toBe(1);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM documento_versoes WHERE documento_id = ?').bind(d.id).first<{ n: number }>())?.n).toBe(1);
    expect((await env.DB.prepare(`SELECT action FROM audit_logs WHERE action = 'documento.revisado' AND project_id = 'proj-a' LIMIT 1`).first())).toBeTruthy();
  });

  it('sem periodicidade, em rascunho ou obsoleto: 409', async () => {
    const semPeriodo = await criar('politica', 'Sem período');
    await publicar(semPeriodo.id);
    expect((await chamar('POST', `${A}/documentos/${semPeriodo.id}/revisar`)).status).toBe(409);
    const rasc = await criar('politica', 'Rascunho', null, { revisar_a_cada_meses: 6 });
    expect((await chamar('POST', `${A}/documentos/${rasc.id}/revisar`)).status).toBe(409);
  });
});

describe('o agente organiza, mas não decide', () => {
  const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
    app.fetch(new Request('http://localhost' + caminho, {
      method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }), { ...workerEnv(), AGENTE: P } as any);

  it('marcar revisado e mudar status são 403; outros metadados passam', async () => {
    const d = await criar('politica', 'Do agente', null, { revisar_a_cada_meses: 6 });
    await publicar(d.id);
    expect((await comoAgente('POST', `${A}/documentos/${d.id}/revisar`)).status).toBe(403);
    expect((await comoAgente('PUT', `${A}/documentos/${d.id}`, { status: 'obsoleto' })).status).toBe(403);
    expect((await ler(d.id)).status).toBe('vigente');
    expect((await comoAgente('PUT', `${A}/documentos/${d.id}`, { titulo: 'Reorganizado pelo agente' })).status).toBe(200);
  });
});
