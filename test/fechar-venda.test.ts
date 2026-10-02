// fecharVenda (fatia 4, Tarefa 2): uma rotina única, idempotente e atômica que fecha a venda.
// D1 real: a guarda do batch e o índice único só se provam no banco de verdade.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { fecharVenda, type EntradaFechamento } from '../src/services/fechar-venda';
import { PHASE_TITLES } from '../src/constants';

const db = () => env.DB as D1Database;

const PROJETO = {
  nome: 'Implementação ISO 27001', norma: 'ISO/IEC 27001', tipo: 'projeto', descricao: '', premissas: [], exclusoes: [],
  diasPorFaixa: { '1': 60, '2': 90, '3': 140 },
  fases: [
    { nome: 'Diagnóstico', objetivo: '', atividades: '', entregaveis: '', criterioAceite: '', pct: 40, semanas: 2 },
    { nome: 'Implementação', objetivo: '', atividades: '', entregaveis: '', criterioAceite: '', pct: 60, semanas: 6 },
  ],
};
const MSSP = { nome: 'SOC gerenciado', norma: '', tipo: 'recorrente', descricao: '', premissas: [], exclusoes: [], mensalidade: 5000, prazoMinimoMeses: 6, inclusoMes: ['Monitoramento'] };
const DPO = { nome: 'DPO as a service', norma: 'LGPD', tipo: 'recorrente', descricao: '', premissas: [], exclusoes: [], mensalidade: 2000, prazoMinimoMeses: 12, inclusoMes: ['Atendimento'] };

let seq = 0;
/** Proposta nova com itens; devolve o id. Cada teste usa a sua (o storage é por arquivo). */
async function proposta(o: { status?: string; org?: string; itens?: { servico: any; valor: number; meses?: number }[]; consultor?: string | null; total?: number; mensal?: number } = {}) {
  const id = `prop-${String(++seq).padStart(3, '0')}`;
  const leadId = `lead-${seq}`;
  const itens = o.itens ?? [{ servico: PROJETO, valor: 180000 }, { servico: MSSP, valor: 60000, meses: 12 }];
  await db().batch([
    db().prepare(`INSERT INTO leads (id, company_name, cnpj, status, org_id) VALUES (?, 'Cliente', ?, 'Proposal', ?)`).bind(leadId, `1122233300${String(1000 + seq)}`, o.org ?? 'org_ness'),
    db().prepare(`INSERT INTO propostas (id, org_id, lead_id, assessment_id, numero, status, cliente, consultor_email, total_projeto, mensalidade,
      documento_html, documento_hash, criada_por) VALUES (?, ?, ?, 'as-1', ?, ?, 'Cliente Ltda.', ?, ?, ?, '<p>doc</p>', 'hash-abc', 'com@ness.lat')`)
      .bind(id, o.org ?? 'org_ness', leadId, `NESS-2026-${seq}`, o.status ?? 'enviada', o.consultor === undefined ? 'cons@ness.lat' : o.consultor,
        o.total ?? 180000, o.mensal ?? 5000),
    ...itens.map((i, k) => db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico_id, servico, meses, valor) VALUES (?, ?, ?, NULL, ?, ?, ?)`)
      .bind(`${id}-i${k}`, id, k, JSON.stringify(i.servico), i.meses ?? null, i.valor)),
  ]);
  return { id, leadId };
}

const entrada = (propostaId: string, o: Partial<EntradaFechamento> = {}): EntradaFechamento => ({
  propostaId, orgId: 'org_ness', origem: 'link',
  aceite: { nome: 'Maria Cliente', cargo: 'Diretora', email: 'maria@cliente.com', ip: '203.0.113.9' },
  atorEmail: 'maria@cliente.com', ...o,
});

const conta = async (sql: string, ...b: unknown[]) => (await db().prepare(sql).bind(...b).first<{ n: number }>())!.n;

describe('fecharVenda', () => {
  beforeAll(async () => {
    await applySchema();
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-com','com@ness.lat','x','Comercial','comercial')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons','cons@ness.lat','x','Consultora Ana','consultor')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons2','cons2@ness.lat','x','Consultor Beto','consultor')`),
      db().prepare(`INSERT INTO assessments (id, client_name) VALUES ('as-1','Cliente')`),
      ...Object.entries({ sector: 'Saúde', data_role: 'Controlador', target_standard: 'ISO 27001 + 27701', scope_type: 'Toda a empresa', headcount: '120' })
        .map(([k, v], i) => db().prepare(`INSERT INTO assessment_answers (id, assessment_id, block, question_key, question, answer) VALUES (?, 'as-1', 1, ?, ?, ?)`).bind(`aa-${i}`, k, k, v)),
    ]);
  }, 60_000);

  it('projeto + recorrente: um contrato, um projeto com 41 fases, consultor designado, lead Won, valores do congelado', async () => {
    const { id, leadId } = await proposta();
    const r = await fecharVenda(db(), entrada(id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projetoId).toBeTruthy();

    const p = await db().prepare('SELECT * FROM propostas WHERE id = ?').bind(id).first<any>();
    expect(p).toMatchObject({ status: 'aceita', aceite_nome: 'Maria Cliente', aceite_cargo: 'Diretora', aceite_email: 'maria@cliente.com',
      aceite_ip: '203.0.113.9', aceite_origem: 'link', contrato_id: r.contratoId, projeto_id: r.projetoId });
    expect(p.aceite_em).toBeTruthy();

    const ct = await db().prepare('SELECT * FROM contracts WHERE proposta_id = ?').bind(id).first<any>();
    expect(ct).toMatchObject({ id: r.contratoId, status: 'Signed', lead_id: leadId, org_id: 'org_ness', documento_hash: 'hash-abc',
      valor_projeto: 180000, mensalidade: 5000, prazo_minimo_meses: 12, projeto_id: r.projetoId });
    expect(ct.signed_at).toBeTruthy();
    const servicos = JSON.parse(ct.servicos);
    expect(servicos.map((s: any) => [s.nome, s.tipo])).toEqual([['Implementação ISO 27001', 'projeto'], ['SOC gerenciado', 'recorrente']]);
    expect(servicos[0].fases.map((f: any) => f.nome)).toEqual(['Diagnóstico', 'Implementação']);

    const pj = await db().prepare('SELECT * FROM projects WHERE id = ?').bind(r.projetoId).first<any>();
    expect(pj).toMatchObject({ client_name: 'Cliente Ltda.', project_name: 'Implementação ISO 27001', sector: 'Saúde', org_role: 'Controlador',
      standards: 'ISO 27001 + 27701', scope: 'Toda a empresa', employee_count: 120, assessment_id: 'as-1', proposta_id: id, status: 'active' });
    expect(pj.cnpj).toMatch(/^1122233300/);
    expect(await conta('SELECT COUNT(*) n FROM project_phases WHERE project_id = ?', r.projetoId)).toBe(PHASE_TITLES.length);
    expect(PHASE_TITLES.length).toBe(41);

    const gov = await db().prepare(`SELECT name, email FROM project_governance WHERE project_id = ? AND role_category = 'consultor'`).bind(r.projetoId).all<any>();
    expect(gov.results).toEqual([{ name: 'Consultora Ana', email: 'cons@ness.lat' }]);
    expect((await db().prepare('SELECT status FROM leads WHERE id = ?').bind(leadId).first<any>()).status).toBe('Won');
    expect((await db().prepare('SELECT converted_project_id FROM assessments WHERE id = ?').bind('as-1').first<any>()).converted_project_id).toBeTruthy();

    const notas = await db().prepare(`SELECT user_id FROM notifications WHERE target_id = ? ORDER BY user_id`).bind(id).all<any>();
    expect(notas.results.map((n: any) => n.user_id)).toEqual(['u-com', 'u-cons']);
    const trilha = await db().prepare(`SELECT action FROM audit_logs WHERE details LIKE ? ORDER BY action`).bind(`%${id}%`).all<any>();
    expect(trilha.results.map((t: any) => t.action)).toEqual(['contrato.criado', 'governance.created', 'project.created', 'proposta.aceita']);
  });

  it('só recorrente: contrato registra a mensalidade, sem projeto', async () => {
    const { id, leadId } = await proposta({ itens: [{ servico: MSSP, valor: 30000, meses: 6 }, { servico: DPO, valor: 48000, meses: 24 }], total: 0, mensal: 7000 });
    const r = await fecharVenda(db(), entrada(id));
    expect(r).toMatchObject({ ok: true, projetoId: null });
    const ct = await db().prepare('SELECT * FROM contracts WHERE proposta_id = ?').bind(id).first<any>();
    expect(ct).toMatchObject({ valor_projeto: 0, mensalidade: 7000, prazo_minimo_meses: 24, projeto_id: null });
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', id)).toBe(0);
    expect((await db().prepare('SELECT status, projeto_id FROM propostas WHERE id = ?').bind(id).first<any>())).toEqual({ status: 'aceita', projeto_id: null });
    expect((await db().prepare('SELECT status FROM leads WHERE id = ?').bind(leadId).first<any>()).status).toBe('Won');
  });

  it('duas chamadas em sequência: um contrato, um projeto; a segunda é ja_fechada', async () => {
    const { id } = await proposta();
    expect((await fecharVenda(db(), entrada(id))).ok).toBe(true);
    expect(await fecharVenda(db(), entrada(id))).toMatchObject({ ok: false, motivo: 'ja_fechada' });
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', id)).toBe(1);
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', id)).toBe(1);
  });

  it('duas chamadas simultâneas: um contrato, um projeto, uma trilha de aceite', async () => {
    const { id } = await proposta();
    const rs = await Promise.all([fecharVenda(db(), entrada(id)), fecharVenda(db(), entrada(id, { aceite: { nome: 'Outro', cargo: 'CEO', email: 'o@c.com', ip: '1.1.1.1' } }))]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok)).toEqual([{ ok: false, motivo: 'ja_fechada', mensagem: expect.any(String) }]);
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', id)).toBe(1);
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', id)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE action = 'proposta.aceita' AND details LIKE ?`, `%${id}%`)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE target_id = ?`, id)).toBe(2);
  });

  it('a guarda do batch segura a corrida sozinha, sem o índice único', async () => {
    const { id } = await proposta();
    await db().prepare('DROP INDEX idx_contracts_proposta').run();
    try {
      const rs = await Promise.all([fecharVenda(db(), entrada(id)), fecharVenda(db(), entrada(id))]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
    } finally {
      await db().prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_proposta ON contracts(proposta_id) WHERE proposta_id IS NOT NULL').run();
    }
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', id)).toBe(1);
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', id)).toBe(1);
  });

  it('falha no meio do batch (trigger em project_phases): nada gravado', async () => {
    const { id, leadId } = await proposta();
    await db().prepare(`CREATE TRIGGER falha_fase BEFORE INSERT ON project_phases BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`).run();
    try {
      await expect(fecharVenda(db(), entrada(id))).rejects.toThrow(/falha simulada/);
    } finally {
      await db().prepare('DROP TRIGGER falha_fase').run();
    }
    expect((await db().prepare('SELECT status, contrato_id, aceite_em FROM propostas WHERE id = ?').bind(id).first<any>()))
      .toEqual({ status: 'enviada', contrato_id: null, aceite_em: null });
    expect(await conta('SELECT COUNT(*) n FROM contracts WHERE proposta_id = ?', id)).toBe(0);
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', id)).toBe(0);
    expect((await db().prepare('SELECT status FROM leads WHERE id = ?').bind(leadId).first<any>()).status).toBe('Proposal');
    expect(await conta(`SELECT COUNT(*) n FROM audit_logs WHERE details LIKE ?`, `%${id}%`)).toBe(0);
  });

  it('contrato que já existe para a proposta (índice único): ja_fechada, sem 500 e sem nada gravado', async () => {
    const { id, leadId } = await proposta();
    await db().prepare(`INSERT INTO contracts (id, proposta_id, status) VALUES ('ct-previo', ?, 'Signed')`).bind(id).run();
    expect(await fecharVenda(db(), entrada(id))).toMatchObject({ ok: false, motivo: 'ja_fechada' });
    expect((await db().prepare('SELECT status, contrato_id FROM propostas WHERE id = ?').bind(id).first<any>())).toEqual({ status: 'enviada', contrato_id: null });
    expect(await conta('SELECT COUNT(*) n FROM projects WHERE proposta_id = ?', id)).toBe(0);
    expect((await db().prepare('SELECT status FROM leads WHERE id = ?').bind(leadId).first<any>()).status).toBe('Proposal');
  });

  it('pelo link, só de enviada/visualizada; manual também de gerada', async () => {
    for (const status of ['rascunho', 'gerada', 'aguardando_aprovacao', 'recusada', 'expirada', 'substituida']) {
      const { id } = await proposta({ status });
      expect(await fecharVenda(db(), entrada(id)), status).toMatchObject({ ok: false, motivo: 'estado_invalido' });
      expect((await db().prepare('SELECT status FROM propostas WHERE id = ?').bind(id).first<any>()).status).toBe(status);
    }
    expect((await fecharVenda(db(), entrada((await proposta({ status: 'visualizada' })).id))).ok).toBe(true);
    expect(await fecharVenda(db(), entrada((await proposta({ status: 'rascunho' })).id, { origem: 'manual' }))).toMatchObject({ motivo: 'estado_invalido' });
    const g = await proposta({ status: 'gerada' });
    expect((await fecharVenda(db(), entrada(g.id, { origem: 'manual', atorEmail: 'com@ness.lat', aceite: { nome: 'M', cargo: 'C', email: 'm@c.com', ip: '', comprovante: 'contrato assinado em 02/10' } }))).ok).toBe(true);
    expect((await db().prepare('SELECT aceite_origem, aceite_comprovante FROM propostas WHERE id = ?').bind(g.id).first<any>()))
      .toEqual({ aceite_origem: 'manual', aceite_comprovante: 'contrato assinado em 02/10' });
  });

  it('proposta de outra organização: nao_encontrada, sem efeito', async () => {
    const { id } = await proposta({ org: 'org_b' });
    expect(await fecharVenda(db(), entrada(id))).toMatchObject({ ok: false, motivo: 'nao_encontrada' });
    expect(await fecharVenda(db(), entrada('nao-existe'))).toMatchObject({ ok: false, motivo: 'nao_encontrada' });
    expect((await db().prepare('SELECT status FROM propostas WHERE id = ?').bind(id).first<any>()).status).toBe('enviada');
  });

  it('sem consultor na proposta: aceite manual de consultor o designa; de comercial, ninguém', async () => {
    const a = await proposta({ consultor: null });
    const ra = await fecharVenda(db(), entrada(a.id, { origem: 'manual', atorEmail: 'cons2@ness.lat' }));
    const rb = await fecharVenda(db(), entrada((await proposta({ consultor: null })).id, { origem: 'manual', atorEmail: 'com@ness.lat' }));
    if (!ra.ok || !rb.ok) throw new Error('fechamento falhou');
    expect((await db().prepare(`SELECT email FROM project_governance WHERE project_id = ?`).bind(ra.projetoId).all<any>()).results).toEqual([{ email: 'cons2@ness.lat' }]);
    expect(await conta(`SELECT COUNT(*) n FROM project_governance WHERE project_id = ?`, rb.projetoId)).toBe(0);
  });
});
