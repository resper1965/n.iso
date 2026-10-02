// Propostas (spec do sistema de propostas, seções 4 e 5). Este router só orquestra:
// o cálculo é de preco-proposta.ts, o diagnóstico de diagnostico.ts e o documento de
// documento-proposta.ts / documento-docx.ts. O documento gerado é congelado (HTML + hash)
// e nunca é remontado; mudança depois da geração só por revisão.
import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { ehComercial, podeAdministrarOrg, genId, genToken, sha256Hex, escapeHtml, sendEmail, logAudit, erro500 } from '../helpers';
import { validateBody, propostaCriarSchema, propostaEditarSchema, propostaGerarSchema, propostaEnviarSchema, propostaAceiteManualSchema } from '../schemas';
import type { Servico } from '../schemas';
import { exigirOrg, lerConfigOrg, formatarNumeroProposta, type ConfigOrg } from '../services/organizacao';
import { calcularItem, totais, descontoAcimaDoTeto, margem, type Faixa } from '../services/preco-proposta';
import { diagnosticoDe, type Diagnostico } from '../services/diagnostico';
import { montarConteudo, textosEditaveis, renderizarHtml, hashDocumento, type DadosDocumento } from '../services/documento-proposta';
import { renderizarDocx } from '../services/documento-docx';
import { deLinha } from './servicos';
import { fecharVenda, consultorValido } from '../services/fechar-venda';

export const propostasApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** O documento não leva script nem recurso externo além das fontes. Aplicado em index.ts, por fora do secureHeaders. */
export const CSP_DOCUMENTO = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com";

const NEGADO = { error: 'Forbidden: Área comercial restrita ao comercial da ness.' };
const EDITAVEIS = `('rascunho', 'aguardando_aprovacao')`;
const NAO_ACHADA = { error: 'Proposta não encontrada' };
const JA_GERADA = { error: 'Proposta já gerada: mudança só por nova revisão' };

/** Recusa com status próprio, lançada do meio do cálculo e respondida pelo handler. */
class Recusa extends Error { constructor(msg: string, readonly status: 400 | 409 = 400) { super(msg); } }
const falha = (c: any, e: unknown, msg: string) => (e instanceof Recusa ? c.json({ error: e.message }, e.status) : erro500(c, msg, e));

interface Item { servicoId: string | null; servico: Servico; dias?: number; meses?: number; descontoPct?: number; textoCliente: string }

const achar = (db: D1Database, orgId: string, id: string) =>
  db.prepare('SELECT * FROM propostas WHERE id = ? AND org_id = ?').bind(id, orgId).first<any>();

async function itensDe(db: D1Database, propostaId: string): Promise<(Item & { id: string })[]> {
  const { results } = await db.prepare('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY ordem').bind(propostaId).all<any>();
  return results.map((r) => ({
    id: r.id, servicoId: r.servico_id, servico: JSON.parse(r.servico), textoCliente: r.texto_cliente,
    dias: r.dias ?? undefined, meses: r.meses ?? undefined, descontoPct: r.desconto_pct,
  }));
}

/** Item do corpo -> item com a cópia do serviço. Serviço que já está na proposta mantém a cópia congelada (revisão não relê o catálogo). */
async function resolverItens(db: D1Database, orgId: string, entrada: any[], atuais: Item[] = []): Promise<Item[]> {
  const congelado = new Map(atuais.map((i) => [i.servicoId, i.servico]));
  const itens: Item[] = [];
  for (const e of entrada) {
    let servico = congelado.get(e.servicoId);
    if (!servico) {
      const r = await db.prepare('SELECT * FROM servicos WHERE id = ? AND org_id = ? AND ativo = 1').bind(e.servicoId, orgId).first<any>();
      if (!r) throw new Recusa(`Serviço ${e.servicoId} não está no catálogo ativo`);
      servico = deLinha(r);
    }
    itens.push({ servicoId: e.servicoId, servico, dias: e.dias, meses: e.meses, descontoPct: e.descontoPct, textoCliente: e.textoCliente ?? '' });
  }
  return itens;
}

async function diagnosticoDaProposta(db: D1Database, assessmentId: string | null): Promise<Diagnostico | null> {
  if (!assessmentId) return null;
  const { results } = await db.prepare('SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?').bind(assessmentId).all<any>();
  return results.length ? diagnosticoDe(Object.fromEntries(results.map((r) => [r.question_key, r.answer ?? '']))) : null;
}

// Sem diagnóstico, a proposta usa a faixa Standard e o porte da primeira faixa; a memória diz isso.
function calcular(itens: Item[], cfg: ConfigOrg, dg: Diagnostico | null) {
  const faixa: Faixa = dg?.faixa ?? '2';
  const pessoas = dg?.pessoas ?? null;
  const calcs = itens.map((i) => {
    try { return calcularItem(i.servico, i, cfg.preco, faixa, pessoas); } catch (e: any) { throw new Recusa(e?.message ?? 'Item inválido'); }
  });
  return {
    faixa, pessoas, calcs, totais: totais(calcs), margem: margem(calcs, cfg.preco, faixa),
    memoria: { faixa, pessoas, origem: dg ? 'diagnóstico' : 'sem diagnóstico: faixa Standard e porte não informado', itens: calcs.map((x) => x.memoria) },
  };
}
type Calculo = ReturnType<typeof calcular>;

// Os itens só mudam se a proposta ainda estiver editável, conferido dentro do mesmo batch:
// uma geração que termine entre a leitura e o batch não deixa itens trocados atrás do documento.
const AINDA_EDITAVEL = `EXISTS (SELECT 1 FROM propostas WHERE id = ? AND status IN ${EDITAVEIS})`;
const stmtsItens = (db: D1Database, propostaId: string, itens: Item[], calc: Calculo) => [
  db.prepare(`DELETE FROM proposta_itens WHERE proposta_id = ? AND ${AINDA_EDITAVEL}`).bind(propostaId, propostaId),
  ...itens.map((i, k) => db.prepare(
    `INSERT INTO proposta_itens (id, proposta_id, ordem, servico_id, servico, dias, meses, valor_base, desconto_pct, valor, texto_cliente)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${AINDA_EDITAVEL}`
  ).bind(genId(), propostaId, k, i.servicoId, JSON.stringify(i.servico), i.dias ?? null, i.meses ?? null,
    calc.calcs[k].valorBase, calc.calcs[k].descontoPct, calc.calcs[k].valor, i.textoCliente, propostaId)),
];

const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const FUSO_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Data de hoje (AAAA-MM-DD) no fuso de Brasília: o ano do número, a emissão e a validade saem daqui. */
export const diaEmBrasilia = (agora = new Date()) => FUSO_BR.format(agora);
const maisDias = (dia: string, n: number) => isoDia(new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000));
const cnpjBr = (s: string | null) => (s && /^\d{14}$/.test(s) ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s ?? null);

async function montar(db: D1Database, cfg: ConfigOrg, p: any, itens: Item[], calc: Calculo, dg: Diagnostico | null, numero: string) {
  const lead = p.lead_id ? await db.prepare('SELECT cnpj FROM leads WHERE id = ?').bind(p.lead_id).first<any>() : null;
  const hoje = diaEmBrasilia();
  const validaAte = maisDias(hoje, p.validade_dias);
  const dados: DadosDocumento = {
    org: cfg, numero, revisao: p.revisao, emitidaEm: hoje, validaAte,
    cliente: { nome: p.cliente, cnpj: cnpjBr(lead?.cnpj ?? null), pessoas: calc.pessoas },
    textos: { contexto: p.contexto, escopo: p.escopo, observacoes: p.observacoes },
    itens: itens.map((i, k) => ({ servico: i.servico, calc: calc.calcs[k], textoCliente: i.textoCliente })),
    totais: calc.totais, pagamento: p.pagamento, diagnostico: dg,
  };
  const editadas = JSON.parse(p.secoes_editadas || '{}');
  const conteudo = montarConteudo(dados, editadas);
  return { conteudo, html: renderizarHtml(conteudo), validaAte, textos: textosEditaveis(dados, editadas) };
}

async function saida(db: D1Database, orgId: string, id: string) {
  const { documento_html: _h, documento_conteudo: _c, token_hash: t, ...p } = await achar(db, orgId, id);
  const { results } = await db.prepare('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY ordem').bind(id).all<any>();
  return {
    ...p, tem_link: t != null, memoria: JSON.parse(p.memoria || 'null'), margem: JSON.parse(p.margem || 'null'), secoes_editadas: JSON.parse(p.secoes_editadas || '{}'),
    itens: results.map((r) => ({ ...r, servico: JSON.parse(r.servico) })),
  };
}

const unico = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as any)?.message ?? e));

/** consultorEmail informado precisa ser de consultor ativo da organização: é quem o fechamento designa no projeto. */
async function conferirConsultor(db: D1Database, orgId: string, email: string | null | undefined) {
  if (email && !(await consultorValido(db, orgId, email))) {
    throw new Recusa(`Consultor responsável: ${email} não é consultor ativo desta organização`);
  }
}

// Proposta carrega preço, custo e margem: nem leitura para quem não é do comercial.
propostasApp.use('*', async (c, next) => {
  if (!ehComercial(c.get('user'))) return c.json(NEGADO, 403);
  await next();
});
propostasApp.use('*', exigirOrg);

propostasApp.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, numero, revisao, status, cliente, lead_id, total_projeto, mensalidade, created_at, updated_at, gerada_em, valida_ate,
       token_hash IS NOT NULL AS tem_link FROM propostas WHERE org_id = ? ORDER BY created_at DESC, rowid DESC`
    ).bind(c.get('orgId')).all<any>();
    return c.json(results.map((r) => ({ ...r, tem_link: !!r.tem_link })));
  } catch (e) { return erro500(c, 'Erro ao listar as propostas', e); }
});

propostasApp.get('/:id', async (c) => {
  try {
    const orgId = c.get('orgId');
    if (!(await achar(c.env.DB, orgId, c.req.param('id')))) return c.json(NAO_ACHADA, 404);
    return c.json(await saida(c.env.DB, orgId, c.req.param('id')));
  } catch (e) { return erro500(c, 'Erro ao ler a proposta', e); }
});

propostasApp.post('/', async (c) => {
  try {
    const user = c.get('user');
    const v = await validateBody(c, propostaCriarSchema);
    if (!v.success) return v.response;
    const b = v.data;
    const db = c.env.DB;
    const orgId = c.get('orgId');
    const lead = await db.prepare('SELECT id, company_name, razao_social FROM leads WHERE id = ? AND org_id = ?').bind(b.leadId, orgId).first<any>();
    if (!lead) return c.json({ error: 'Lead não encontrado' }, 404);
    await conferirConsultor(db, orgId, b.consultorEmail);
    // o diagnóstico mais recente do lead que tenha respostas
    const as = await db.prepare(
      `SELECT a.id FROM assessments a WHERE a.lead_id = ? AND a.org_id = ?
       AND EXISTS (SELECT 1 FROM assessment_answers x WHERE x.assessment_id = a.id) ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1`
    ).bind(lead.id, orgId).first<any>();
    const cfg = await lerConfigOrg(db, orgId);
    const itens = await resolverItens(db, orgId, b.itens ?? []);
    const calc = calcular(itens, cfg, await diagnosticoDaProposta(db, as?.id ?? null));
    const id = genId();
    await db.batch([
      db.prepare(
        `INSERT INTO propostas (id, org_id, lead_id, assessment_id, cliente, validade_dias, pagamento, contexto, escopo, observacoes,
         consultor_email, total_projeto, mensalidade, memoria, margem, criada_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, orgId, lead.id, as?.id ?? null, lead.razao_social || lead.company_name, b.validadeDias ?? 30,
        b.pagamento ?? (cfg.textos.pagamentoPadrao || '40/30/30'), b.contexto ?? '', b.escopo ?? '', b.observacoes ?? '',
        b.consultorEmail ?? null, calc.totais.totalProjeto, calc.totais.mensalidade, JSON.stringify(calc.memoria), JSON.stringify(calc.margem),
        user.email ?? 'system'),
      ...stmtsItens(db, id, itens, calc).slice(1),
    ]);
    await logAudit(db, 'proposta.criada', user.email ?? 'system', `Proposta ${id} criada na organização ${orgId} para o lead ${lead.id}`);
    return c.json(await saida(db, orgId, id), 201);
  } catch (e) { return falha(c, e, 'Erro ao criar a proposta'); }
});

propostasApp.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const orgId = c.get('orgId');
    const id = c.req.param('id');
    const p = await achar(db, orgId, id);
    if (!p) return c.json(NAO_ACHADA, 404);
    if (!['rascunho', 'aguardando_aprovacao'].includes(p.status)) return c.json(JA_GERADA, 409);
    const v = await validateBody(c, propostaEditarSchema);
    if (!v.success) return v.response;
    const b = v.data;
    await conferirConsultor(db, orgId, b.consultorEmail);

    const editadas = { ...JSON.parse(p.secoes_editadas || '{}') };
    for (const [k, t] of Object.entries(b.secoesEditadas ?? {})) {
      if (t === null) delete editadas[k];
      else if (t !== undefined) editadas[k] = t;
    }
    const cols: Record<string, unknown> = {
      contexto: b.contexto ?? p.contexto, escopo: b.escopo ?? p.escopo, observacoes: b.observacoes ?? p.observacoes,
      validade_dias: b.validadeDias ?? p.validade_dias, pagamento: b.pagamento ?? p.pagamento,
      consultor_email: b.consultorEmail === undefined ? p.consultor_email : b.consultorEmail,
      secoes_editadas: Object.keys(editadas).length ? JSON.stringify(editadas) : null,
    };
    const stmts: D1PreparedStatement[] = [];
    if (b.itens) {
      const cfg = await lerConfigOrg(db, orgId);
      const itens = await resolverItens(db, orgId, b.itens, await itensDe(db, id));
      const calc = calcular(itens, cfg, await diagnosticoDaProposta(db, p.assessment_id));
      // itens mudaram: a aprovação de desconto dada antes não vale para o desconto novo
      Object.assign(cols, {
        total_projeto: calc.totais.totalProjeto, mensalidade: calc.totais.mensalidade,
        memoria: JSON.stringify(calc.memoria), margem: JSON.stringify(calc.margem),
        status: 'rascunho', desconto_aprovado_por: null, desconto_aprovado_em: null,
      });
      stmts.push(...stmtsItens(db, id, itens, calc));
    }
    const nomes = Object.keys(cols);
    // A guarda de status vale para a proposta e, no mesmo batch, para os itens (stmtsItens):
    // gerada entre a leitura e o batch, nada muda e a resposta é 409.
    stmts.unshift(db.prepare(`UPDATE propostas SET ${nomes.map((n) => `${n} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND org_id = ? AND status IN ${EDITAVEIS}`).bind(...Object.values(cols), id, orgId));
    const res = await db.batch(stmts);
    if (!res[0].meta.changes) return c.json(JA_GERADA, 409);
    await logAudit(db, 'proposta.editada', user.email ?? 'system', `Proposta ${id} editada: ${Object.keys(b).join(', ') || 'nenhum campo'}`);
    return c.json(await saida(db, orgId, id));
  } catch (e) { return falha(c, e, 'Erro ao editar a proposta'); }
});

propostasApp.get('/:id/previa', async (c) => {
  try {
    const db = c.env.DB;
    const orgId = c.get('orgId');
    const p = await achar(db, orgId, c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    const cfg = await lerConfigOrg(db, orgId);
    const itens = await itensDe(db, p.id);
    const dg = await diagnosticoDaProposta(db, p.assessment_id);
    const numero = p.numero ?? formatarNumeroProposta(cfg.prefixoProposta, Number(diaEmBrasilia().slice(0, 4)), cfg.proximoNumero);
    const { conteudo, html, textos } = await montar(db, cfg, p, itens, calcular(itens, cfg, dg), dg, numero);
    // só a parte editável de cada seção editável presente, para a tela pré-preencher (seção ausente: sem chave)
    return c.json({ conteudo, html, textos });
  } catch (e) { return falha(c, e, 'Erro ao montar a prévia'); }
});

propostasApp.post('/:id/gerar', async (c) => {
  let numero = '';
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const orgId = c.get('orgId');
    const p = await achar(db, orgId, c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    if (!['rascunho', 'aguardando_aprovacao'].includes(p.status)) return c.json(JA_GERADA, 409);
    // aceita uma revisão, as outras não geram (o fechamento já as substituiu; isto cobre dado antigo)
    if (p.revisao > 1 && await db.prepare(`SELECT 1 FROM propostas WHERE org_id = ? AND numero = ? AND status = 'aceita'`).bind(orgId, p.numero).first()) {
      return c.json({ error: 'Esta proposta já foi aceita em outra revisão' }, 409);
    }
    const v = await validateBody(c, propostaGerarSchema);
    if (!v.success) return v.response;

    const cfg = await lerConfigOrg(db, orgId);
    const itens = await itensDe(db, p.id);
    if (!itens.length) return c.json({ error: 'A proposta não tem serviços' }, 409);
    const dg = await diagnosticoDaProposta(db, p.assessment_id);
    const calc = calcular(itens, cfg, dg);
    if (descontoAcimaDoTeto(calc.calcs, cfg.preco.tetoDesconto) && !p.desconto_aprovado_por) {
      await db.prepare(`UPDATE propostas SET status = 'aguardando_aprovacao', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ${EDITAVEIS}`).bind(p.id).run();
      return c.json({ error: `Desconto acima do teto de ${cfg.preco.tetoDesconto}%: a proposta aguarda a aprovação do administrador` }, 409);
    }
    if (!cfg.textos.termos.trim()) return c.json({ error: 'A organização não tem termos e condições: configure-os antes de gerar' }, 409);

    // Número: a revisão mantém o da original; senão o manual (validado) ou o próximo da sequência.
    const ano = Number(diaEmBrasilia().slice(0, 4));
    let proximo: number | null = null;
    if (p.numero) {
      if (v.data.numero !== undefined && v.data.numero !== p.numero) return c.json({ error: `A revisão mantém o número ${p.numero}` }, 400);
      numero = p.numero;
    } else if (v.data.numero !== undefined) {
      numero = v.data.numero;
      const m = new RegExp(`^${cfg.prefixoProposta}-(\\d{4})-(\\d{3,})$`).exec(numero);
      if (!cfg.prefixoProposta || !m) return c.json({ error: `Número fora do formato ${cfg.prefixoProposta || 'PREFIXO'}-AAAA-NNN` }, 400);
      if (await db.prepare('SELECT 1 FROM propostas WHERE org_id = ? AND numero = ?').bind(orgId, numero).first()) {
        return c.json({ error: `Número ${numero} já usado nesta organização` }, 409);
      }
      // manual à frente da sequência do ano: a automática continua depois dele, sem colidir
      if (Number(m[1]) === ano) proximo = Number(m[2]) + 1;
    } else {
      if (!cfg.prefixoProposta) return c.json({ error: 'Configure o prefixo das propostas da organização antes de gerar' }, 409);
      numero = formatarNumeroProposta(cfg.prefixoProposta, ano, cfg.proximoNumero);
      proximo = cfg.proximoNumero + 1;
    }

    const { conteudo, html, validaAte } = await montar(db, cfg, p, itens, calc, dg, numero);
    const hash = await hashDocumento(html);
    // Tudo num batch (transação): sem número reservado à toa se algo falhar. Duas gerações
    // simultâneas com o mesmo número esbarram no índice único (org_id, numero, revisao) e uma leva 409.
    // Os passos depois do primeiro só valem se a proposta de fato foi gerada por esta chamada.
    // Duas gerações simultâneas do mesmo conteúdo chegam ao mesmo hash, então o hash não distingue
    // quem gerou: a trilha usa changes() logo depois do UPDATE (0 se esta chamada não gerou). Os
    // demais passos ficam no hash: se ele bate, os valores gravados seriam os mesmos.
    const feito = 'EXISTS (SELECT 1 FROM propostas WHERE id = ? AND documento_hash = ?)';
    const stmts = [
      db.prepare(`UPDATE propostas SET numero = ?, status = 'gerada', total_projeto = ?, mensalidade = ?, memoria = ?, margem = ?,
        documento_conteudo = ?, documento_html = ?, documento_hash = ?, gerada_em = CURRENT_TIMESTAMP, valida_ate = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND org_id = ? AND status IN ${EDITAVEIS}`)
        .bind(numero, calc.totais.totalProjeto, calc.totais.mensalidade, JSON.stringify(calc.memoria), JSON.stringify(calc.margem),
          JSON.stringify(conteudo), html, hash, validaAte, p.id, orgId),
      db.prepare(`INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
        SELECT ?, 'proposta.gerada', ?, ?, '', '', NULL, datetime('now') WHERE changes() > 0`)
        .bind(genId(), user.email ?? 'system', `Proposta ${p.id} gerada: ${numero} rev. ${p.revisao}, hash ${hash}`),
      ...itens.map((i, k) => db.prepare(`UPDATE proposta_itens SET valor_base = ?, desconto_pct = ?, valor = ? WHERE id = ? AND ${feito}`)
        .bind(calc.calcs[k].valorBase, calc.calcs[k].descontoPct, calc.calcs[k].valor, i.id, p.id, hash)),
    ];
    if (proximo !== null) {
      stmts.push(db.prepare(`UPDATE organizations SET proximo_numero = MAX(proximo_numero, ?) WHERE id = ? AND ${feito}`).bind(proximo, orgId, p.id, hash));
    }
    if (p.revisao > 1) {
      stmts.push(db.prepare(`UPDATE propostas SET status = 'substituida', updated_at = CURRENT_TIMESTAMP
        WHERE org_id = ? AND numero = ? AND revisao < ? AND status IN ('gerada', 'enviada', 'visualizada', 'expirada') AND ${feito}`)
        .bind(orgId, numero, p.revisao, p.id, hash));
    }
    const res = await db.batch(stmts);
    if (!res[0].meta.changes) return c.json(JA_GERADA, 409);
    return c.json(await saida(db, orgId, p.id));
  } catch (e) {
    if (unico(e)) return c.json({ error: `Número ${numero} já usado nesta organização: escolha outro ou ajuste o próximo número na configuração` }, 409);
    return falha(c, e, 'Erro ao gerar a proposta');
  }
});

propostasApp.post('/:id/aprovar-desconto', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const orgId = c.get('orgId');
    if (!podeAdministrarOrg(user, orgId)) return c.json({ error: 'Forbidden: só o administrador da organização aprova desconto acima do teto' }, 403);
    const p = await achar(db, orgId, c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    if (p.status !== 'aguardando_aprovacao') return c.json({ error: 'A proposta não está aguardando aprovação de desconto' }, 409);
    await db.prepare(`UPDATE propostas SET desconto_aprovado_por = ?, desconto_aprovado_em = CURRENT_TIMESTAMP, status = 'rascunho',
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ? AND status = 'aguardando_aprovacao'`).bind(user.email, p.id, orgId).run();
    await logAudit(db, 'proposta.desconto_aprovado', user.email ?? 'system', `Desconto acima do teto aprovado na proposta ${p.id}`);
    return c.json(await saida(db, orgId, p.id));
  } catch (e) { return erro500(c, 'Erro ao aprovar o desconto', e); }
});

propostasApp.post('/:id/revisao', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const orgId = c.get('orgId');
    const p = await achar(db, orgId, c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    // visualizada entra com o link do cliente (fatia 4): "pedir ajuste" chega depois de ver;
    // expirada sai por revisão, com validade nova
    if (!['gerada', 'enviada', 'visualizada', 'expirada'].includes(p.status)) return c.json({ error: 'Só proposta gerada, enviada ou expirada ganha revisão' }, 409);
    const id = genId();
    // Itens copiados com a cópia do serviço congelada: a revisão não relê o catálogo.
    // A aprovação de desconto não passa adiante; a revisão gera de novo e confere o teto de novo.
    const linhas = (await db.prepare('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY ordem').bind(p.id).all<any>()).results;
    try {
      await db.batch([
        db.prepare(`INSERT INTO propostas (id, org_id, lead_id, assessment_id, numero, revisao, status, cliente, validade_dias, pagamento,
          contexto, escopo, observacoes, secoes_editadas, consultor_email, total_projeto, mensalidade, memoria, margem, criada_por)
          SELECT ?, org_id, lead_id, assessment_id, numero, revisao + 1, 'rascunho', cliente, validade_dias, pagamento,
          contexto, escopo, observacoes, secoes_editadas, consultor_email, total_projeto, mensalidade, memoria, margem, ?
          FROM propostas WHERE id = ?`).bind(id, user.email ?? 'system', p.id),
        ...linhas.map((r) => db.prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico_id, servico, dias, meses, valor_base, desconto_pct, valor, texto_cliente)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(genId(), id, r.ordem, r.servico_id, r.servico, r.dias, r.meses, r.valor_base, r.desconto_pct, r.valor, r.texto_cliente)),
      ]);
    } catch (e) {
      if (unico(e)) return c.json({ error: `Já existe a revisão ${p.revisao + 1} da proposta ${p.numero}` }, 409);
      throw e;
    }
    await logAudit(db, 'proposta.revisao', user.email ?? 'system', `Revisão ${p.revisao + 1} (${id}) da proposta ${p.numero}, a partir de ${p.id}`);
    return c.json(await saida(db, orgId, id), 201);
  } catch (e) { return erro500(c, 'Erro ao criar a revisão', e); }
});

propostasApp.get('/:id/docx', async (c) => {
  try {
    const p = await achar(c.env.DB, c.get('orgId'), c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    if (!p.documento_conteudo) return c.json({ error: 'A proposta ainda não foi gerada' }, 409);
    const rodape = `Cópia de trabalho. Vale a versão ${p.numero} rev. ${p.revisao} do n.iso, hash ${String(p.documento_hash).slice(0, 8)}.`;
    const bytes = await renderizarDocx(JSON.parse(p.documento_conteudo), rodape);
    // o número só tem [A-Z0-9-] (prefixo e formato validados), então cabe no filename sem escape
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${p.numero}-rev${p.revisao}.docx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) { return erro500(c, 'Erro ao gerar o Word', e); }
});

propostasApp.get('/:id/documento', async (c) => {
  try {
    const p = await achar(c.env.DB, c.get('orgId'), c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    if (!p.documento_html) return c.json({ error: 'A proposta ainda não foi gerada' }, 409);
    // o HTML gravado, nunca remontado
    return new Response(p.documento_html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_DOCUMENTO, 'Cache-Control': 'no-store' },
    });
  } catch (e) { return erro500(c, 'Erro ao ler o documento', e); }
});

// Envio e link (fatia 4). O token é a credencial do cliente: 32 bytes CSPRNG, no banco só o SHA-256,
// na URL só no fragmento (o servidor nunca o recebe) e nunca em trilha, log ou resposta de enviar.
const URL_BASE = 'https://niso.ness.com.br';
const ENVIAVEL = ['gerada', 'enviada', 'visualizada', 'expirada'];
const NAO_ENVIAVEL = (status: string) => ({ error: `Proposta em "${status}" não pode ser enviada: só gerada, enviada, visualizada ou expirada` });
/** Link novo não nasce vencido: validade passada (expirada ou não) pede revisão. */
const VENCIDA = { error: 'A validade passou: gere uma revisão com nova validade' };
const vencida = (p: any) => !!p.valida_ate && String(p.valida_ate).slice(0, 10) < diaEmBrasilia();
const dataBr = (dia: string | null) => (dia ? dia.slice(0, 10).split('-').reverse().join('/') : '');
/** Nome de organização no cabeçalho From: sem <, >, aspas nem quebra de linha. */
const nomeSeguro = (n: string) => n.replace(/[<>"\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'ness.';

function emailProposta(nome: string, p: any, link: string, mensagem?: string): string {
  const e = escapeHtml;
  return `<div style="font-family: Arial, sans-serif; max-width: 560px; color: #1e293b;">
    <h2 style="margin: 0 0 12px;">${e(nome)}</h2>
    <p>Segue a proposta <strong>${e(p.numero)}</strong> (revisão ${e(String(p.revisao))}), válida até <strong>${e(dataBr(p.valida_ate))}</strong>.</p>
    ${mensagem ? `<p style="white-space: pre-wrap;">${e(mensagem)}</p>` : ''}
    <p><a href="${e(link)}" style="background-color: #00ade8; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Ver e responder a proposta</a></p>
  </div>`;
}

/** Troca o token da proposta (o anterior morre) e põe a proposta em 'enviada'. false: o estado mudou no meio. */
async function gravarToken(db: D1Database, p: any, hash: string, enviadaPara?: string) {
  const r = await db.prepare(`UPDATE propostas SET token_hash = ?, status = 'enviada', visualizada_em = NULL, link_gerado_em = CURRENT_TIMESTAMP,
    enviada_em = ${enviadaPara ? 'CURRENT_TIMESTAMP' : 'COALESCE(enviada_em, CURRENT_TIMESTAMP)'},
    enviada_para = ${enviadaPara ? '?' : 'enviada_para'}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND org_id = ? AND status IN (${ENVIAVEL.map(() => '?').join(', ')})`)
    .bind(...[hash, ...(enviadaPara ? [enviadaPara] : []), p.id, p.org_id, ...ENVIAVEL]).run();
  return r.meta.changes > 0;
}

propostasApp.post('/:id/enviar', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const p = await achar(db, c.get('orgId'), c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    if (!ENVIAVEL.includes(p.status)) return c.json(NAO_ENVIAVEL(p.status), 409);
    if (vencida(p)) return c.json(VENCIDA, 409);
    const v = await validateBody(c, propostaEnviarSchema);
    if (!v.success) return v.response;
    // sem a chave, o sendEmail só simula: marcar enviada com um link que ninguém recebeu engana o comercial
    if (!c.env.RESEND_API_KEY) return c.json({ error: 'Envio de e-mail não configurado' }, 503);
    const token = genToken();
    const nome = nomeSeguro((await lerConfigOrg(db, p.org_id)).nome);
    // e-mail primeiro: se falhar, nada foi gravado e o link anterior continua valendo
    const ok = await sendEmail(c, v.data.email, `Proposta ${p.numero} - ${nome}`,
      emailProposta(nome, p, `${URL_BASE}/proposta#${token}`, v.data.mensagem),
      { from: `${nome} via n.iso <noreply@ness.com.br>`, replyTo: user.email });
    if (!ok) return c.json({ error: 'Não foi possível enviar o e-mail: nada foi alterado, tente de novo' }, 502);
    if (!(await gravarToken(db, p, await sha256Hex(token), v.data.email))) return c.json({ error: 'A proposta mudou de estado durante o envio: confira e envie de novo' }, 409);
    await logAudit(db, 'proposta.enviada', user.email ?? 'system', `Proposta ${p.id} (${p.numero} rev. ${p.revisao}) enviada para ${v.data.email}`);
    return c.json(await saida(db, p.org_id, p.id));
  } catch (e) { return erro500(c, 'Erro ao enviar a proposta', e); }
});

// De 'gerada' o link também leva a 'enviada': o aceite pelo link só vale de enviada/visualizada.
propostasApp.post('/:id/link', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const p = await achar(db, c.get('orgId'), c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    if (!ENVIAVEL.includes(p.status)) return c.json(NAO_ENVIAVEL(p.status), 409);
    if (vencida(p)) return c.json(VENCIDA, 409);
    const token = genToken();
    if (!(await gravarToken(db, p, await sha256Hex(token)))) return c.json({ error: 'A proposta mudou de estado: confira e tente de novo' }, 409);
    await logAudit(db, 'proposta.link_gerado', user.email ?? 'system', `Link da proposta ${p.id} (${p.numero} rev. ${p.revisao}) gerado; o anterior deixou de valer`);
    // a única vez que o token existe fora do e-mail: só o hash fica no banco
    return c.json({ url: `${URL_BASE}/proposta#${token}` });
  } catch (e) { return erro500(c, 'Erro ao gerar o link', e); }
});

propostasApp.post('/:id/revogar-link', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const p = await achar(db, c.get('orgId'), c.req.param('id'));
    if (!p) return c.json(NAO_ACHADA, 404);
    await db.prepare('UPDATE propostas SET token_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?').bind(p.id, p.org_id).run();
    await logAudit(db, 'proposta.link_revogado', user.email ?? 'system', `Link da proposta ${p.id} (${p.numero} rev. ${p.revisao}) revogado`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Erro ao revogar o link', e); }
});

propostasApp.post('/:id/aceite-manual', async (c) => {
  try {
    const user = c.get('user');
    const orgId = c.get('orgId');
    const id = c.req.param('id');
    if (!(await achar(c.env.DB, orgId, id))) return c.json(NAO_ACHADA, 404);
    const v = await validateBody(c, propostaAceiteManualSchema);
    if (!v.success) return v.response;
    const r = await fecharVenda(c.env.DB, {
      propostaId: id, orgId, origem: 'manual', atorEmail: user.email ?? 'system',
      aceite: { ...v.data, ip: c.req.header('CF-Connecting-IP') ?? '' },
    });
    if (!r.ok) return c.json({ error: r.mensagem }, r.motivo === 'nao_encontrada' ? 404 : 409);
    return c.json({ contratoId: r.contratoId, projetoId: r.projetoId });
  } catch (e) { return erro500(c, 'Erro ao registrar o aceite', e); }
});
