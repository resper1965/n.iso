import { listarIncidentes } from './incidentes';
import { listarPedidos } from './titular-pedidos';
import { listarTerceiros } from './terceiros';
import { lacunasDaFonte } from './requisitos';
import { lerParametros } from './parametros-legais';
import { ehLegitimoInteresse } from './lia';

/**
 * Núcleo do n.privacy, fatia 8: a visão do encarregado. É CONSULTA sobre as tabelas das fatias anteriores, nunca grava: o que está atrasado
 * ou faltando num projeto, numa chamada só. Bloco sem dado aparece zerado ou "não carregado", sem número inventado.
 */

export type Prioridade = { nivel: 'alta' | 'media'; texto: string; tela: string };

const hoje = () => new Date().toISOString().slice(0, 10);
const n = async (db: D1Database, sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;

export async function visaoDoEncarregado(db: D1Database, projectId: string) {
  const dia = hoje();
  const em7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [pedidos, incidentes, terceiros, parametros, fontes] = await Promise.all([
    listarPedidos(db, projectId), listarIncidentes(db, projectId), listarTerceiros(db, projectId), lerParametros(db),
    db.prepare(`SELECT count(*) AS n FROM requisitos WHERE fonte_id = 'lgpd'`).first<{ n: number }>(),
  ]);

  const pedidosAbertos = pedidos.filter((p) => ['recebido', 'em_andamento'].includes(p.status));
  const incidentesAbertos = incidentes.filter((i) => i.status !== 'encerrado');
  const comunicacoes = incidentesAbertos.flatMap((i) => [i.situacao_anpd, i.situacao_titular].filter((s) => i.risco_titular !== 'sem_risco' && s !== 'comunicado'));

  // Tratamentos: contas que dependem de texto livre (legítimo interesse) são feitas aqui, sobre as poucas linhas do projeto.
  const { results: trat } = await db.prepare(
    `SELECT r.id, r.legal_basis, r.base_legal_id, r.owner, r.owner_parte_id, r.dpia_required, q.titulo AS base_titulo,
            EXISTS (SELECT 1 FROM dpia_assessments d WHERE d.ropa_id = r.id AND d.project_id = r.project_id) AS tem_dpia,
            EXISTS (SELECT 1 FROM lia_assessments l WHERE l.ropa_id = r.id AND l.project_id = r.project_id) AS tem_lia
       FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id WHERE r.project_id = ?`
  ).bind(projectId).all<{ id: string; legal_basis: string | null; base_legal_id: string | null; owner: string | null; owner_parte_id: string | null; dpia_required: number | null; base_titulo: string | null; tem_dpia: number; tem_lia: number }>();
  const comTerceiroVencido = await n(db,
    `SELECT count(DISTINCT v.alvo_id) AS n FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
      WHERE v.project_id = ?1 AND v.alvo_tipo = 'tratamento' AND p.tipo = 'organizacao'
        AND (SELECT CASE WHEN a.resultado <> 'reprovado' THEN a.valido_ate END FROM avaliacoes_terceiro a WHERE a.parte_id = p.id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) < ?2`, projectId, dia);

  const tratamentos = {
    total: trat.length,
    sem_base_legal: trat.filter((t) => !t.base_legal_id && !String(t.legal_basis ?? '').trim()).length,
    dpia_pendente: trat.filter((t) => t.dpia_required && !t.tem_dpia).length,
    lia_pendente: trat.filter((t) => ehLegitimoInteresse(t.base_titulo, t.legal_basis) && !t.tem_lia).length,
    sem_responsavel: trat.filter((t) => !t.owner_parte_id && !String(t.owner ?? '').trim()).length,
    com_terceiro_vencido: comTerceiroVencido,
  };

  const lgpdCarregada = (fontes?.n ?? 0) > 0;
  const lacunas = lgpdCarregada ? await lacunasDaFonte(db, projectId, 'lgpd') : [];
  const evidencias = {
    vencidas: await n(db, `SELECT count(*) AS n FROM evidence WHERE project_id = ?1 AND valido_ate IS NOT NULL AND valido_ate < ?2`, projectId, dia),
    vencem_em_7_dias: await n(db, `SELECT count(*) AS n FROM evidence WHERE project_id = ?1 AND valido_ate IS NOT NULL AND valido_ate >= ?2 AND valido_ate <= ?3`, projectId, dia, em7),
  };

  const secao = {
    pedidos_titular: {
      abertos: pedidosAbertos.length,
      atrasados: pedidosAbertos.filter((p) => p.situacao_prazo === 'atrasado').length,
      vencem_em_7_dias: pedidosAbertos.filter((p) => p.prazo_em && p.prazo_em.slice(0, 10) >= dia && p.prazo_em.slice(0, 10) <= em7).length,
      sem_prazo: pedidosAbertos.filter((p) => p.situacao_prazo === 'sem_prazo').length,
      itens: pedidosAbertos.slice(0, 5).map((p) => ({ id: p.id, protocolo: p.protocolo, tipo: p.tipo, prazo_em: p.prazo_em, situacao_prazo: p.situacao_prazo })),
    },
    incidentes: {
      abertos: incidentesAbertos.length,
      comunicacoes_atrasadas: comunicacoes.filter((s) => s === 'atrasado').length,
      comunicacoes_pendentes: comunicacoes.length,
      sem_avaliacao_de_risco: incidentesAbertos.filter((i) => !i.risco_titular).length,
      itens: incidentesAbertos.slice(0, 5).map((i) => ({ id: i.id, protocolo: i.protocolo, titulo: i.titulo, risco_titular: i.risco_titular, situacao_anpd: i.situacao_anpd, situacao_titular: i.situacao_titular })),
    },
    tratamentos,
    terceiros: {
      total: terceiros.length,
      sem_tipo: terceiros.filter((t) => !t.terceiro_tipo).length,
      pendentes: terceiros.filter((t) => t.terceiro_tipo && t.situacao === 'pendente').length,
      vencidos: terceiros.filter((t) => t.situacao === 'vencida').length,
      reprovados: terceiros.filter((t) => t.situacao === 'reprovada').length,
    },
    documentos: { revisao_vencida: await n(db, `SELECT count(*) AS n FROM documentos WHERE project_id = ?1 AND status = 'vigente' AND revisar_ate IS NOT NULL AND substr(revisar_ate, 1, 10) < ?2`, projectId, dia) },
    evidencias,
    lgpd: lgpdCarregada
      ? { carregada: true, total: lacunas.length, cobertos: lacunas.filter((l) => l.situacao === 'coberto').length, parciais: lacunas.filter((l) => l.situacao === 'parcial').length, lacunas: lacunas.filter((l) => l.situacao === 'lacuna').length }
      : { carregada: false },
    prazos_legais: { nao_definidos: parametros.filter((p) => !p.definido).map((p) => p.chave) },
  };

  const prioridades: Prioridade[] = [];
  const p = (nivel: Prioridade['nivel'], quantidade: number, texto: (q: number) => string, tela: string) => { if (quantidade > 0) prioridades.push({ nivel, texto: texto(quantidade), tela }); };
  p('alta', secao.pedidos_titular.atrasados, (q) => `${q} ${q === 1 ? 'pedido do titular atrasado' : 'pedidos do titular atrasados'}`, 'titular');
  p('alta', secao.incidentes.comunicacoes_atrasadas, (q) => `${q} ${q === 1 ? 'comunicação de incidente atrasada' : 'comunicações de incidente atrasadas'}`, 'titular');
  p('alta', secao.incidentes.sem_avaliacao_de_risco, (q) => `${q} ${q === 1 ? 'incidente sem avaliação de risco' : 'incidentes sem avaliação de risco'}`, 'titular');
  p('alta', secao.terceiros.vencidos, (q) => `${q} ${q === 1 ? 'terceiro com avaliação vencida' : 'terceiros com avaliação vencida'}`, 'terceiros');
  p('alta', secao.tratamentos.dpia_pendente, (q) => `${q} ${q === 1 ? 'tratamento exige DPIA e não tem' : 'tratamentos exigem DPIA e não têm'}`, 'ropa');
  p('alta', secao.tratamentos.lia_pendente, (q) => `${q} ${q === 1 ? 'tratamento por legítimo interesse sem LIA' : 'tratamentos por legítimo interesse sem LIA'}`, 'ropa');
  p('media', secao.pedidos_titular.vencem_em_7_dias, (q) => `${q} ${q === 1 ? 'pedido do titular vence' : 'pedidos do titular vencem'} em até 7 dias`, 'titular');
  p('media', secao.evidencias.vencidas, (q) => `${q} ${q === 1 ? 'evidência vencida' : 'evidências vencidas'}`, 'evidence');
  p('media', secao.documentos.revisao_vencida, (q) => `${q} ${q === 1 ? 'documento com revisão vencida' : 'documentos com revisão vencida'}`, 'documentos');
  p('media', secao.terceiros.pendentes, (q) => `${q} ${q === 1 ? 'terceiro nunca avaliado' : 'terceiros nunca avaliados'}`, 'terceiros');
  p('media', secao.tratamentos.sem_base_legal, (q) => `${q} ${q === 1 ? 'tratamento sem base legal' : 'tratamentos sem base legal'}`, 'ropa');
  if (secao.lgpd.carregada) p('media', secao.lgpd.lacunas ?? 0, (q) => `${q} ${q === 1 ? 'requisito da LGPD sem cobertura' : 'requisitos da LGPD sem cobertura'}`, 'requisitos');
  p('media', secao.prazos_legais.nao_definidos.length, (q) => `${q} ${q === 1 ? 'prazo legal ainda não cadastrado' : 'prazos legais ainda não cadastrados'} (os prazos ficam "não calculados")`, 'titular');

  return { gerado_em: new Date().toISOString(), prioridades, ...secao };
}
