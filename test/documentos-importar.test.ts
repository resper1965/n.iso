import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';
import { hashDoTexto } from '../src/services/documentos';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>;

type Versao = { numero: number; estado: string; texto: string; hash: string; origem: string };
type Doc = { id: string; titulo: string; tipo: string; status: string; versao_vigente: number | null; versoes: Versao[] };

const controle = (id: string, projeto: string, titulo: string, status: string, descricao: string | null, aprovadoPor: string | null = null) =>
  env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description, ciso_approved_by) VALUES (?, ?, 'ISO 27001', ?, ?, ?, ?)`)
    .bind(id, projeto, titulo, status, descricao, aprovadoPor);
const versaoAntiga = (controleId: string, projeto: string, n: number, texto: string) =>
  env.DB.prepare(`INSERT INTO policy_versions (project_id, control_id, version, policy_text, created_by) VALUES (?, ?, ?, ?, 'autor@exemplo.com.br')`)
    .bind(projeto, controleId, n, texto);

const docDoControle = async (controleId: string) => {
  const linha = await env.DB.prepare(`SELECT id FROM documentos WHERE origem_control_id = ?`).bind(controleId).first<{ id: string }>();
  return linha ? json<Doc>(await chamar(plat, 'GET', `${A}/documentos/${linha.id}`)) : null;
};

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  await env.DB.batch([
    // c1: duas versões, a última igual ao texto atual
    controle('imp-c1', 'proj-a', 'A.5.1 Política Um', 'Implemented', 'Texto A2'),
    versaoAntiga('imp-c1', 'proj-a', 1, 'Texto A1'),
    versaoAntiga('imp-c1', 'proj-a', 2, 'Texto A2'),
    // c2: sem versões, mas com aprovação
    controle('imp-c2', 'proj-a', 'A.5.2 Política Dois', 'In Progress', 'Texto B', 'ciso@exemplo.com.br'),
    // c3: não aplicável (a descrição é a justificativa da SoA), mesmo com versões
    controle('imp-c3', 'proj-a', 'A.5.3 Não aplicável', 'Not Applicable', 'Justificativa da SoA'),
    versaoAntiga('imp-c3', 'proj-a', 1, 'Texto antigo'),
    // c4: só texto de catálogo, nenhum sinal de política
    controle('imp-c4', 'proj-a', 'A.5.4 Só catálogo', 'Missing', 'Descrição do catálogo'),
    // c5: tem pedido de política
    controle('imp-c5', 'proj-a', 'A.5.5 Com pedido', 'Planned', 'Texto E'),
    env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('imp-ped', 'org_ness', 'proj-a', 'politica', 'imp-c5', 'Política: Com pedido', 'ciso', '{}', 'h', 'x@ness.lat')`),
    // c6: versões, mas o texto atual do controle é outro (editado sem versionar)
    controle('imp-c6', 'proj-a', 'A.5.6 Texto novo', 'Implemented', 'Texto novo'),
    versaoAntiga('imp-c6', 'proj-a', 1, 'Texto antigo'),
    // c7: sinal de política, mas nenhum texto em lugar nenhum
    controle('imp-c7', 'proj-a', 'A.5.7 Sem texto', 'Missing', null, 'ciso@exemplo.com.br'),
    // outro projeto
    controle('imp-cb', 'proj-b', 'A.5.1 Do B', 'Implemented', 'Texto do B'),
    versaoAntiga('imp-cb', 'proj-b', 1, 'Texto do B'),
  ]);
});

describe('importar as políticas que já existem', () => {
  it('traz só o que é política, renumera as versões e deixa o texto atual como vigente', async () => {
    const r = await chamar(plat, 'POST', `${A}/documentos/importar`);
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ ok: true, criados: 4, ja_existiam: 0, versoes: 6, ignorados_nao_aplicavel: 1, ignorados_sem_texto: 1 });

    const c1 = (await docDoControle('imp-c1'))!;
    expect(c1).toMatchObject({ titulo: 'A.5.1 Política Um', tipo: 'politica', status: 'vigente', versao_vigente: 2 });
    expect(c1.versoes.map((v) => [v.numero, v.estado, v.texto])).toEqual([[1, 'substituida', 'Texto A1'], [2, 'vigente', 'Texto A2']]);

    const c2 = (await docDoControle('imp-c2'))!;
    expect(c2.versoes.map((v) => [v.numero, v.estado, v.texto])).toEqual([[1, 'vigente', 'Texto B']]);

    expect((await docDoControle('imp-c5'))!.versoes.map((v) => v.texto)).toEqual(['Texto E']);

    // texto atual diferente da última versão: entra mais uma, vigente
    const c6 = (await docDoControle('imp-c6'))!;
    expect(c6.versoes.map((v) => [v.numero, v.estado, v.texto])).toEqual([[1, 'substituida', 'Texto antigo'], [2, 'vigente', 'Texto novo']]);

    for (const id of ['imp-c3', 'imp-c4', 'imp-c7']) expect(await docDoControle(id), id).toBeNull();
  });

  it('cada versão leva o hash canônico do texto e origem humana', async () => {
    const c1 = (await docDoControle('imp-c1'))!;
    for (const v of c1.versoes) {
      expect(v.hash).toBe(await hashDoTexto(v.texto));
      expect(v.origem).toBe('humano');
    }
    expect(new Set(c1.versoes.map((v) => v.hash)).size).toBe(2);
  });

  it('rodar de novo não duplica documento nem versão', async () => {
    const r = await chamar(plat, 'POST', `${A}/documentos/importar`);
    expect(await json(r)).toEqual({ ok: true, criados: 0, ja_existiam: 4, versoes: 0, ignorados_nao_aplicavel: 1, ignorados_sem_texto: 1 });
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM documentos WHERE project_id = 'proj-a'`).first<{ n: number }>())?.n).toBe(4);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM documento_versoes WHERE project_id = 'proj-a'`).first<{ n: number }>())?.n).toBe(6);
  });

  it('o outro projeto não foi tocado; importar nele traz o dele', async () => {
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM documentos WHERE project_id = 'proj-b'`).first<{ n: number }>())?.n).toBe(0);
    const r = await chamar(plat, 'POST', `${B}/documentos/importar`);
    expect(await json(r)).toMatchObject({ criados: 1, versoes: 1 });
  });

  it('deixa trilha com o projeto e não mexe nos controles nem nas versões antigas', async () => {
    const t = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action = 'documentos.importados' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(t?.project_id).toBeTruthy();
    expect(await env.DB.prepare(`SELECT description FROM compliance_controls WHERE id = 'imp-c6'`).first()).toEqual({ description: 'Texto novo' });
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM policy_versions WHERE control_id = 'imp-c1'`).first<{ n: number }>())?.n).toBe(2);
  });
});
