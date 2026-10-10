import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { montarDiagrama, rotuloMermaid } from '../src/services/tratamentos';

/** Fatia 4.2: o Mermaid sai das ligações, nunca é guardado, e nome do cadastro não vira sintaxe nem HTML. */
const P = 'td-proj';
const OUTRO = 'td-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

describe('rotuloMermaid', () => {
  it('tira o que quebra a sintaxe ou vira HTML, e limita o tamanho', () => {
    expect(rotuloMermaid('Folha "de" [pagamento] {x} <b>y</b> `z` #1 | a\\b; fim')).toBe('Folha de pagamento x by/b z 1 ab fim');
    expect(rotuloMermaid('linha 1\nlinha 2\r\n\tlinha 3')).toBe('linha 1 linha 2 linha 3');
    expect(rotuloMermaid('a'.repeat(200)).length).toBe(80);
    expect(rotuloMermaid('a'.repeat(200)).endsWith('…')).toBe(true);
    expect(rotuloMermaid('   ')).toBe('—');
    expect(rotuloMermaid(null)).toBe('—');
  });
});

describe('montarDiagrama', () => {
  const vazio = { aprovacao: { ciso: null, ceo: null }, lia: { exigida: false, existe: false, status: null }, dpias: [], dpia_pendente: false, terceiros_com_avaliacao_vencida: [], base_legal: null, itens: [], departamentos: [], partes: [], transferencias: [] };

  it('registro sem ligação é só o nó do tratamento', () => {
    expect(montarDiagrama({ finalidade: 'Folha', titulares: null }, vazio)).toBe('flowchart LR\n  n0["Folha"]');
  });

  it('desenha titulares, departamentos, itens, partes e transferências, cada um no seu sentido', () => {
    const d = montarDiagrama({ finalidade: 'Folha', titulares: 'Colaboradores' }, {
      ...vazio,
      departamentos: [{ id: 'd', nome: 'RH' }],
      itens: [{ id: 'i', nome: 'ERP', tipo: 'sistema' }],
      partes: [{ vinculo_id: 'v', parte_id: 'p', nome: 'Operadora', tipo: 'organizacao', papel: 'operador' }],
      transferencias: [{ id: 't', pais: 'Chile', destinatario_parte_id: null, destinatario: null, mecanismo: 'cláusulas', observacao: null }],
    });
    expect(d.split('\n')).toEqual([
      'flowchart LR',
      '  n0["Folha"]',
      '  n1["Titulares: Colaboradores"]', '  n1 --> n0',
      '  n2["Depto: RH"]', '  n2 --> n0',
      '  n3["ERP (sistema)"]', '  n0 --> n3',
      '  n4["Operadora (operador)"]', '  n0 --- n4',
      '  n5["Destinatário não informado"]', '  n0 -->|"Chile · cláusulas"| n5',
    ]);
  });

  it('nome hostil nunca fecha o rótulo nem injeta nó ou HTML', () => {
    const d = montarDiagrama({ finalidade: 'x"] --> evil["y', titulares: '<script>alert(1)</script>' }, {
      ...vazio, itens: [{ id: 'i', nome: 'Sistema\n  n9["injetado"]', tipo: 'sistema' }],
    });
    expect(d).not.toContain('<script>');
    expect(d).not.toContain('evil[');
    expect(d.split('\n').filter((l) => /^\s*n\d+\[/.test(l))).toHaveLength(3); // só os 3 nós legítimos
    expect(d.match(/"/g)!.length % 2).toBe(0); // aspas sempre em par
  });
});

describe('rota do diagrama', () => {
  let consultor: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-td', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
      env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('it1', ?1, 'ERP', 'sistema'), ('it-o', ?2, 'Sistema do Outro Projeto', 'sistema')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_subjects) VALUES ('rd1', ?1, 'Folha de pagamento', 'Colaboradores'), ('rd-o', ?2, 'Do outro', NULL)`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('rd1', 'it1', ?1), ('rd-o', 'it-o', ?2)`).bind(P, OUTRO),
    ]);
    await habilitarPrivacy(P, OUTRO);
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  });

  it('devolve o Mermaid refeito do cadastro e não traz nada do outro projeto', async () => {
    const r = await json<{ mermaid: string }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/rd1/diagrama`));
    expect(r.mermaid).toContain('Folha de pagamento');
    expect(r.mermaid).toContain('ERP (sistema)');
    expect(r.mermaid).not.toContain('Outro');
  });

  it('muda quando a ligação muda (não é texto guardado)', async () => {
    await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/rd1/itens`, { itens: [] });
    const r = await json<{ mermaid: string }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/rd1/diagrama`));
    expect(r.mermaid).not.toContain('ERP');
  });

  it('registro de outro projeto ou inexistente é 404', async () => {
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/rd-o/diagrama`)).status).toBe(404);
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/nao-existe/diagrama`)).status).toBe(404);
  });
});
