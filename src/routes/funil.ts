import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { somenteComercial, erro500 } from '../helpers';
import { exigirOrg } from '../services/organizacao';
import { diaEmBrasilia } from './propostas';

export const funilApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Preço, pipeline e motivo de perda: área comercial (consultor comum e cliente: 403).
funilApp.use('*', somenteComercial);
funilApp.use('*', exigirOrg);

const STATUS_LEAD = ['New', 'Assessment', 'Proposal', 'Won', 'Lost'] as const;
const STATUS_PROPOSTA = ['rascunho', 'aguardando_aprovacao', 'gerada', 'enviada', 'visualizada', 'aceita', 'recusada', 'expirada', 'substituida'] as const;
const EM_ABERTO = ['aguardando_aprovacao', 'gerada', 'enviada', 'visualizada'];
const DIA_MS = 86_400_000;

const dia = (s: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : null;
  return d && !isNaN(+d) ? d : null;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const reais = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;
const pct = (parte: number, base: number) => (base ? Math.round((parte / base) * 1000) / 10 : 0);

// O banco guarda UTC; Brasília é UTC-3 o ano todo (sem horário de verão desde 2019). `date(x, '-3 hours')`
// é o dia em Brasília, que é o que `diaEmBrasilia` devolve para "hoje".
const BR = (col: string) => `date(${col}, '-3 hours')`;

funilApp.get('/', async (c) => {
  try {
    const ate = c.req.query('ate') ?? diaEmBrasilia();
    const dAte = dia(ate);
    const deQ = c.req.query('de');
    const dDe = deQ ? dia(deQ) : dAte && new Date(dAte.getTime() - 89 * DIA_MS);
    if (!dAte || !dDe || iso(dAte) !== ate || iso(dDe) !== (deQ ?? iso(dDe))) return c.json({ error: 'Datas inválidas: use YYYY-MM-DD' }, 400);
    if (dDe > dAte) return c.json({ error: 'A data inicial é posterior à final' }, 400);
    if ((dAte.getTime() - dDe.getTime()) / DIA_MS + 1 > 366) return c.json({ error: 'Janela máxima de 366 dias' }, 400);
    const de = iso(dDe);

    const db = c.env.DB;
    const org = c.get('orgId');
    const q = <T = any>(sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).all<T>().then((r) => r.results);
    const um = <T = any>(sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).first<T>();

    const leadsJanela = `FROM leads l WHERE l.org_id = ? AND ${BR('l.created_at')} BETWEEN ? AND ?`;
    // Só a revisão mais recente de cada número (revisão antiga ainda "aberta" não é pipeline).
    const maisRecente = `NOT EXISTS (SELECT 1 FROM propostas q WHERE q.org_id = p.org_id AND q.numero = p.numero AND q.revisao > p.revisao)`;
    const marcas = EM_ABERTO.map(() => '?').join(',');

    const [porStatus, criados, comGerada, comEnviada, comAceita, pipe, ganho, ciclo, recusadas, porStatusProp] = await Promise.all([
      q<{ status: string; n: number }>(`SELECT l.status, COUNT(*) n ${leadsJanela} GROUP BY l.status`, org, de, ate),
      um<{ n: number }>(`SELECT COUNT(*) n ${leadsJanela}`, org, de, ate),
      ...['gerada_em IS NOT NULL', 'enviada_em IS NOT NULL', `status = 'aceita'`].map((cond) =>
        um<{ n: number }>(`SELECT COUNT(*) n ${leadsJanela} AND EXISTS (SELECT 1 FROM propostas p WHERE p.lead_id = l.id AND p.org_id = l.org_id AND p.${cond})`, org, de, ate)),
      um(`SELECT COUNT(*) n, SUM(p.total_projeto) projeto, SUM(p.mensalidade) mensalidade FROM propostas p
          WHERE p.org_id = ? AND p.status IN (${marcas}) AND ${maisRecente}`, org, ...EM_ABERTO),
      um(`SELECT COUNT(*) n, SUM(p.total_projeto) projeto, SUM(p.mensalidade) mensalidade FROM propostas p
          WHERE p.org_id = ? AND p.status = 'aceita' AND ${BR('p.aceite_em')} BETWEEN ? AND ? AND ${maisRecente}`, org, de, ate),
      um(`SELECT AVG(julianday(p.aceite_em) - julianday(l.created_at)) dias FROM propostas p JOIN leads l ON l.id = p.lead_id AND l.org_id = p.org_id
          WHERE p.org_id = ? AND p.status = 'aceita' AND ${BR('p.aceite_em')} BETWEEN ? AND ?`, org, de, ate),
      q<{ recusa_motivo: string | null }>(`SELECT p.recusa_motivo FROM propostas p WHERE p.org_id = ? AND p.status = 'recusada' AND ${BR('p.updated_at')} BETWEEN ? AND ?`, org, de, ate),
      q<{ status: string; n: number }>(`SELECT p.status, COUNT(*) n FROM propostas p WHERE p.org_id = ? AND ${BR('p.created_at')} BETWEEN ? AND ? GROUP BY p.status`, org, de, ate),
    ]);

    const conta = (rows: { status: string; n: number }[], chaves: readonly string[]) =>
      Object.fromEntries(chaves.map((k) => [k, rows.find((r) => r.status === k)?.n ?? 0]));
    const n0 = criados?.n ?? 0, n1 = comGerada?.n ?? 0, n2 = comEnviada?.n ?? 0, n3 = comAceita?.n ?? 0;

    const motivos = new Map<string, number>();
    for (const r of recusadas) {
      const m = (r.recusa_motivo ?? '').trim().toLowerCase() || 'sem motivo';
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }

    return c.json({
      periodo: { de, ate },
      leads: conta(porStatus, STATUS_LEAD),
      conversao: [
        { etapa: 'leads criados', leads: n0, percentualDaAnterior: 100 },
        { etapa: 'proposta gerada', leads: n1, percentualDaAnterior: pct(n1, n0) },
        { etapa: 'proposta enviada', leads: n2, percentualDaAnterior: pct(n2, n1) },
        { etapa: 'proposta aceita', leads: n3, percentualDaAnterior: pct(n3, n2) },
      ],
      // Projeto e mensalidade são naturezas diferentes (pontual x recorrente): nunca somados.
      pipeline: { propostas: pipe?.n ?? 0, totalProjeto: reais(pipe?.projeto), mensalidade: reais(pipe?.mensalidade) },
      ganho: { propostas: ganho?.n ?? 0, totalProjeto: reais(ganho?.projeto), mensalidade: reais(ganho?.mensalidade) },
      cicloMedioDias: ciclo?.dias == null ? null : Math.round(Number(ciclo.dias) * 10) / 10,
      perdas: [...motivos].map(([motivo, quantidade]) => ({ motivo, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)).slice(0, 10),
      propostasPorStatus: conta(porStatusProp, STATUS_PROPOSTA),
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao calcular o funil', e);
  }
});
