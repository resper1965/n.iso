// Documento da proposta (spec do sistema de propostas, seção 5). Módulo puro, sem banco.
// montarConteudo produz um modelo de seções (o que fica congelado e de onde sai o Word);
// renderizarHtml transforma esse modelo em HTML A4 para impressão. Todo texto passa por
// escapeHtml na renderização, e nada aqui lê a hora atual: mesmas entradas, mesmo HTML, mesmo hash.
import { escapeHtml, sha256Hex } from '../helpers';
import { ORG_NESS, type ConfigOrg } from './organizacao';
import { brl, num, type ItemCalculado } from './preco-proposta';
import type { Servico } from '../schemas/domain';
import type { Diagnostico } from './diagnostico';

export interface DadosDocumento {
  org: ConfigOrg; numero: string; revisao: number; emitidaEm: string; validaAte: string;
  cliente: { nome: string; cnpj: string | null; pessoas: number | null };
  textos: { contexto: string; escopo: string; observacoes: string };
  itens: { servico: Servico; calc: ItemCalculado; textoCliente: string }[];
  totais: { totalProjeto: number; mensalidade: number };
  pagamento: string; diagnostico: Diagnostico | null;
}
export type SecaoId = 'capa' | 'sumario' | 'diagnostico' | 'lacunas' | 'objeto' | 'como_trabalhamos' | 'plano' | 'cronograma' | 'responsabilidades' | 'sobre' | 'investimento' | 'premissas' | 'termos' | 'observacoes' | 'aceite';
export const SECOES_EDITAVEIS: SecaoId[] = ['sumario', 'objeto', 'como_trabalhamos', 'responsabilidades', 'sobre', 'premissas', 'termos', 'observacoes'];
export type Bloco =
  | { t: 'p'; texto: string }
  | { t: 'lista'; itens: string[] }
  | { t: 'sub'; texto: string }
  | { t: 'tabela'; cab: string[]; linhas: string[][]; total?: string[] }
  | { t: 'barras'; itens: { rotulo: string; pct: number }[] }
  | { t: 'gantt'; fases: { rotulo: string; ini: number; fim: number }[]; semanas: number }
  | { t: 'kpis'; itens: { valor: string; rotulo: string }[] };
export interface Secao { id: SecaoId; numero: string | null; titulo: string; blocos: Bloco[]; editada: boolean }
export interface ConteudoDocumento {
  org: { nome: string; cor: string; marcaNess: boolean; selo: boolean };
  numero: string; revisao: number; emitidaEm: string; validaAte: string;
  capa: { titulo: string; cliente: string; cnpj: string | null; pessoas: number | null; duracao: string | null; investimento: string };
  secoes: Secao[];
}

const COR_PADRAO = '#00ade8';

// ── Texto simples <-> blocos ─────────────────────────────────────────────────

/** Parágrafo por linha em branco; linha "- " vira item de lista; linha "## " vira subtítulo. */
export function textoParaBlocos(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const trecho of (texto ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    let par: string[] = [];
    let lista: string[] = [];
    const fecha = () => {
      if (par.length) blocos.push({ t: 'p', texto: par.join(' ') });
      if (lista.length) blocos.push({ t: 'lista', itens: lista });
      par = []; lista = [];
    };
    for (const bruta of trecho.split('\n')) {
      const l = bruta.trim();
      if (!l) continue;
      if (l.startsWith('## ')) { fecha(); blocos.push({ t: 'sub', texto: l.slice(3).trim() }); }
      else if (l.startsWith('- ')) { if (par.length) fecha(); lista.push(l.slice(2).trim()); }
      else { if (lista.length) fecha(); par.push(l); }
    }
    fecha();
  }
  return blocos;
}

/** O inverso, para pré-preencher a edição. Blocos de dados (tabela, barras, gantt, kpis) não têm forma em texto e ficam de fora. */
export function blocosParaTexto(blocos: Bloco[]): string {
  const partes: string[] = [];
  for (const b of blocos) {
    if (b.t === 'p') partes.push(b.texto);
    else if (b.t === 'sub') partes.push(`## ${b.texto}`);
    else if (b.t === 'lista') partes.push(b.itens.map((i) => `- ${i}`).join('\n'));
  }
  return partes.join('\n\n');
}

// ── Modelo de seções ─────────────────────────────────────────────────────────

const TITULOS: Record<Exclude<SecaoId, 'capa'>, string> = {
  sumario: 'Sumário executivo', diagnostico: 'O que o diagnóstico mostrou', lacunas: 'Lacunas prioritárias',
  objeto: 'Objeto e escopo', como_trabalhamos: 'Como trabalhamos', plano: 'Plano de trabalho',
  cronograma: 'Cronograma', responsabilidades: 'Responsabilidades e equipe', sobre: 'Sobre nós', investimento: 'Investimento',
  premissas: 'Premissas', termos: 'Termos e condições', observacoes: 'Observações', aceite: 'Aceite',
};

// Matriz padrão da prévia aprovada (R executa, A aprova e responde, C consultado, I informado).
const RACI: string[][] = [
  ['Aprovar escopo e política', 'A', 'R', 'I', 'C'], ['Identificar e avaliar riscos', 'I', 'A', 'R', 'R'],
  ['Aceitar riscos residuais', 'A', 'C', 'C', 'I'], ['Redigir procedimentos', 'I', 'A', 'C', 'R'],
  ['Implementar controles', 'I', 'A', 'R', 'C'], ['Registrar evidências', 'I', 'A', 'R', 'C'],
  ['Conduzir a auditoria interna', 'I', 'C', 'C', 'R'], ['Realizar a análise crítica', 'A', 'R', 'I', 'C'],
  ['Contratar o organismo certificador', 'A', 'R', 'I', 'C'],
];

const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const semanas = (n: number) => `${n} ${n === 1 ? 'semana' : 'semanas'}`;
const dias = (d: number | null) => (d == null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(d));

/** "40/30/30" -> parcelas em %; null se não for uma lista de números que soma 100. */
function parcelas(pagamento: string): number[] | null {
  const ps = (pagamento ?? '').split('/').map((p) => Number(p.trim()));
  if (!ps.length || ps.some((p) => !Number.isFinite(p) || p <= 0)) return null;
  return Math.abs(ps.reduce((a, p) => a + p, 0) - 100) < 0.01 ? ps : null;
}

function quando(i: number, n: number): string {
  if (i === 0) return 'Na assinatura';
  if (i === n - 1) return 'Na conclusão do projeto';
  return 'No aceite de entrega intermediária';
}

export function montarConteudo(d: DadosDocumento, editadas: Partial<Record<SecaoId, string>>): ConteudoDocumento {
  return montarTudo(d, editadas).conteudo;
}

/** Texto atual da parte editável de cada seção editável presente (sem tabelas nem listas geradas), para pré-preencher a edição. */
export function textosEditaveis(d: DadosDocumento, editadas: Partial<Record<SecaoId, string>>): Partial<Record<SecaoId, string>> {
  return montarTudo(d, editadas).textos;
}

function montarTudo(d: DadosDocumento, editadas: Partial<Record<SecaoId, string>>) {
  const o = d.org;
  const deOrg = (t: string) => (t ?? '').split('{org}').join(o.nome);
  const projetos = d.itens.filter((i) => i.servico.tipo === 'projeto');
  const comProjeto = projetos.length > 0;
  const deProjeto = d.itens.filter((i) => i.calc.natureza === 'projeto');
  const mensais = d.itens.filter((i) => i.calc.natureza === 'mensal');
  const desligada = (id: SecaoId) => (o.secoesDesligadas as string[]).includes(id);

  // Fases de todos os projetos, em sequência, numeradas F1..Fn.
  const fases: { rotulo: string; ini: number; fim: number }[] = [];
  let semana = 0;
  for (const { servico: s } of projetos) {
    if (s.tipo !== 'projeto') continue;
    for (const f of s.fases) { fases.push({ rotulo: `F${fases.length + 1} · ${f.nome}`, ini: semana, fim: semana + f.semanas }); semana += f.semanas; }
  }
  const totalSemanas = semana;

  const investimentoTexto = [d.totais.totalProjeto > 0 ? brl(d.totais.totalProjeto) : '', d.totais.mensalidade > 0 ? `${brl(d.totais.mensalidade)}/mês` : '']
    .filter(Boolean).join(' + ') || brl(0);

  // sumário
  const kpis: { valor: string; rotulo: string }[] = [];
  if (comProjeto) kpis.push({ valor: `${totalSemanas} sem.`, rotulo: 'duração do projeto' });
  if (d.itens.some((i) => /27001/.test(i.servico.norma))) kpis.push({ valor: '93', rotulo: 'controles do Anexo A avaliados' });
  if (d.diagnostico) kpis.push({ valor: String(d.diagnostico.lacunas.length), rotulo: 'lacunas prioritárias' });
  if (d.totais.totalProjeto > 0) kpis.push({ valor: brl(d.totais.totalProjeto), rotulo: 'investimento do projeto' });
  if (d.totais.mensalidade > 0) kpis.push({ valor: brl(d.totais.mensalidade), rotulo: 'por mês' });
  const kpiBloco: Bloco = { t: 'kpis', itens: kpis };

  // plano
  const plano: Bloco[] = [];
  let nFase = 0;
  for (const { servico: s, textoCliente } of d.itens) {
    plano.push({ t: 'sub', texto: s.norma ? `${s.nome} · ${s.norma}` : s.nome });
    if (s.descricao) plano.push(...textoParaBlocos(s.descricao));
    if (s.tipo === 'projeto') {
      for (const f of s.fases) {
        const ff = fases[nFase++];
        plano.push({ t: 'sub', texto: `${ff.rotulo} · semanas ${ff.ini + 1}–${ff.fim}` });
        if (f.objetivo) plano.push({ t: 'p', texto: f.objetivo });
        const linhas = ([['Atividades', f.atividades], ['Entregáveis', f.entregaveis], ['Aceite', f.criterioAceite]] as string[][]).filter((l) => l[1]);
        if (linhas.length) plano.push({ t: 'tabela', cab: [], linhas });
      }
    } else if (s.tipo === 'avulso') {
      plano.push({ t: 'tabela', cab: [], linhas: [['Entregáveis', s.entregaveis.join('\n')], ['Aceite', s.criterioAceite]] });
    } else {
      plano.push({ t: 'tabela', cab: [], linhas: [['Incluso por mês', s.inclusoMes.join('\n')], ['Prazo mínimo', `${s.prazoMinimoMeses} meses`]] });
    }
    plano.push(...textoParaBlocos(textoCliente));
  }

  // investimento
  const inv: Bloco[] = [];
  if (deProjeto.length) {
    const somaDias = deProjeto.reduce((t, i) => t + (i.calc.dias ?? 0), 0);
    inv.push({
      t: 'tabela', cab: ['Serviço', 'Dias', 'Valor'],
      linhas: deProjeto.map((i) => [i.servico.nome, dias(i.calc.dias), brl(i.calc.valor)]),
      total: ['Total do projeto', somaDias ? dias(somaDias) : '', brl(d.totais.totalProjeto)],
    });
    const ps = parcelas(d.pagamento);
    inv.push({ t: 'sub', texto: 'Condições de pagamento' });
    if (ps) {
      // a última parcela leva o resto, para a soma bater com o total
      const valores = ps.map((p) => Math.round(d.totais.totalProjeto * p / 100));
      valores[valores.length - 1] = d.totais.totalProjeto - valores.slice(0, -1).reduce((a, v) => a + v, 0);
      inv.push({ t: 'tabela', cab: ['Parcela', 'Quando', 'Valor'], linhas: ps.map((p, i) => [`${i + 1} · ${num(p)}%`, ps.length === 1 ? 'Na assinatura' : quando(i, ps.length), brl(valores[i])]) });
    } else if (d.pagamento?.trim()) {
      inv.push({ t: 'p', texto: d.pagamento.trim() });
    }
  }
  if (mensais.length) {
    inv.push({ t: 'sub', texto: 'Serviços mensais' });
    inv.push({
      t: 'tabela', cab: ['Serviço', 'Prazo', 'Por mês'],
      linhas: mensais.map((i) => [i.servico.nome, `${i.calc.meses} meses`, brl(i.calc.mensalidade ?? 0)]),
      total: ['Total por mês', '', brl(d.totais.mensalidade)],
    });
  }
  inv.push({ t: 'p', texto: 'Valores em reais, com os tributos incidentes sobre a prestação de serviços já incluídos.' });
  const exclusoes = unicos(d.itens.flatMap((i) => i.servico.exclusoes));
  if (exclusoes.length) inv.push({ t: 'sub', texto: 'O que não está incluído' }, { t: 'lista', itens: exclusoes });

  const premissasOrg = textoParaBlocos(deOrg(o.textos.premissas));
  const dg = d.diagnostico;
  const comoTrab = textoParaBlocos(deOrg(o.textos.comoTrabalhamos));
  // o texto padrão da ness. começa repetindo o título da seção
  if (comoTrab[0]?.t === 'sub' && comoTrab[0].texto.toLowerCase() === TITULOS.como_trabalhamos.toLowerCase()) comoTrab.shift();
  const equipe = textoParaBlocos(deOrg(o.textos.equipe));

  // Seção editável: [antes, texto, depois]. A edição troca só o texto; os blocos gerados ao
  // redor (indicadores, RACI, lista de serviços, premissas dos serviços) vêm sempre dos dados atuais.
  const ed = (id: SecaoId, gerado: Bloco[]): Bloco[] => (typeof editadas[id] === 'string' ? textoParaBlocos(editadas[id]!) : gerado);
  const premissasTexto = ed('premissas', premissasOrg);
  const jaNoTexto = new Set(premissasTexto.flatMap((b) => (b.t === 'lista' ? b.itens : [])));
  const premissasServicos = unicos(d.itens.flatMap((i) => i.servico.premissas)).filter((x) => !jaNoTexto.has(x));
  const editaveis: Partial<Record<SecaoId, [Bloco[], Bloco[], Bloco[]]>> = {
    sumario: [[], ed('sumario', textoParaBlocos(d.textos.contexto)), [kpiBloco]],
    objeto: [[], ed('objeto', textoParaBlocos(d.textos.escopo)), [
      { t: 'sub', texto: 'Serviços desta proposta' },
      { t: 'lista', itens: d.itens.map((i) => (i.servico.norma ? `${i.servico.nome} · ${i.servico.norma}` : i.servico.nome)) },
    ]],
    como_trabalhamos: [[], ed('como_trabalhamos', comoTrab), []],
    responsabilidades: [[
      { t: 'p', texto: 'R executa, A aprova e responde, C é consultado, I é informado.' },
      { t: 'tabela', cab: ['Atividade', 'Direção', 'Ponto focal', 'Áreas', 'Consultoria'], linhas: RACI },
    ], ed('responsabilidades', equipe.length ? [{ t: 'sub', texto: 'Equipe' }, ...equipe] : []), []],
    sobre: [[], ed('sobre', textoParaBlocos(deOrg(o.textos.sobre))), []],
    premissas: [[], premissasTexto, premissasServicos.length ? [{ t: 'lista', itens: premissasServicos }] : []],
    termos: [[], ed('termos', textoParaBlocos(deOrg(o.textos.termos))), []],
    observacoes: [[], ed('observacoes', textoParaBlocos(d.textos.observacoes)), []],
  };
  const junta = (id: SecaoId) => editaveis[id]!.flat();

  const candidatas: [SecaoId, boolean, Bloco[]][] = [
    ['sumario', true, junta('sumario')],
    ['diagnostico', !!dg, dg ? [
      { t: 'p', texto: `O diagnóstico avaliou as práticas em ${dg.maturidade.length} domínios. A barra mostra a maturidade de cada um, de 0% (inexistente) a 100% (implementado, documentado e verificado). O resultado coloca a empresa na faixa ${dg.faixaNome}.` },
      { t: 'barras', itens: dg.maturidade.map((m) => ({ rotulo: m.dominio, pct: m.pct })) },
    ] : []],
    ['lacunas', !!dg && dg.lacunas.length > 0, dg ? [
      { t: 'p', texto: 'As lacunas abaixo saem das respostas do diagnóstico. Cada uma está ligada ao requisito que a auditoria vai verificar.' },
      { t: 'tabela', cab: ['Lacuna', 'Requisito', 'Impacto'], linhas: dg.lacunas.map((l) => [`${l.titulo}\n${l.acao}`, l.requisito, l.impacto]) },
    ] : []],
    ['objeto', true, junta('objeto')],
    ['como_trabalhamos', comProjeto && !desligada('como_trabalhamos'), junta('como_trabalhamos')],
    ['plano', true, plano],
    ['cronograma', comProjeto, [
      { t: 'p', texto: `${semanas(totalSemanas)} a partir da reunião de abertura, com as fases em sequência.` },
      { t: 'gantt', fases, semanas: totalSemanas },
    ]],
    ['responsabilidades', comProjeto && !desligada('responsabilidades'), junta('responsabilidades')],
    ['sobre', true, junta('sobre')],
    ['investimento', true, inv],
    ['premissas', true, junta('premissas')],
    ['termos', true, junta('termos')],
    ['observacoes', true, junta('observacoes')],
    ['aceite', true, [{ t: 'p', texto: `Ao aceitar, ${d.cliente.nome} concorda com o escopo, o cronograma, o investimento e as condições desta proposta ${d.numero}${d.revisao > 1 ? ` rev. ${d.revisao}` : ''}, que passa a valer como contrato de prestação de serviços entre as partes.` }]],
  ];

  const secoes: Secao[] = [];
  const textos: Partial<Record<SecaoId, string>> = {};
  let n = 0;
  for (const [id, mostrar, blocos] of candidatas) {
    if (!mostrar || !blocos.length) continue;
    const titulo = TITULOS[id as keyof typeof TITULOS];
    const editavel = editaveis[id];
    if (editavel) textos[id] = typeof editadas[id] === 'string' ? editadas[id] : blocosParaTexto(editavel[1]);
    secoes.push({ id, numero: id === 'aceite' ? null : String(++n).padStart(2, '0'), titulo, blocos, editada: !!editavel && typeof editadas[id] === 'string' });
  }

  const nomes = d.itens.map((i) => i.servico.nome);
  const conteudo: ConteudoDocumento = {
    org: { nome: o.nome, cor: o.corDestaque, marcaNess: o.id === ORG_NESS, selo: o.seloNiso },
    numero: d.numero, revisao: d.revisao, emitidaEm: d.emitidaEm, validaAte: d.validaAte,
    capa: {
      titulo: nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? 'Proposta comercial'),
      cliente: d.cliente.nome, cnpj: d.cliente.cnpj, pessoas: d.cliente.pessoas,
      duracao: comProjeto ? semanas(totalSemanas) : null, investimento: investimentoTexto,
    },
    secoes,
  };
  return { conteudo, textos };
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const e = escapeHtml;
/** "2026-10-02" -> "02/10/2026"; qualquer outra coisa sai como veio (escapada). */
export function dataBr(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
const pctSeguro = (v: number) => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100) / 100));
const NUMERICA = /^(R\$ [\d.,]+(\/mês)?|[\d.,]+|—)?$/;

/** Célula: linhas por "\n"; a partir da segunda, em tom mais leve (ex.: a ação de uma lacuna). */
const celula = (s: string) => {
  const [primeira, ...resto] = String(s ?? '').split('\n');
  return e(primeira) + resto.map((r) => `<span class="det">${e(r)}</span>`).join('');
};

function tabela(b: Extract<Bloco, { t: 'tabela' }>): string {
  if (!b.cab.length) {
    return `<table class="t dl"><tbody>${b.linhas.map((l) => `<tr><th scope="row">${e(l[0])}</th><td>${l.slice(1).map(celula).join('</td><td>')}</td></tr>`).join('')}</tbody></table>`;
  }
  const todas = b.total ? [...b.linhas, b.total] : b.linhas;
  const dir = b.cab.map((_, j) => j > 0 && todas.every((l) => NUMERICA.test(l[j] ?? '')));
  const td = (l: string[], j: number) => `<td class="${j === 0 ? 'k' : dir[j] ? 'r' : ''}">${celula(l[j] ?? '')}</td>`;
  const linha = (l: string[]) => `<tr>${b.cab.map((_, j) => td(l, j)).join('')}</tr>`;
  return `<table class="t"><thead><tr>${b.cab.map((c, j) => `<th${dir[j] ? ' class="r"' : ''}>${e(c)}</th>`).join('')}</tr></thead>`
    + `<tbody>${b.linhas.map(linha).join('')}</tbody>${b.total ? `<tfoot>${linha(b.total)}</tfoot>` : ''}</table>`;
}

function bloco(b: Bloco): string {
  switch (b.t) {
    case 'p': return `<p>${e(b.texto)}</p>`;
    case 'sub': return `<h4>${e(b.texto)}</h4>`;
    case 'lista': return `<ul class="l">${b.itens.map((i) => `<li>${e(i)}</li>`).join('')}</ul>`;
    case 'tabela': return tabela(b);
    case 'kpis': return b.itens.length ? `<div class="kpis">${b.itens.map((k) => `<div><b>${e(k.valor)}</b><span>${e(k.rotulo)}</span></div>`).join('')}</div>` : '';
    case 'barras': return `<div class="bars">${b.itens.map((i) => { const p = pctSeguro(i.pct); return `<div class="bar"><span>${e(i.rotulo)}</span><div class="track"><div class="fill" style="width:${p}%"></div></div><b>${p}%</b></div>`; }).join('')}</div>`;
    case 'gantt': {
      const n = Math.max(1, Math.round(Number(b.semanas) || 1));
      const pos = (w: number) => pctSeguro((w / n) * 100);
      const escala = Array.from({ length: n }, (_, i) => `<span>${n <= 26 || i % 2 === 0 ? i + 1 : ''}</span>`).join('');
      return `<div class="gantt" style="--n:${n}"><span></span><div class="scale">${escala}</div>`
        + b.fases.map((f) => `<span>${e(f.rotulo)}</span><div class="lane"><div class="seg" style="left:${pos(f.ini)}%;width:${pctSeguro(pos(f.fim) - pos(f.ini))}%"></div></div>`).join('')
        + `</div>`;
    }
  }
}

const CSS = `
@page { size: A4; margin: 22mm 18mm 20mm; }
@page capa { margin: 0; }
:root { --ink: #0f172a; --ink-2: #44506a; --ink-3: #8a94a6; --rule: #e2e8f0; --tint: #f5f7fa;
  --head: 'Montserrat', 'Segoe UI', system-ui, sans-serif; --body: 'Inter', 'Segoe UI', system-ui, sans-serif; }
* { box-sizing: border-box; }
html { background: #fff; color-scheme: light; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0 auto; max-width: 174mm; background: #fff; color: var(--ink); font: 400 10pt/1.6 var(--body); }
.run, .foot { display: flex; justify-content: space-between; gap: 6mm; color: var(--ink-3); }
.run { font: 500 7.5pt var(--body); letter-spacing: .04em; border-bottom: .4pt solid var(--rule); padding: 6mm 0 2.5mm; }
.foot { font: 400 7.5pt var(--body); border-top: .4pt solid var(--rule); padding: 2.5mm 0 6mm; }
/* Na tela, cabeçalho e rodapé aparecem uma vez; na impressão, vão para as margens de cada página (@page). */
@media print { body { max-width: none; } .run, .foot { display: none; } }
.mark { font: 500 22pt/1 var(--head); letter-spacing: -.01em; color: var(--ink); }
.mark .dot { color: var(--acc); }
.cover { page: capa; break-after: page; height: 297mm; padding: 26mm 20mm 22mm; display: flex; flex-direction: column; background: #fff; position: relative; z-index: 1; }
@media screen { .cover { height: auto; min-height: 250mm; padding-inline: 0; } }
.cover .eyebrow { margin-top: 62mm; font: 500 8.5pt var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }
.cover h1 { font: 600 28pt/1.1 var(--head); margin: 5mm 0 0; max-width: 150mm; text-wrap: balance; }
.cover .for { margin-top: 8mm; font: 400 11.5pt/1.5 var(--body); color: var(--ink-2); }
.cover .for strong { color: var(--ink); font-weight: 600; }
.cover .rule { width: 26mm; height: 1.2mm; background: var(--acc); margin-top: 12mm; }
.cover dl { margin: auto 0 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6mm; border-top: .4pt solid var(--rule); padding-top: 6mm; }
.cover dt { font: 500 7pt var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.cover dd { margin: 1.5mm 0 0; font: 600 10.5pt var(--body); font-variant-numeric: tabular-nums; }
.cover dd span { display: block; white-space: nowrap; }
.doc section { margin-top: 9mm; }
.doc section:first-child { margin-top: 0; }
.doc section.quebra { break-before: page; margin-top: 0; }
.doc h2 { font: 600 14pt/1.25 var(--head); margin: 0 0 4mm; break-after: avoid; }
.doc h2 .n { color: var(--acc); font: 500 10.5pt var(--head); margin-right: 3mm; }
.doc h4 { font: 600 10.5pt/1.3 var(--head); margin: 6mm 0 2.5mm; break-after: avoid; }
.doc p { color: var(--ink-2); margin: 0 0 3.5mm; orphans: 3; widows: 3; }
.doc ul.l { margin: 0 0 3.5mm; padding: 0; list-style: none; }
.doc ul.l li { color: var(--ink-2); padding-left: 6mm; position: relative; margin-bottom: 1.8mm; break-inside: avoid; }
.doc ul.l li::before { content: ""; position: absolute; left: 0; top: 2.4mm; width: 3mm; height: .8mm; background: var(--acc); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(36mm, 1fr)); gap: 5mm; margin: 5mm 0 6mm; break-inside: avoid; }
.kpis div { border-top: 1.2pt solid var(--acc); padding-top: 3mm; }
.kpis b { display: block; font: 600 14pt/1.1 var(--head); font-variant-numeric: tabular-nums; white-space: nowrap; }
.kpis span { display: block; font-size: 8pt; color: var(--ink-3); margin-top: 1.5mm; line-height: 1.35; }
table.t { width: 100%; border-collapse: collapse; font-size: 9pt; font-variant-numeric: tabular-nums; margin: 0 0 4mm; }
.t thead { display: table-header-group; }
.t tr { break-inside: avoid; }
.t th { font: 500 7pt var(--body); letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); text-align: left; padding: 0 3mm 2.5mm 0; border-bottom: .8pt solid var(--ink); vertical-align: bottom; }
.t td { padding: 2.5mm 3mm 2.5mm 0; border-bottom: .4pt solid var(--rule); color: var(--ink-2); vertical-align: top; line-height: 1.45; }
.t td.k { color: var(--ink); font-weight: 500; }
.t .r { text-align: right; padding-right: 0; white-space: nowrap; }
.t .det { display: block; color: var(--ink-2); font-weight: 400; margin-top: 1mm; }
.t tfoot td { border-bottom: 0; border-top: 1.2pt solid var(--acc); padding-top: 3.5mm; font-weight: 600; color: var(--ink); font-size: 10.5pt; }
.t.dl th { width: 32mm; border: 0; padding: 1.5mm 3mm 1.5mm 0; vertical-align: top; }
.t.dl td { border: 0; padding: 1.5mm 0; }
.bars { display: flex; flex-direction: column; gap: 3.5mm; margin: 2mm 0 5mm; break-inside: avoid; }
.bar { display: grid; grid-template-columns: 52mm minmax(0, 1fr) 14mm; gap: 4mm; align-items: center; font-size: 9pt; color: var(--ink-2); }
.bar .track { height: 2.8mm; background: var(--rule); border-radius: 2mm; overflow: hidden; }
.bar .fill { height: 100%; background: var(--acc); border-radius: 2mm; }
.bar b { font: 500 9pt var(--body); color: var(--ink); text-align: right; }
.gantt { display: grid; grid-template-columns: 58mm minmax(0, 1fr); gap: 2.5mm 4mm; align-items: center; font-size: 8.5pt; color: var(--ink-2); margin-top: 3mm; }
.gantt .scale { display: grid; grid-template-columns: repeat(var(--n), 1fr); font: 500 6.5pt var(--body); color: var(--ink-3); }
.gantt .lane { position: relative; height: 4.6mm; background: var(--tint); border-radius: 1mm; break-inside: avoid; }
.gantt .seg { position: absolute; top: .8mm; bottom: .8mm; background: var(--acc); border-radius: 1mm; }
.sign { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12mm; margin-top: 22mm; break-inside: avoid; }
.sign div { border-top: .8pt solid var(--ink); padding-top: 3mm; font-size: 9pt; color: var(--ink-2); line-height: 1.5; }
.sign b { color: var(--ink); display: block; }
`;

/** Texto como string CSS: tudo que não é letra, dígito ou espaço vira escape hexadecimal, então não há como sair da string. */
function cssTexto(s: string): string {
  return `"${[...String(s ?? '')].map((ch) => (/[A-Za-z0-9 ]/.test(ch) ? ch : `\\${ch.codePointAt(0)!.toString(16)} `)).join('')}"`;
}

// Seções que começam página nova (além da capa, que sempre fica sozinha).
const QUEBRA: SecaoId[] = ['plano', 'investimento', 'termos'];

export function renderizarHtml(c: ConteudoDocumento): string {
  const cor = /^#[0-9a-fA-F]{6}$/.test(c.org.cor) ? c.org.cor : COR_PADRAO;
  const numero = `${c.numero}${c.revisao > 1 ? ` rev. ${c.revisao}` : ''}`;
  const marca = c.org.marcaNess ? '<span class="mark">ness<span class="dot">.</span></span>' : `<span class="mark">${e(c.org.nome)}</span>`;
  const cap = c.capa;
  const para = [cap.cnpj ? `CNPJ ${e(cap.cnpj)}` : '', cap.pessoas != null ? `${e(String(cap.pessoas))} pessoas no escopo` : ''].filter(Boolean).join(' · ');
  const dt = (rotulo: string, valor: string) => `<div><dt>${rotulo}</dt><dd>${valor.split(' + ').map((v, i) => `<span>${i ? '+ ' : ''}${e(v)}</span>`).join('')}</dd></div>`;
  const rodape = `Válida até ${dataBr(c.validaAte)}. Documento confidencial, uso restrito ao destinatário.`;
  const margem = `font: 400 7.5pt 'Inter', 'Segoe UI', sans-serif; color: #8a94a6;`;
  const paginas = `@page { @top-left { content: ${cssTexto(c.org.nome)}; ${margem} border-bottom: .4pt solid #e2e8f0; }
  @top-right { content: ${cssTexto(`Proposta ${numero}`)}; ${margem} border-bottom: .4pt solid #e2e8f0; }
  @bottom-left { content: ${cssTexto(rodape + (c.org.selo ? '  ·  emitida com n.iso' : ''))}; ${margem} border-top: .4pt solid #e2e8f0; }
  @bottom-right { content: counter(page) " de " counter(pages); ${margem} border-top: .4pt solid #e2e8f0; } }
@page capa { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }`;

  const secoes = c.secoes.map((s) => {
    const n = s.numero ? `<span class="n">${e(s.numero)}</span>` : '';
    const assinatura = s.id === 'aceite'
      ? `<div class="sign"><div><b>${e(cap.cliente)}</b>Nome e cargo do representante legal<br>Data</div><div><b>${e(c.org.nome)}</b>Nome e cargo do representante legal<br>Data</div></div>`
      : '';
    return `<section id="${s.id}"${QUEBRA.includes(s.id) ? ' class="quebra"' : ''}><h2>${n}${e(s.titulo)}</h2>${s.blocos.map(bloco).join('')}${assinatura}</section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proposta ${e(numero)} · ${e(cap.cliente)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600&amp;family=Inter:wght@400;500;600&amp;display=swap">
<style>:root { --acc: ${cor}; }${CSS}${paginas}</style></head>
<body>
<div class="run"><span>${e(c.org.nome)}</span><span>Proposta ${e(numero)}</span></div>
<div class="foot"><span>${e(rodape)}</span>${c.org.selo ? '<span>emitida com n.iso</span>' : ''}</div>
<section class="cover">${marca}
<div class="eyebrow">Proposta comercial · ${e(numero)}</div>
<h1>${e(cap.titulo)}</h1>
<div class="for">Preparada para <strong>${e(cap.cliente)}</strong>${para ? `<br>${para}` : ''}</div>
<div class="rule"></div>
<dl>${dt('Emitida em', dataBr(c.emitidaEm))}${dt('Válida até', dataBr(c.validaAte))}${cap.duracao ? dt('Duração', cap.duracao) : ''}${dt('Investimento', cap.investimento)}</dl>
</section>
<main class="doc">
${secoes}
</main>
</body></html>
`;
}

/** SHA-256 em hex do HTML gravado. */
export async function hashDocumento(html: string): Promise<string> {
  return sha256Hex(html);
}
