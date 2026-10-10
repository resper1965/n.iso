import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { lerCsv, MAX_LINHAS } from '../src/services/tratamentos-importar';

/** Fatia 4.4: importação do RoPA por planilha. Cria Draft, recusa linha a linha, não duplica ao reimportar. */
const P = 'ti-proj';
const OUTRO = 'ti-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

describe('lerCsv', () => {
  it('lê vírgula e ponto e vírgula, com campo entre aspas, aspas dobradas e quebra de linha dentro do campo', () => {
    expect(lerCsv('a,b,c\n1,"x, y",3\r\n"q""r","l1\nl2",z')).toEqual([['a', 'b', 'c'], ['1', 'x, y', '3'], ['q"r', 'l1\nl2', 'z']]);
    expect(lerCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('ignora BOM, linhas em branco e a quebra final; mantém campo vazio no meio', () => {
    expect(lerCsv('﻿a,b\n\n1,\n   ,  \n2,3\n')).toEqual([['a', 'b'], ['1', ''], ['2', '3']]);
  });
  it('arquivo vazio não tem linhas', () => {
    expect(lerCsv('')).toEqual([]);
  });
});

describe('POST /ropa/importar', () => {
  let consultor: Record<string, string>, cliente: Record<string, string>;
  const importar = (csv: string, h = consultor) => chamar(h, 'POST', `/api/v1/projects/${P}/ropa/importar`, { csv });
  const registros = async (projeto = P) => (await env.DB.prepare('SELECT * FROM ropa_records WHERE project_id = ? ORDER BY processing_purpose').bind(projeto).all<Record<string, unknown>>()).results;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ti', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ti-ja', ?, 'Folha de Pagamento'), ('ti-outro', ?, 'Cadastro de clientes')`).bind(P, OUTRO),
    ]);
    await habilitarPrivacy(P, OUTRO);
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
  });

  it('cria Draft com os campos mapeados, aceita cabeçalho com acento e sim/não, e pula o que já existe (sem acento nem caixa)', async () => {
    const csv = [
      'Finalidade;Categorias de dados;Titulares;Base legal;Retenção;Destinatários;Transferência internacional;Salvaguardas;DPIA requerido;Responsável',
      'Recrutamento;Currículo;Candidatos;Legítimo interesse;2 anos;RH;sim;Cláusulas-padrão;Não;DPO',
      'folha de pagamento;Dados financeiros;Colaboradores;;;;;;;',
      'Controle de acesso;Biometria;Colaboradores;Obrigação legal;5 anos;;nao;;sim;',
    ].join('\n');
    const r = await importar(csv);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await json(r)).toEqual({ ok: true, criados: 2, ja_existiam: 1, recusadas: [] });
    const rs = await registros();
    expect(rs.map((x) => x.processing_purpose)).toEqual(['Controle de acesso', 'Folha de Pagamento', 'Recrutamento']);
    const rec = rs.find((x) => x.processing_purpose === 'Recrutamento')!;
    expect(rec).toMatchObject({ status: 'Draft', data_categories: 'Currículo', data_subjects: 'Candidatos', legal_basis: 'Legítimo interesse', retention_period: '2 anos', recipients: 'RH', international_transfers: 1, transfer_safeguards: 'Cláusulas-padrão', dpia_required: 0, owner: 'DPO' });
    expect(rs.find((x) => x.processing_purpose === 'Controle de acesso')).toMatchObject({ international_transfers: 0, dpia_required: 1 });
  });

  it('reimportar o mesmo arquivo não duplica', async () => {
    const csv = 'finalidade\nReimporta A\nReimporta B';
    expect(await json(await importar(csv))).toMatchObject({ criados: 2, ja_existiam: 0 });
    expect(await json(await importar(csv))).toEqual({ ok: true, criados: 0, ja_existiam: 2, recusadas: [] });
    expect((await registros()).filter((x) => String(x.processing_purpose).startsWith('Reimporta'))).toHaveLength(2);
  });

  it('linha ruim não derruba as boas e vem no relatório com o número da linha e o motivo', async () => {
    const csv = [
      'finalidade,transferencia_internacional,retencao',
      'Boa 1,sim,1 ano',
      ',nao,sem finalidade',
      'Má transferência,talvez,1 ano',
      `Retenção enorme,nao,${'x'.repeat(600)}`,
      'Boa 2,nao,2 anos',
      'Boa 1,nao,duplicada no arquivo',
    ].join('\n');
    const r = await json<{ criados: number; ja_existiam: number; recusadas: { linha: number; motivo: string }[] }>(await importar(csv));
    expect(r.criados).toBe(2);
    expect(r.ja_existiam).toBe(1); // "Boa 1" repetida no próprio arquivo
    expect(r.recusadas.map((x) => x.linha)).toEqual([3, 4, 5]);
    expect(r.recusadas[1].motivo).toContain('transferencia_internacional');
    expect(r.recusadas[2].motivo).toContain('retention_period');
    expect((await registros()).map((x) => x.processing_purpose)).toEqual(expect.arrayContaining(['Boa 1', 'Boa 2']));
  });

  it('arquivo inválido é 400 e não cria nada: sem cabeçalho de finalidade, só cabeçalho, vazio, linhas demais, campo extra', async () => {
    const antes = (await registros()).length;
    for (const csv of ['categorias,titulares\nx,y', 'finalidade', '   \n  ', `finalidade\n${Array.from({ length: MAX_LINHAS + 1 }, (_, i) => `F${i}`).join('\n')}`]) {
      expect((await importar(csv)).status, csv.slice(0, 30)).toBe(400);
    }
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/importar`, { csv: 'finalidade\nX', extra: 1 })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/importar`, {})).status).toBe(400);
    expect((await registros()).length).toBe(antes);
  });

  it('importa só no projeto da URL, não toca o de outro projeto, e o papel de leitura recebe 403', async () => {
    const antes = (await registros(OUTRO)).length;
    await importar('finalidade\nSó no projeto certo');
    expect((await registros(OUTRO)).length).toBe(antes);
    expect((await importar('finalidade\nNão deve entrar', cliente)).status).toBe(403);
    expect((await registros()).some((x) => x.processing_purpose === 'Não deve entrar')).toBe(false);
  });

  it('a importação entra na trilha com as contagens', async () => {
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ropa.importar' AND project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(P).first<{ details: string }>();
    expect(log!.details).toMatch(/\d+ criados, \d+ já existiam, \d+ recusadas/);
  });
});
