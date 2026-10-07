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
import { orgDoUsuario, limiteDoPlanoAtingido } from './organizacao';
import type { Servico } from '../schemas';
import { stmtsFases, stmtControles } from './project-setup';
import { diagnosticoDe } from './diagnostico';
import { ISO_27001_2022, ISO_27001_2022_STANDARD } from '../data/iso27001-2022';
import { ISO_27701_2025_STANDARD, controlsForRole } from '../data/iso27701-2025';

/** tokenHash: com origem 'link', o hash do token que a rota usou; rotação ou revogação no meio e nada grava. */
export interface EntradaFechamento { propostaId: string; orgId: string; origem: 'link' | 'manual'; aceite: { nome: string; cargo: string; email: string; ip: string; comprovante?: string }; atorEmail: string; tokenHash?: string }
export type ResultadoFechamento =
  | { ok: true; contratoId: string; projetoId: string | null }
  | { ok: false; motivo: 'nao_encontrada' | 'estado_invalido' | 'ja_fechada'; mensagem: string };

// manual também de expirada: o papel assinado pode chegar depois da validade
const ACEITA_DE = { link: ['enviada', 'visualizada'], manual: ['gerada', 'enviada', 'visualizada', 'expirada'] } as const;
/** Revisões posteriores ainda abertas: o aceite de uma revisão encerra as outras. */
const ABERTAS = ['rascunho', 'gerada', 'enviada', 'visualizada', 'aguardando_aprovacao'];
/** Ator da trilha do aceite pelo link: o e-mail é digitado pelo cliente, não é identidade. */
export const ATOR_LINK = 'cliente (link)';

const NAO_ACHADA: ResultadoFechamento = { ok: false, motivo: 'nao_encontrada', mensagem: 'Proposta não encontrada' };
const JA_FECHADA: ResultadoFechamento = { ok: false, motivo: 'ja_fechada', mensagem: 'A proposta já foi aceita' };
const invalido = (status: string, origem: EntradaFechamento['origem']): ResultadoFechamento => ({
  ok: false, motivo: 'estado_invalido',
  mensagem: `Proposta em "${status}" não pode ser aceita${origem === 'link' ? ' pelo link: só enviada ou visualizada' : ': só gerada, enviada, visualizada ou expirada'}`,
});

const unico = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as any)?.message ?? e));
/** Texto digitado pelo cliente na trilha: uma linha, com teto. */
const linha = (s: string, max = 200) => s.replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, max);

/** E-mail de consultor ativo da organização (sem diferença de caixa); null se não for. */
export async function consultorValido(db: D1Database, orgId: string, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const u = await db.prepare(`SELECT email, role, org_id FROM users WHERE lower(email) = lower(?) AND ativo = 1 AND role IN ('consultor', 'consultant')`)
    .bind(email).first<any>();
  return u && orgDoUsuario(u) === orgId ? email : null;
}

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
  const ator = e.origem === 'link' ? ATOR_LINK : e.atorEmail || 'system';
  const doLink = e.origem === 'link' && e.tokenHash !== undefined;
  // Guarda de todos os passos depois do primeiro: a proposta foi aceita por ESTA chamada.
  const G = 'EXISTS (SELECT 1 FROM propostas WHERE id = ? AND contrato_id = ?)';
  const g = [p.id, contratoId];

  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE propostas SET status = 'aceita', aceite_nome = ?, aceite_cargo = ?, aceite_email = ?, aceite_ip = ?, aceite_em = ?,
      aceite_origem = ?, aceite_comprovante = ?, contrato_id = ?, projeto_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND org_id = ? AND status IN (${permitidos.map(() => '?').join(', ')})${doLink ? ' AND token_hash = ?' : ''}
        AND NOT EXISTS (SELECT 1 FROM propostas x WHERE x.org_id = ? AND x.numero = ? AND x.status = 'aceita' AND x.id <> ?)`)
      .bind(e.aceite.nome, e.aceite.cargo, e.aceite.email, e.aceite.ip, agora, e.origem, e.aceite.comprovante ?? null,
        contratoId, projetoId, p.id, e.orgId, ...permitidos, ...(doLink ? [e.tokenHash] : []), e.orgId, p.numero, p.id),
    // as revisões posteriores ainda abertas deixam de valer (uma revisão só pode ser aceita)
    db.prepare(`UPDATE propostas SET status = 'substituida', updated_at = CURRENT_TIMESTAMP
      WHERE org_id = ? AND numero = ? AND revisao > ? AND status IN (${ABERTAS.map(() => '?').join(', ')}) AND ${G}`)
      .bind(e.orgId, p.numero, p.revisao, ...ABERTAS, ...g),
    db.prepare(`INSERT INTO contracts (id, lead_id, status, signed_at, created_at, org_id, proposta_id, documento_hash, valor_projeto,
      mensalidade, prazo_minimo_meses, servicos, projeto_id)
      SELECT ?, lead_id, 'Signed', ?, datetime('now'), org_id, id, documento_hash, total_projeto, mensalidade, ?, ?, ?
      FROM propostas WHERE id = ? AND contrato_id = ?`)
      .bind(contratoId, agora, prazos.length ? Math.max(...prazos) : null, JSON.stringify(servicos), projetoId, ...g),
    db.prepare(`UPDATE leads SET status = 'Won', updated_at = datetime('now') WHERE id = ? AND ${G}`).bind(p.lead_id, ...g),
  ];
  const trilha: [string, string, string | null][] = [
    ['proposta.aceita', `Proposta ${p.id} (${p.numero} rev. ${p.revisao}) aceita por ${e.origem === 'link' ? 'link' : 'registro manual'}: ${linha(e.aceite.nome)}, ${linha(e.aceite.cargo)}, e-mail ${linha(e.aceite.email)}, hash ${p.documento_hash}`, null],
    ['contrato.criado', `Contrato ${contratoId} criado pelo aceite da proposta ${p.id}`, projetoId],
  ];

  // o da proposta só se ainda for consultor ativo (a conta pode ter mudado desde a criação)
  let consultorEmail = await consultorValido(db, e.orgId, p.consultor_email);
  if (projetoId) {
    const dados = await dadosDoProjeto(db, p, deProjeto.map((i) => i.servico));
    stmts.push(
      db.prepare(`INSERT INTO projects (id, project_name, client_name, sector, scope, standards, org_role, status, assessment_id, cnpj,
        employee_count, proposta_id, org_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, datetime('now') WHERE ${G}`)
        .bind(projetoId, deProjeto[0].servico.nome, p.cliente, dados.sector, dados.scope, dados.standards, dados.orgRole, p.assessment_id,
          dados.cnpj, dados.pessoas, p.id, p.org_id, ...g),
      // cada fase só entra se o projeto acima existe, isto é, se foi criado por esta chamada
      ...stmtsFases(db, projetoId),
    );
    // controles da norma vendida, com a mesma guarda das fases (o projeto desta chamada)
    const catalogos = catalogosDoProjeto(
      `${dados.standards} ${deProjeto.map((i) => `${i.servico.norma ?? ''} ${i.servico.nome}`).join(' ')}`, dados.orgRole);
    stmts.push(...catalogos.map((k) => stmtControles(db, projetoId, k.standard, k.lista)));
    if (p.assessment_id) {
      // levantamento já convertido pelo fluxo antigo mantém o vínculo que tinha
      stmts.push(db.prepare(`UPDATE assessments SET status = 'converted', converted_project_id = COALESCE(converted_project_id, ?),
        completed_at = COALESCE(completed_at, datetime('now')) WHERE id = ? AND ${G}`).bind(projetoId, p.assessment_id, ...g));
    }
    const resumo = catalogos.map((k) => `${k.lista.length} ${k.standard}`).join(', ');
    trilha.push(['project.created', `Projeto ${projetoId} criado com a trilha de fases${resumo ? ` e os controles (${resumo})` : ''} pelo aceite da proposta ${p.id}`, projetoId]);
    // Limite do plano: o aceite NÃO falha por ele (o cliente já aceitou; recusar aqui quebraria a venda
    // fechada). O limite barra a criação MANUAL (`POST /projects`); aqui o estouro fica na trilha.
    if (await limiteDoPlanoAtingido(db, p.org_id, 'projetos')) {
      trilha.push(['org.limite_excedido', `Projeto ${projetoId} criado pelo aceite da proposta ${p.id} acima do limite de projetos do plano da organização ${p.org_id}`, projetoId]);
    }

    // Consultor responsável: o da proposta; senão quem registrou o aceite manual, se for consultor.
    if (!consultorEmail && e.origem === 'manual') consultorEmail = await consultorValido(db, e.orgId, e.atorEmail);
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
    if (atual.status === 'aceita') return JA_FECHADA;
    const outra = await db.prepare(`SELECT 1 FROM propostas WHERE org_id = ? AND numero = ? AND status = 'aceita' AND id <> ?`).bind(e.orgId, p.numero, p.id).first();
    return outra ? JA_FECHADA : invalido(atual.status, e.origem);
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

type Catalogo = { standard: string; lista: readonly { code: string; title: string }[] };

/**
 * Catálogos que o projeto vendido ganha, pelo rótulo de normas do projeto e pela norma e nome dos
 * serviços de projeto. O 27701 estende o SGSI e traz o 27001 junto. Texto sem nenhuma das duas
 * ("Adequação LGPD") não semeia nada. Papel 27701 não mapeado cai no Controlador, como o papel vazio.
 */
function catalogosDoProjeto(texto: string, orgRole: string): Catalogo[] {
  const com27701 = /27701/.test(texto);
  const out: Catalogo[] = [];
  if (com27701 || /27001/.test(texto)) out.push({ standard: ISO_27001_2022_STANDARD, lista: ISO_27001_2022 });
  if (com27701) {
    const porPapel = controlsForRole(orgRole);
    out.push({ standard: ISO_27701_2025_STANDARD, lista: porPapel.length ? porPapel : controlsForRole('') });
  }
  return out;
}
