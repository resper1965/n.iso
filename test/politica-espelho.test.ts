import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedTwoProjects } from './helpers/d1';
import { descartarRascunho, espelharTexto, garantirDocumentoDoControle, hashDoTexto, salvarRascunho } from '../src/services/documentos';

const controle = (id: string, titulo: string, descricao: string | null, status = 'Implemented') =>
  env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?, 'proj-a', 'ISO 27001', ?, ?, ?)`)
    .bind(id, titulo, status, descricao);
const versao = (controleId: string, n: number, texto: string) =>
  env.DB.prepare(`INSERT INTO policy_versions (project_id, control_id, version, policy_text, created_by) VALUES ('proj-a', ?, ?, ?, 'autor@exemplo.com.br')`)
    .bind(controleId, n, texto);

const versoes = async (documentoId: string) =>
  (await env.DB.prepare(`SELECT numero, estado, texto, origem FROM documento_versoes WHERE documento_id = ? ORDER BY numero`).bind(documentoId).all<{ numero: number; estado: string; texto: string; origem: string }>()).results;
const doc = (controleId: string) =>
  env.DB.prepare(`SELECT id, status, titulo FROM documentos WHERE origem_control_id = ?`).bind(controleId).first<{ id: string; status: string; titulo: string }>();

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await env.DB.batch([
    controle('esp-hist', 'A.5.1 Com histórico', 'Texto v2'),
    versao('esp-hist', 1, 'Texto v1'),
    versao('esp-hist', 2, 'Texto v2'),
    controle('esp-cat', 'A.5.2 Só catálogo', 'Descrição do catálogo'),
    controle('esp-na', 'A.5.3 Não aplicável', 'Justificativa', 'Not Applicable'),
    versao('esp-na', 1, 'Texto antigo'),
  ]);
});

describe('garantirDocumentoDoControle', () => {
  it('com histórico de política, traz as versões antigas e deixa a última vigente', async () => {
    const id = await garantirDocumentoDoControle(env.DB, 'proj-a', 'esp-hist', 'ator@ness.lat');
    expect((await doc('esp-hist'))?.id).toBe(id);
    expect(await versoes(id)).toEqual([
      { numero: 1, estado: 'substituida', texto: 'Texto v1', origem: 'humano' },
      { numero: 2, estado: 'vigente', texto: 'Texto v2', origem: 'humano' },
    ]);
  });

  it('só com texto de catálogo (ou N/A), cria o documento vazio em rascunho, sem versões', async () => {
    for (const c of ['esp-cat', 'esp-na']) {
      const id = await garantirDocumentoDoControle(env.DB, 'proj-a', c, 'ator@ness.lat');
      expect(await doc(c), c).toMatchObject({ id, status: 'rascunho' });
      expect(await versoes(id), c).toEqual([]);
    }
  });

  it('chamar de novo devolve o mesmo documento e não duplica', async () => {
    const a = await garantirDocumentoDoControle(env.DB, 'proj-a', 'esp-hist', 'ator@ness.lat');
    const b = await garantirDocumentoDoControle(env.DB, 'proj-a', 'esp-hist', 'ator@ness.lat');
    expect(a).toBe(b);
    expect(await versoes(a)).toHaveLength(2);
  });

  it('controle de outro projeto ou inexistente: erro, sem criar nada', async () => {
    await expect(garantirDocumentoDoControle(env.DB, 'proj-b', 'esp-hist', 'x')).rejects.toThrow(/Controle não encontrado/);
    await expect(garantirDocumentoDoControle(env.DB, 'proj-a', 'nao-existe', 'x')).rejects.toThrow(/Controle não encontrado/);
  });

  it('duas chamadas ao mesmo tempo num controle novo acabam com um documento só', async () => {
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('esp-par', 'proj-a', 'ISO 27001', 'A.5.9 Paralelo', 'Missing')`).run();
    const [a, b] = await Promise.all([
      garantirDocumentoDoControle(env.DB, 'proj-a', 'esp-par', 'x'),
      garantirDocumentoDoControle(env.DB, 'proj-a', 'esp-par', 'x'),
    ]);
    expect(a).toBe(b);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM documentos WHERE origem_control_id = 'esp-par'`).first<{ n: number }>())?.n).toBe(1);
  });
});

describe('espelharTexto', () => {
  it('texto novo vira a versão vigente seguinte e a anterior fica substituída', async () => {
    const id = (await doc('esp-hist'))!.id;
    const r = await espelharTexto(env.DB, 'proj-a', id, 'Texto v3', 'ator@ness.lat', 'humano');
    expect(r).toEqual({ criada: true });
    expect((await versoes(id)).map((v) => [v.numero, v.estado])).toEqual([[1, 'substituida'], [2, 'substituida'], [3, 'vigente']]);
    expect((await env.DB.prepare(`SELECT status FROM documentos WHERE id = ?`).bind(id).first())).toEqual({ status: 'vigente' });
  });

  it('o mesmo texto da vigente não cria versão repetida', async () => {
    const id = (await doc('esp-hist'))!.id;
    expect(await espelharTexto(env.DB, 'proj-a', id, 'Texto v3', 'ator@ness.lat', 'humano')).toEqual({ criada: false });
    expect(await versoes(id)).toHaveLength(3);
  });

  it('em documento vazio cria a versão 1 já vigente, com o hash do texto', async () => {
    const id = (await doc('esp-cat'))!.id;
    await espelharTexto(env.DB, 'proj-a', id, 'Primeiro texto', 'ator@ness.lat', 'gerador');
    expect(await versoes(id)).toEqual([{ numero: 1, estado: 'vigente', texto: 'Primeiro texto', origem: 'gerador' }]);
    expect((await env.DB.prepare(`SELECT hash FROM documento_versoes WHERE documento_id = ?`).bind(id).first())).toEqual({ hash: await hashDoTexto('Primeiro texto') });
  });

  it('um rascunho pendente (do agente) sobrevive à edição direta', async () => {
    const id = (await doc('esp-hist'))!.id;
    await salvarRascunho(env.DB, 'proj-a', id, 'agente de x', 'Proposta do agente', 'agente');
    await espelharTexto(env.DB, 'proj-a', id, 'Texto v4', 'ator@ness.lat', 'humano');
    const estados = (await versoes(id)).map((v) => [v.texto, v.estado]);
    expect(estados).toContainEqual(['Proposta do agente', 'rascunho']);
    expect(estados).toContainEqual(['Texto v4', 'vigente']);
    expect((await versoes(id)).filter((v) => v.estado === 'vigente')).toHaveLength(1);
  });
});

describe('descartarRascunho', () => {
  it('apaga só o rascunho e mantém a vigente; sem rascunho dá 404', async () => {
    const id = (await doc('esp-hist'))!.id;
    expect(await descartarRascunho(env.DB, 'proj-a', id, 'ator@ness.lat')).toEqual({ ok: true });
    const estados = (await versoes(id)).map((v) => v.estado);
    expect(estados).not.toContain('rascunho');
    expect(estados).toContain('vigente');
    expect(await descartarRascunho(env.DB, 'proj-a', id, 'ator@ness.lat')).toMatchObject({ ok: false, status: 404 });
  });

  it('documento de outro projeto: 404', async () => {
    const id = (await doc('esp-hist'))!.id;
    expect(await descartarRascunho(env.DB, 'proj-b', id, 'x')).toMatchObject({ ok: false, status: 404 });
  });
});
