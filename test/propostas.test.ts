import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import JSZip from 'jszip';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { diagnosticoDe } from '../src/services/diagnostico';
import { SECOES_EDITAVEIS } from '../src/services/documento-proposta';
import { SECOES_EDITAVEIS_SCHEMA } from '../src/schemas/domain';

const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(
    new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'X-Agente-Confirmado': '1' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE } as any,
  );

const X = '<script>alert(1)</script><img src=x onerror=alert(2)>" onclick="alert(3)';
const ANO = new Date().getFullYear();
const RESPOSTAS: Record<string, string> = { iam: 'Sem IAM centralizado', backup: 'Backup automático sem teste de restore', headcount: '120' };

const projeto = {
  nome: 'Implementação ISO 27001', norma: 'ISO/IEC 27001', tipo: 'projeto', descricao: 'Implementação completa.',
  diasPorFaixa: { '1': 60, '2': 90, '3': 140 },
  fases: [
    { nome: 'Diagnóstico', objetivo: 'Fechar o escopo.', atividades: 'Entrevistas.', entregaveis: 'Escopo.', criterioAceite: 'Aprovado.', pct: 40, semanas: 2 },
    { nome: 'Implementação', objetivo: 'Operar.', atividades: 'Procedimentos.', entregaveis: 'Evidências.', criterioAceite: 'Ok.', pct: 60, semanas: 6 },
  ],
};
const avulso = {
  nome: 'Treinamento LGPD', tipo: 'avulso', formaPreco: 'fixo', valorFixo: 8200, descricao: `Turma ${X}`,
  entregaveis: ['Turma de 4 h'], criterioAceite: 'Turma realizada.',
};

describe('rotas /api/v1/propostas', () => {
  let adm: Record<string, string>, com: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
  let srvProjeto: string, srvAvulso: string;

  const criar = async (corpo: Record<string, unknown> = {}) => {
    const r = await chamar('POST', '/api/v1/propostas', com, { leadId: 'lead-sem', itens: [{ servicoId: srvAvulso }], ...corpo });
    expect(r.status, await r.clone().text()).toBe(201);
    return r.json<any>();
  };
  const gerar = (id: string, corpo: Record<string, unknown> = {}, h = com) => chamar('POST', `/api/v1/propostas/${id}/gerar`, h, corpo);
  const ler = async (id: string) => (await chamar('GET', `/api/v1/propostas/${id}`, com)).json<any>();
  const html = async (id: string) => (await chamar('GET', `/api/v1/propostas/${id}/documento`, com)).text();

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cons','cons@ness.lat','x','Cons','consultor',NULL)`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, razao_social, cnpj, porte) VALUES ('lead-diag','Diag','Diag Ltda.','11222333000181','DEMAIS')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, cnpj) VALUES ('lead-sem','Sem Diagnóstico','11222333000182')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, razao_social) VALUES ('lead-x','X', ?)`).bind(`Cli ${X}`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, org_id) VALUES ('lead-b','Da outra','org_b')`),
      env.DB.prepare(`INSERT INTO assessments (id, lead_id, client_name) VALUES ('as-1','lead-diag','Diag')`),
      ...Object.entries(RESPOSTAS).map(([k, v], i) =>
        env.DB.prepare(`INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer) VALUES (?, 'as-1', 1, ?, ?, ?)`).bind(`aa-${i}`, k, k, v)),
      env.DB.prepare(`INSERT INTO servicos (id, org_id, nome, tipo, forma_preco, valor_fixo, entregaveis, criterio_aceite) VALUES ('srv-b','org_b','Do outro','avulso','fixo',1000,'["x"]','ok')`),
      env.DB.prepare(`INSERT INTO propostas (id, org_id, cliente, criada_por) VALUES ('prop-b','org_b','Alheio','x')`),
    ]);
    adm = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
    com = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' });
    consultor = await sessionFor({ id: 'u-con', email: 'con@ness.lat', role: 'consultor' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p-a' });
    srvProjeto = (await (await chamar('POST', '/api/v1/servicos', com, projeto)).json<any>()).id;
    srvAvulso = (await (await chamar('POST', '/api/v1/servicos', com, avulso)).json<any>()).id;
  }, 60_000);

  it('a lista de seções editáveis do schema é a do documento', () => {
    expect([...SECOES_EDITAVEIS_SCHEMA]).toEqual(SECOES_EDITAVEIS);
  });

  it('cria rascunho a partir do lead com diagnóstico: faixa e pessoas vêm do diagnóstico', async () => {
    const p = await criar({ leadId: 'lead-diag', itens: [{ servicoId: srvProjeto, descontoPct: 10 }, { servicoId: srvAvulso }] });
    const dg = diagnosticoDe(RESPOSTAS);
    expect(p).toMatchObject({ status: 'rascunho', numero: null, revisao: 1, cliente: 'Diag Ltda.', assessment_id: 'as-1', lead_id: 'lead-diag' });
    expect(p.memoria).toMatchObject({ faixa: dg.faixa, pessoas: 120, origem: 'diagnóstico' });
    expect(p.memoria.itens[0]).toContain(`${dg.faixaNome}:`);
    expect(p.memoria.itens[0]).toContain('120 pessoas');
    expect(p.itens).toHaveLength(2);
    expect(p.itens[0]).toMatchObject({ servico_id: srvProjeto, desconto_pct: 10, ordem: 0 });
    expect(p.itens[0].servico.nome).toBe('Implementação ISO 27001');
    expect(p.total_projeto).toBe(p.itens[0].valor + p.itens[1].valor);
    expect(p.margem).toHaveProperty('margemPct');
  }, 30_000);

  it('sem diagnóstico: faixa Standard e pessoas nulo, visível na memória', async () => {
    const p = await criar({ itens: [{ servicoId: srvProjeto }] });
    expect(p.assessment_id).toBeNull();
    expect(p.memoria).toMatchObject({ faixa: '2', pessoas: null });
    expect(p.memoria.origem).toMatch(/sem diagnóstico/);
    expect(p.memoria.itens[0]).toContain('Standard');
    expect(p.memoria.itens[0]).toContain('porte não informado');
  }, 30_000);

  it('corpo inválido, serviço de outra organização e lead de outra organização', async () => {
    expect((await chamar('POST', '/api/v1/propostas', com, { leadId: 'lead-sem', itens: [], extra: 1 })).status).toBe(400);
    expect((await chamar('POST', '/api/v1/propostas', com, { leadId: 'lead-sem', itens: [{ servicoId: 'srv-b' }] })).status).toBe(400);
    expect((await chamar('POST', '/api/v1/propostas', com, { leadId: 'lead-b', itens: [] })).status).toBe(404);
  }, 30_000);

  it('consultor e cliente levam 403; o agente leva 403 de área comercial', async () => {
    const p = await criar();
    for (const h of [consultor, cliente]) {
      expect((await chamar('GET', '/api/v1/propostas', h)).status).toBe(403);
      expect((await chamar('GET', `/api/v1/propostas/${p.id}`, h)).status).toBe(403);
      expect((await chamar('GET', `/api/v1/propostas/${p.id}/documento`, h)).status).toBe(403);
      expect((await chamar('POST', '/api/v1/propostas', h, { leadId: 'lead-sem', itens: [] })).status).toBe(403);
    }
    for (const r of [await comoAgente('GET', '/api/v1/propostas'), await comoAgente('POST', `/api/v1/propostas/${p.id}/gerar`, {})]) {
      expect(r.status).toBe(403);
      expect((await r.json<any>()).error).toMatch(/fora do alcance do agente \(área comercial\)/);
    }
  }, 30_000);

  it('proposta de outra organização: 404 em tudo e fora da lista', async () => {
    for (const [m, s] of [['GET', ''], ['PUT', ''], ['GET', '/previa'], ['POST', '/gerar'], ['POST', '/aprovar-desconto'], ['POST', '/revisao'], ['GET', '/docx'], ['GET', '/documento']]) {
      const r = await chamar(m, `/api/v1/propostas/prop-b${s}`, m === 'POST' && s === '/aprovar-desconto' ? adm : com, m === 'GET' ? undefined : {});
      expect(r.status, `${m} ${s}`).toBe(404);
    }
    const lista = await (await chamar('GET', '/api/v1/propostas', com)).json<any[]>();
    expect(lista.map((p) => p.id)).not.toContain('prop-b');
    expect(lista.length).toBeGreaterThan(0);
  }, 30_000);

  it('secoesEditadas: seção de dados → 400, texto acima de 30 mil → 400, null restaura', async () => {
    const p = await criar();
    expect((await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { secoesEditadas: { investimento: 'x' } })).status).toBe(400);
    expect((await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { secoesEditadas: { sobre: 'x'.repeat(30_001) } })).status).toBe(400);
    let r = await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { secoesEditadas: { sobre: 'Somos outra coisa.', termos: 'Termos nossos.' } });
    expect(r.status).toBe(200);
    expect((await r.json<any>()).secoes_editadas).toEqual({ sobre: 'Somos outra coisa.', termos: 'Termos nossos.' });
    r = await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { secoesEditadas: { termos: null } });
    expect((await r.json<any>()).secoes_editadas).toEqual({ sobre: 'Somos outra coisa.' });
    const previa = await (await chamar('GET', `/api/v1/propostas/${p.id}/previa`, com)).json<any>();
    expect(previa.conteudo.secoes.find((s: any) => s.id === 'sobre')).toMatchObject({ editada: true });
    expect(previa.html).toContain('Somos outra coisa.');
    expect(previa.conteudo.numero).toMatch(new RegExp(`^NESS-${ANO}-\\d{3}$`));
    expect((await ler(p.id)).status).toBe('rascunho');
  }, 30_000);

  it('prévia devolve o texto de cada seção editável presente, para a tela pré-preencher', async () => {
    const p = await criar({ contexto: 'A empresa cresce.\n\n- vende para bancos' }); // avulso sozinho: sem "Como trabalhamos"
    await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { secoesEditadas: { sobre: 'Primeiro.\n\n- item um\n- item dois' } });
    const previa = await (await chamar('GET', `/api/v1/propostas/${p.id}/previa`, com)).json<any>();
    // o sumário é o contexto em texto simples; os indicadores (dados) não entram no texto
    expect(previa.textos.sumario).toBe('A empresa cresce.\n\n- vende para bancos');
    expect(previa.textos.sobre).toBe('Primeiro.\n\n- item um\n- item dois');
    expect(previa.textos).not.toHaveProperty('como_trabalhamos');
    expect(previa.textos).not.toHaveProperty('investimento');
    expect(Object.keys(previa.textos).every((k) => (SECOES_EDITAVEIS as string[]).includes(k))).toBe(true);
  }, 30_000);

  it('Review 1: desconto acima do teto não chega a gerada sem aprovação do platform_admin', async () => {
    const p = await criar({ itens: [{ servicoId: srvAvulso, descontoPct: 20 }] });
    let r = await gerar(p.id);
    expect(r.status).toBe(409);
    expect((await r.json<any>()).error).toMatch(/teto de 15%/);
    let lida = await ler(p.id);
    expect(lida).toMatchObject({ status: 'aguardando_aprovacao', numero: null, documento_hash: null });

    expect((await gerar(p.id)).status).toBe(409);
    expect((await chamar('POST', `/api/v1/propostas/${p.id}/aprovar-desconto`, com)).status).toBe(403);
    r = await chamar('POST', `/api/v1/propostas/${p.id}/aprovar-desconto`, adm);
    expect(r.status).toBe(200);
    lida = await r.json<any>();
    expect(lida).toMatchObject({ status: 'rascunho', desconto_aprovado_por: 'adm@ness.lat' });
    expect(lida.desconto_aprovado_em).toBeTruthy();
    expect((await gerar(p.id)).status).toBe(200);
  }, 30_000);

  it('aprovação cai se os itens mudam depois dela', async () => {
    const p = await criar({ itens: [{ servicoId: srvAvulso, descontoPct: 20 }] });
    await gerar(p.id);
    await chamar('POST', `/api/v1/propostas/${p.id}/aprovar-desconto`, adm);
    const r = await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { itens: [{ servicoId: srvAvulso, descontoPct: 40 }] });
    expect(await r.json<any>()).toMatchObject({ status: 'rascunho', desconto_aprovado_por: null });
    expect((await gerar(p.id)).status).toBe(409);
  }, 30_000);

  it('Review 2: geração automática dá números consecutivos; manual com formato estranho → 400; repetido → 409', async () => {
    const a = await criar(), b = await criar();
    const ra = await gerar(a.id), rb = await gerar(b.id);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    const na = Number((await ra.json<any>()).numero.split('-')[2]);
    const nb = Number((await rb.json<any>()).numero.split('-')[2]);
    expect(nb).toBe(na + 1);

    const c = await criar();
    for (const ruim of [` NESS-${ANO}-500`, `ness-${ANO}-500`, `ABC-${ANO}-500`, `NESS-${ANO}-5`, `NESS-${ANO}-500 `, 'NESS-26-500']) {
      expect((await gerar(c.id, { numero: ruim })).status, ruim).toBe(400);
    }
    expect((await gerar(c.id, { numero: `NESS-${ANO}-500` })).status).toBe(200);
    const d = await criar();
    const r = await gerar(d.id, { numero: `NESS-${ANO}-500` });
    expect(r.status).toBe(409);
    expect((await r.json<any>()).error).toMatch(/já usado/);
    expect((await ler(d.id)).status).toBe('rascunho');
    // número manual à frente da sequência: a automática segue dele, sem colidir
    const rd = await gerar(d.id);
    expect((await rd.json<any>()).numero).toBe(`NESS-${ANO}-501`);
    const { n } = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM propostas WHERE org_id = 'org_ness' AND numero = ?`).bind(`NESS-${ANO}-500`).first<any>());
    expect(n).toBe(1);
  }, 60_000);

  it('a violação do índice único vira 409, não 500', async () => {
    const p = await criar();
    // a sequência aponta para um número já usado (ajuste manual da configuração)
    const { numero } = (await env.DB.prepare(`SELECT numero FROM propostas WHERE org_id = 'org_ness' AND numero IS NOT NULL ORDER BY numero LIMIT 1`).first<any>());
    const usado = Number(numero.split('-')[2]);
    await env.DB.prepare(`UPDATE organizations SET proximo_numero = ? WHERE id = 'org_ness'`).bind(usado).run();
    const r = await gerar(p.id);
    expect(r.status).toBe(409);
    expect((await ler(p.id)).status).toBe('rascunho');
    await env.DB.prepare(`UPDATE organizations SET proximo_numero = 900 WHERE id = 'org_ness'`).run();
  }, 30_000);

  it('Review 3: HTML nos campos livres, no nome do cliente e no catálogo sai escapado', async () => {
    const p = await criar({
      leadId: 'lead-x', contexto: X, escopo: X, observacoes: X,
      itens: [{ servicoId: srvAvulso, textoCliente: X }],
    });
    expect((await gerar(p.id)).status).toBe(200);
    const doc = await html(p.id);
    expect(doc).not.toMatch(/<script/i);
    expect(doc).not.toMatch(/<img/i);
    expect(doc).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    expect(doc).toContain('&lt;script&gt;');
    expect(doc).toContain('Cli &lt;script&gt;');
  }, 30_000);

  it('Review 4: proposta gerada não muda por PUT nem por segunda geração', async () => {
    const p = await criar();
    const g = await (await gerar(p.id)).json<any>();
    expect(g.status).toBe('gerada');
    expect(g.documento_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { contexto: 'outro' })).status).toBe(409);
    expect((await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { itens: [{ servicoId: srvProjeto }] })).status).toBe(409);
    expect((await gerar(p.id)).status).toBe(409);
    const depois = await ler(p.id);
    expect(depois.documento_hash).toBe(g.documento_hash);
    expect(depois.numero).toBe(g.numero);
    expect(await html(p.id)).toBe((await env.DB.prepare('SELECT documento_html FROM propostas WHERE id = ?').bind(p.id).first<any>()).documento_html);
  }, 30_000);

  it('Review 5: catálogo alterado depois da geração não muda documento nem hash; a revisão copia o item congelado', async () => {
    const p = await criar({ itens: [{ servicoId: srvAvulso }] });
    const g = await (await gerar(p.id)).json<any>();
    const antes = await html(p.id);
    const r = await chamar('PUT', `/api/v1/servicos/${srvAvulso}`, com, { ...avulso, valorFixo: 99000, descricao: 'Mudou tudo.' });
    expect(r.status).toBe(200);
    expect(await html(p.id)).toBe(antes);
    expect((await ler(p.id)).documento_hash).toBe(g.documento_hash);
    expect(await (await chamar('GET', `/api/v1/propostas/${p.id}/documento`, com)).text()).not.toContain('Mudou tudo.');

    const rev = await (await chamar('POST', `/api/v1/propostas/${p.id}/revisao`, com)).json<any>();
    expect(rev.itens[0].servico).toEqual(g.itens[0].servico);
    expect(rev.itens[0].valor).toBe(g.itens[0].valor);
    await chamar('PUT', `/api/v1/servicos/${srvAvulso}`, com, avulso);
  }, 30_000);

  it('revisão: mesmo número, revisao + 1, rascunho; a anterior vira substituida ao gerar a nova', async () => {
    const p = await criar({ secoesEditadas: undefined });
    expect((await chamar('POST', `/api/v1/propostas/${p.id}/revisao`, com)).status).toBe(409); // rascunho
    const g = await (await gerar(p.id)).json<any>();
    const r = await chamar('POST', `/api/v1/propostas/${p.id}/revisao`, com);
    expect(r.status).toBe(201);
    const rev = await r.json<any>();
    expect(rev).toMatchObject({ numero: g.numero, revisao: 2, status: 'rascunho', documento_hash: null });
    expect(rev.id).not.toBe(p.id);
    expect((await chamar('POST', `/api/v1/propostas/${p.id}/revisao`, com)).status).toBe(409); // já existe a rev. 2
    expect((await ler(p.id)).status).toBe('gerada');

    expect((await gerar(rev.id, { numero: `NESS-${ANO}-777` })).status).toBe(400);
    const gr = await gerar(rev.id);
    expect(gr.status).toBe(200);
    expect(await gr.json<any>()).toMatchObject({ numero: g.numero, revisao: 2, status: 'gerada' });
    expect((await ler(p.id)).status).toBe('substituida');
    expect(await html(rev.id)).toContain(`${g.numero} rev. 2`);
  }, 30_000);

  it('seção editada aparece no HTML congelado e no Word; docx de rascunho → 409', async () => {
    const p = await criar({ itens: [{ servicoId: srvProjeto }] });
    await chamar('PUT', `/api/v1/propostas/${p.id}`, com, { secoesEditadas: { premissas: 'Premissa só desta proposta.' } });
    expect((await chamar('GET', `/api/v1/propostas/${p.id}/docx`, com)).status).toBe(409);
    expect((await chamar('GET', `/api/v1/propostas/${p.id}/documento`, com)).status).toBe(409);
    const g = await (await gerar(p.id)).json<any>();

    const doc = await chamar('GET', `/api/v1/propostas/${p.id}/documento`, com);
    expect(doc.status).toBe(200);
    expect(doc.headers.get('Content-Type')).toMatch(/^text\/html/);
    expect(doc.headers.get('Content-Security-Policy')).toBe("default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com");
    expect(await doc.text()).toContain('Premissa só desta proposta.');

    const w = await chamar('GET', `/api/v1/propostas/${p.id}/docx`, com);
    expect(w.status).toBe(200);
    expect(w.headers.get('Content-Disposition')).toBe(`attachment; filename="${g.numero}-rev1.docx"`);
    expect(w.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const bytes = new Uint8Array(await w.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Premissa só desta proposta.');
    expect(xml).toContain(`Cópia de trabalho. Vale a versão ${g.numero} rev. 1 do n.iso, hash ${g.documento_hash.slice(0, 8)}.`);
  }, 30_000);

  it('cada ato fica na trilha; a geração registra número e hash', async () => {
    const { results } = await env.DB.prepare(`SELECT action, details FROM audit_logs WHERE action LIKE 'proposta.%'`).all<any>();
    const acoes = results.map((r) => r.action);
    expect(acoes).toEqual(expect.arrayContaining(['proposta.criada', 'proposta.editada', 'proposta.gerada', 'proposta.desconto_aprovado', 'proposta.revisao']));
    const gerada = results.find((r) => r.action === 'proposta.gerada');
    expect(gerada.details).toMatch(new RegExp(`NESS-${ANO}-\\d{3}.*[0-9a-f]{64}`));
    // a tentativa recusada não deixa linha de gerada
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'proposta.gerada'`).first<any>();
    const { g } = await env.DB.prepare(`SELECT COUNT(*) AS g FROM propostas WHERE documento_hash IS NOT NULL`).first<any>();
    expect(n).toBe(g);
  });
});
