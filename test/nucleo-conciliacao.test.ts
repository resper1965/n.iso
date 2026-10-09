import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, inserirAtivo } from './helpers/d1';

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

const partes = async (base: string) => json<{ id: string; nome: string; tipo: string }[]>(await chamar(plat, 'GET', `${base}/partes`));
const vinculosDe = async (parteId: string) =>
  (await env.DB.prepare('SELECT papel, alvo_tipo, alvo_id FROM parte_vinculos WHERE parte_id = ? ORDER BY papel, alvo_tipo').bind(parteId).all()).results;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES
      ('proj-a', 'Ana Exemplo', 'Ana@Exemplo.com.br', 'dpo', 'Encarregada'),
      ('proj-a', 'Beto Exemplo', NULL, 'tech', 'Líder de TI'),
      ('proj-a', 'Consultor da Ness', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('proj-b', 'ana exemplo', NULL, 'dpo', 'Encarregada')`),
    env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES ('v1', 'proj-a', 'Fornecedora Exemplo')`),
    env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name) VALUES ('s1', 'proj-a', 'Regulador Exemplo')`),
  ]);
});

describe('importar as pessoas do projeto', () => {
  it('traz governança, fornecedores e partes interessadas; o consultor da ness. fica de fora', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes/importar`);
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ ok: true, criadas: 4, reaproveitadas: 0, vinculos: 4 });

    const todas = await partes(A);
    expect(todas.map((p) => p.nome).sort()).toEqual(['Ana Exemplo', 'Beto Exemplo', 'Fornecedora Exemplo', 'Regulador Exemplo']);
    const por = (nome: string) => todas.find((p) => p.nome === nome)!;
    expect(por('Ana Exemplo')).toMatchObject({ tipo: 'pessoa' });
    expect(por('Fornecedora Exemplo')).toMatchObject({ tipo: 'organizacao' });
    expect(await vinculosDe(por('Ana Exemplo').id)).toEqual([{ papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await vinculosDe(por('Beto Exemplo').id)).toEqual([{ papel: 'responsavel', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await vinculosDe(por('Fornecedora Exemplo').id)).toEqual([{ papel: 'terceiro', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await vinculosDe(por('Regulador Exemplo').id)).toEqual([{ papel: 'parte_interessada', alvo_tipo: 'projeto', alvo_id: 'proj-a' }]);
    expect(await env.DB.prepare(`SELECT email FROM partes WHERE nome = 'Ana Exemplo' AND project_id = 'proj-a'`).first()).toEqual({ email: 'ana@exemplo.com.br' });
  });

  it('rodar de novo não duplica parte nem vínculo', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes/importar`);
    expect(await json(r)).toEqual({ ok: true, criadas: 0, reaproveitadas: 4, vinculos: 0 });
    expect(await partes(A)).toHaveLength(4);
  });

  it('o outro projeto não foi tocado, e uma parte que já existia (outra caixa) é reaproveitada', async () => {
    expect(await partes(B)).toEqual([]);
    await chamar(plat, 'POST', `${B}/partes`, { nome: 'ANA  EXEMPLO' });
    const r = await chamar(plat, 'POST', `${B}/partes/importar`);
    expect(await json(r)).toEqual({ ok: true, criadas: 0, reaproveitadas: 1, vinculos: 1 });
    expect(await partes(B)).toHaveLength(1);
  });
});

describe('conciliar o responsável em texto com a parte', () => {
  let ana: string;
  beforeAll(async () => {
    ana = (await partes(A)).find((p) => p.nome === 'Ana Exemplo')!.id;
    await chamar(plat, 'POST', `${A}/partes`, { nome: 'Duplicada Exemplo' });
    await chamar(plat, 'POST', `${A}/partes`, { nome: 'duplicada exemplo' });
    await chamar(plat, 'POST', `${A}/partes`, { nome: 'José Exemplo' });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, owner) VALUES
        ('r1', 'proj-a', 'A', 'T', ' ana   exemplo '), ('r2', 'proj-a', 'A', 'T', 'TI'), ('r3', 'proj-a', 'A', 'T', 'Duplicada Exemplo'),
        ('r4', 'proj-a', 'A', 'T', 'Jose Exemplo'), ('r5', 'proj-a', 'A', 'T', 'JOSÉ EXEMPLO'), ('rB', 'proj-b', 'A', 'T', 'Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, owner) VALUES
        ('c1', 'proj-a', 'ISO 27001', 'A.5.1', 'TI'), ('c2', 'proj-a', 'ISO 27001', 'A.5.2', 'TI'), ('c3', 'proj-a', 'ISO 27001', 'A.5.3', 'TI')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, owner) VALUES ('ro1', 'proj-a', 'Folha', 'Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, assigned_to) VALUES ('ca1', 'proj-a', 'CAPA', 'Beto Exemplo')`),
      env.DB.prepare(`INSERT INTO checklist_progress (project_id, phase_number, item_id, assigned_to) VALUES ('proj-a', 1, 'i1', 'Ana Exemplo')`),
    ]);
    await inserirAtivo({ id: 'it1', project_id: 'proj-a', name: 'ERP', owner: 'Ana Exemplo' });
    await inserirAtivo({ id: 'it2', project_id: 'proj-a', name: 'CRM', owner: 'Quem?' });
  });

  it('liga o que casa, relata o que não casou e o que é ambíguo, e não apaga o texto', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes/conciliar`);
    expect(r.status).toBe(200);
    const rel = await json<{ casados: Record<string, number>; sem_correspondencia: unknown[]; ambiguos: unknown[] }>(r);
    expect(rel.casados).toEqual({ risks: 2, compliance_controls: 0, ropa_records: 1, corrective_actions: 1, checklist_progress: 1, itens: 1 });
    expect(rel.sem_correspondencia).toEqual([
      { tabela: 'compliance_controls', coluna: 'owner', texto: 'TI', n: 3 },
      { tabela: 'itens', coluna: 'responsavel_texto', texto: 'Quem?', n: 1 },
      { tabela: 'risks', coluna: 'owner', texto: 'Jose Exemplo', n: 1 },
      { tabela: 'risks', coluna: 'owner', texto: 'TI', n: 1 },
    ]);
    expect(rel.ambiguos).toEqual([{ tabela: 'risks', coluna: 'owner', texto: 'Duplicada Exemplo', n: 1 }]);

    const linha = (id: string) => env.DB.prepare('SELECT owner, owner_parte_id FROM risks WHERE id = ?').bind(id).first();
    expect(await linha('r1')).toEqual({ owner: ' ana   exemplo ', owner_parte_id: ana });
    expect(await linha('r5')).toMatchObject({ owner_parte_id: (await partes(A)).find((p) => p.nome === 'José Exemplo')!.id }); // com acento casa
    expect(await linha('r4')).toEqual({ owner: 'Jose Exemplo', owner_parte_id: null }); // sem acento, não
    expect(await linha('r3')).toEqual({ owner: 'Duplicada Exemplo', owner_parte_id: null });
    expect(await linha('rB')).toEqual({ owner: 'Ana Exemplo', owner_parte_id: null }); // outro projeto
    expect(await vinculosDe(ana)).toContainEqual({ papel: 'responsavel', alvo_tipo: 'item', alvo_id: 'it1' });
  });

  it('rodar de novo não liga nada a mais, e repete o relatório do que falta', async () => {
    const rel = await json<{ casados: Record<string, number>; sem_correspondencia: unknown[] }>(await chamar(plat, 'POST', `${A}/partes/conciliar`));
    expect(Object.values(rel.casados).every((n) => n === 0)).toBe(true);
    expect(rel.sem_correspondencia).toHaveLength(4);
    expect((await vinculosDe(ana)).filter((v) => v.alvo_tipo === 'item')).toHaveLength(1);
  });

  it('deixa trilha com o projeto', async () => {
    const t = await env.DB.prepare(`SELECT project_id FROM audit_logs WHERE action = 'partes.conciliadas' ORDER BY created_at DESC LIMIT 1`).first<{ project_id: string }>();
    expect(t?.project_id).toBe('proj-a');
  });
});
