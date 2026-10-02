// Fechamento da venda (spec do sistema de propostas, seção 6.3): a ÚNICA rotina que transforma
// uma proposta aceita em contrato e projeto. Chamada pelo aceite do link (cliente) e pelo
// aceite manual (comercial). Tudo num db.batch (transação): falha no meio não deixa projeto
// órfão nem contrato sem projeto.
//
// Idempotência: o primeiro comando muda a proposta para 'aceita' e grava nela o contrato_id
// desta chamada, só se ela ainda estiver num estado que aceita. Os demais comandos só agem se
// a proposta tem ESTE contrato_id (id único por chamada), então a segunda chamada, ou a que
// perdeu a corrida, não grava nada. O índice único de contracts.proposta_id é a última linha
// de defesa: violação vira 'ja_fechada', nunca 500.
import { genId } from '../helpers';
import type { Servico } from '../schemas';
import { stmtsFases } from './project-setup';
import { diagnosticoDe } from './diagnostico';

export interface EntradaFechamento { propostaId: string; orgId: string; origem: 'link' | 'manual'; aceite: { nome: string; cargo: string; email: string; ip: string; comprovante?: string }; atorEmail: string }
export type ResultadoFechamento =
  | { ok: true; contratoId: string; projetoId: string | null }
  | { ok: false; motivo: 'nao_encontrada' | 'estado_invalido' | 'ja_fechada'; mensagem: string };

const ACEITA_DE = { link: ['enviada', 'visualizada'], manual: ['gerada', 'enviada', 'visualizada'] } as const;

const NAO_ACHADA: ResultadoFechamento = { ok: false, motivo: 'nao_encontrada', mensagem: 'Proposta não encontrada' };
const JA_FECHADA: ResultadoFechamento = { ok: false, motivo: 'ja_fechada', mensagem: 'A proposta já foi aceita' };
const invalido = (status: string, origem: EntradaFechamento['origem']): ResultadoFechamento => ({
  ok: false, motivo: 'estado_invalido',
  mensagem: `Proposta em "${status}" não pode ser aceita${origem === 'link' ? ' pelo link: só enviada ou visualizada' : ': só gerada, enviada ou visualizada'}`,
});

const unico = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as any)?.message ?? e));

export async function fecharVenda(db: D1Database, e: EntradaFechamento): Promise<ResultadoFechamento> {
  const p = await db.prepare('SELECT * FROM propostas WHERE id = ? AND org_id = ?').bind(e.propostaId, e.orgId).first<any>();
  if (!p) return NAO_ACHADA;
  if (p.status === 'aceita') return JA_FECHADA;
  const permitidos: readonly string[] = ACEITA_DE[e.origem];
  if (!permitidos.includes(p.status)) return invalido(p.status, e.origem);

  const itens = (await db.prepare('SELECT servico, meses FROM proposta_itens WHERE proposta_id = ? ORDER BY ordem').bind(p.id).all<any>())
    .results.map((r) => ({ servico: JSON.parse(r.servico) as Servico, meses: r.meses as number | null }));
  const deProjeto = itens.filter((i) => i.servico.tipo !== 'recorrente');
  const prazos = itens.flatMap((i) => (i.servico.tipo === 'recorrente' ? [i.meses ?? i.servico.prazoMinimoMeses] : []));
  const servicos = itens.map(({ servico: s, meses }) => ({
    nome: s.nome, tipo: s.tipo, norma: s.norma, ...(s.tipo === 'recorrente' ? { meses } : {}), ...(s.tipo === 'projeto' ? { fases: s.fases } : {}),
  }));

  const contratoId = genId();
  const projetoId = deProjeto.length ? genId() : null;
  const agora = new Date().toISOString();
  const ator = e.atorEmail || 'system';
  // Guarda de todos os passos depois do primeiro: a proposta foi aceita por ESTA chamada.
  const G = 'EXISTS (SELECT 1 FROM propostas WHERE id = ? AND contrato_id = ?)';
  const g = [p.id, contratoId];

  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE propostas SET status = 'aceita', aceite_nome = ?, aceite_cargo = ?, aceite_email = ?, aceite_ip = ?, aceite_em = ?,
      aceite_origem = ?, aceite_comprovante = ?, contrato_id = ?, projeto_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND org_id = ? AND status IN (${permitidos.map(() => '?').join(', ')})`)
      .bind(e.aceite.nome, e.aceite.cargo, e.aceite.email, e.aceite.ip, agora, e.origem, e.aceite.comprovante ?? null,
        contratoId, projetoId, p.id, e.orgId, ...permitidos),
    db.prepare(`INSERT INTO contracts (id, lead_id, status, signed_at, created_at, org_id, proposta_id, documento_hash, valor_projeto,
      mensalidade, prazo_minimo_meses, servicos, projeto_id)
      SELECT ?, lead_id, 'Signed', ?, datetime('now'), org_id, id, documento_hash, total_projeto, mensalidade, ?, ?, ?
      FROM propostas WHERE id = ? AND contrato_id = ?`)
      .bind(contratoId, agora, prazos.length ? Math.max(...prazos) : null, JSON.stringify(servicos), projetoId, ...g),
    db.prepare(`UPDATE leads SET status = 'Won', updated_at = datetime('now') WHERE id = ? AND ${G}`).bind(p.lead_id, ...g),
  ];
  const trilha: [string, string, string | null][] = [
    ['proposta.aceita', `Proposta ${p.id} (${p.numero} rev. ${p.revisao}) aceita por ${e.origem === 'link' ? 'link' : 'registro manual'}: ${e.aceite.nome}, ${e.aceite.cargo}, hash ${p.documento_hash}`, null],
    ['contrato.criado', `Contrato ${contratoId} criado pelo aceite da proposta ${p.id}`, projetoId],
  ];

  let consultorEmail: string | null = p.consultor_email || null;
  if (projetoId) {
    const dados = await dadosDoProjeto(db, p, deProjeto.map((i) => i.servico));
    stmts.push(
      db.prepare(`INSERT INTO projects (id, project_name, client_name, sector, scope, standards, org_role, status, assessment_id, cnpj,
        employee_count, proposta_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, datetime('now') WHERE ${G}`)
        .bind(projetoId, deProjeto[0].servico.nome, p.cliente, dados.sector, dados.scope, dados.standards, dados.orgRole, p.assessment_id,
          dados.cnpj, dados.pessoas, p.id, ...g),
      // cada fase só entra se o projeto acima existe, isto é, se foi criado por esta chamada
      ...stmtsFases(db, projetoId),
    );
    if (p.assessment_id) {
      // levantamento já convertido pelo fluxo antigo mantém o vínculo que tinha
      stmts.push(db.prepare(`UPDATE assessments SET status = 'converted', converted_project_id = COALESCE(converted_project_id, ?),
        completed_at = COALESCE(completed_at, datetime('now')) WHERE id = ? AND ${G}`).bind(projetoId, p.assessment_id, ...g));
    }
    trilha.push(['project.created', `Projeto ${projetoId} criado com a trilha de fases pelo aceite da proposta ${p.id}`, projetoId]);

    // Consultor responsável: o da proposta; senão quem registrou o aceite manual, se for consultor.
    if (!consultorEmail && e.origem === 'manual') {
      const u = await db.prepare('SELECT role FROM users WHERE lower(email) = lower(?)').bind(e.atorEmail).first<any>();
      if (u && ['consultor', 'consultant'].includes(u.role)) consultorEmail = e.atorEmail;
    }
    if (consultorEmail) {
      // a linha de designacaoDoCriador, com o nome da conta quando existe e só no projeto desta chamada
      stmts.push(db.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title)
        SELECT ?, COALESCE((SELECT name FROM users WHERE lower(email) = lower(?)), ?), ?, 'consultor', 'Consultor'
        WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM project_governance WHERE project_id = ? AND lower(email) = lower(?) AND role_category = 'consultor')`)
        .bind(projetoId, consultorEmail, consultorEmail, consultorEmail, projetoId, projetoId, consultorEmail));
      trilha.push(['governance.created', `Consultor ${consultorEmail} designado no projeto ${projetoId} pelo aceite da proposta ${p.id}`, projetoId]);
    }
  }

  stmts.push(...trilha.map(([acao, detalhe, projeto]) => db.prepare(
    `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
     SELECT ?, ?, ?, ?, '', ?, ?, datetime('now') WHERE ${G}`).bind(genId(), acao, ator, detalhe, e.aceite.ip, projeto, ...g)));

  // Notificação ao comercial que criou a proposta e ao consultor, se têm conta.
  const link = projetoId ? `/projects/${projetoId}` : `/propostas/${p.id}`;
  const msg = projetoId ? `Contrato ${contratoId} e projeto criados.` : `Contrato ${contratoId} criado (sem projeto: só serviços recorrentes).`;
  for (const email of new Set([p.criada_por, consultorEmail].filter(Boolean).map((x: string) => x.toLowerCase()))) {
    stmts.push(db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, read, link, action_type, target_id, created_at)
      SELECT ?, u.id, 'contract_signed', ?, ?, 0, ?, 'proposta_aceita', ?, datetime('now') FROM users u WHERE lower(u.email) = ? AND ${G}`)
      .bind(genId(), `Proposta aceita: ${p.cliente}`, msg, link, p.id, email, ...g));
  }

  let res: D1Result[];
  try {
    res = await db.batch(stmts);
  } catch (err) {
    if (unico(err)) return JA_FECHADA;
    throw err;
  }
  if (!res[0].meta.changes) {
    const atual = await db.prepare('SELECT status FROM propostas WHERE id = ? AND org_id = ?').bind(p.id, e.orgId).first<any>();
    if (!atual) return NAO_ACHADA;
    return atual.status === 'aceita' ? JA_FECHADA : invalido(atual.status, e.origem);
  }
  return { ok: true, contratoId, projetoId };
}

/** Setor, escopo, papel e norma das respostas do levantamento; CNPJ do lead; pessoas do diagnóstico. */
async function dadosDoProjeto(db: D1Database, p: any, servicos: Servico[]) {
  const respostas: Record<string, string> = p.assessment_id
    ? Object.fromEntries((await db.prepare('SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?').bind(p.assessment_id).all<any>())
      .results.map((r) => [r.question_key, r.answer ?? '']))
    : {};
  const lead = p.lead_id ? await db.prepare('SELECT cnpj FROM leads WHERE id = ?').bind(p.lead_id).first<any>() : null;
  const normas = [...new Set(servicos.map((s) => s.norma).filter(Boolean))].join(' + ');
  return {
    sector: respostas.sector ?? '',
    scope: respostas.scope_type ?? '',
    orgRole: respostas.data_role ?? '',
    standards: respostas.target_standard || normas || 'ISO 27001',
    cnpj: lead?.cnpj ?? null,
    pessoas: Object.keys(respostas).length ? diagnosticoDe(respostas).pessoas : null,
  };
}
