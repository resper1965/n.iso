import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  textoParaBlocos, blocosParaTexto, montarConteudo, textosEditaveis, renderizarHtml, hashDocumento,
  SECOES_EDITAVEIS, type DadosDocumento, type Bloco,
} from '../src/services/documento-proposta';
import { precoPadrao, type ConfigOrg } from '../src/services/organizacao';
import { calcularItem, totais } from '../src/services/preco-proposta';
import type { Servico } from '../src/schemas/domain';
import type { Diagnostico } from '../src/services/diagnostico';

const preco = precoPadrao();
const base = { id: 's', orgId: 'org_ness', ativo: true, norma: '', descricao: '', premissas: [], exclusoes: [] };
const projeto = {
  ...base, nome: 'Implementação ISO 27001', norma: 'ISO/IEC 27001', tipo: 'projeto',
  diasPorFaixa: { '1': 60, '2': 90, '3': 140 },
  premissas: ['Ponto focal designado'], exclusoes: ['Taxas do organismo certificador'],
  fases: [
    { nome: 'Diagnóstico e escopo', objetivo: 'Fechar o escopo.', atividades: 'Entrevistas.', entregaveis: 'Declaração de escopo.', criterioAceite: 'Escopo aprovado.', pct: 40, semanas: 2 },
    { nome: 'Implementação', objetivo: 'Operar os controles.', atividades: 'Procedimentos.', entregaveis: 'Evidências.', criterioAceite: 'Controles com evidência.', pct: 60, semanas: 6 },
  ],
} as unknown as Servico;
const avulso = {
  ...base, nome: 'Treinamento LGPD', tipo: 'avulso', formaPreco: 'fixo', valorFixo: 8200,
  entregaveis: ['Turma de 4 h', 'Lista de presença'], criterioAceite: 'Turma realizada.',
} as unknown as Servico;
const recorrente = {
  ...base, nome: 'Sustentação do SGSI', tipo: 'recorrente', mensalidade: 4000, prazoMinimoMeses: 12,
  inclusoMes: ['Reunião mensal', 'Revisão de riscos'], exclusoes: ['Auditoria externa'],
} as unknown as Servico;

function org(o: Partial<ConfigOrg> = {}): ConfigOrg {
  return {
    id: 'org_ness', nome: 'ness.', cnpj: null, corDestaque: '#00ade8', seloNiso: true,
    prefixoProposta: 'NESS', proximoNumero: 1, preco, secoesDesligadas: [],
    textos: {
      sobre: 'A {org} é uma consultoria.', comoTrabalhamos: '## Princípios\n\n- Evidência desde o primeiro dia.',
      equipe: '', termos: '## Obrigações de {org}\n\n- Executar os serviços.', premissas: '- A direção participa.',
      pagamentoPadrao: '40/30/30',
    },
    ...o,
  };
}

const diag: Diagnostico = {
  faixa: '2', faixaNome: 'Standard', nota: 50, pessoas: 120,
  maturidade: [{ dominio: 'Identidade e acesso', pct: 62 }, { dominio: 'Privacidade (LGPD)', pct: 28 }],
  lacunas: [{ titulo: 'Ausência de RoPA', requisito: 'A.1.2.9 (ISO 27701)', impacto: 'Crítico', acao: 'Levantar as operações.' }],
};

function dados(servicos: Servico[], o: Partial<DadosDocumento> = {}): DadosDocumento {
  const itens = servicos.map((s) => ({ servico: s, calc: calcularItem(s, {}, preco, '2', 120), textoCliente: '' }));
  return {
    org: org(), numero: 'NESS-2026-014', revisao: 1, emitidaEm: '2026-10-02', validaAte: '2026-11-01',
    cliente: { nome: 'Empresa Exemplo Ltda.', cnpj: '00.000.000/0001-00', pessoas: 120 },
    textos: { contexto: 'A empresa quer certificar.', escopo: 'Plataforma SaaS.', observacoes: '' },
    itens, totais: totais(itens.map((i) => i.calc)), pagamento: '40/30/30', diagnostico: diag,
    ...o,
  };
}

const ids = (d: DadosDocumento, e = {}) => montarConteudo(d, e).secoes.map((s) => s.id);

describe('textoParaBlocos / blocosParaTexto', () => {
  it('parágrafo por linha em branco, "- " vira lista, "## " subtítulo', () => {
    expect(textoParaBlocos('## Título\n\nUm parágrafo\nque continua.\n\n- a\n- b\n\nOutro.')).toEqual([
      { t: 'sub', texto: 'Título' },
      { t: 'p', texto: 'Um parágrafo que continua.' },
      { t: 'lista', itens: ['a', 'b'] },
      { t: 'p', texto: 'Outro.' },
    ]);
    expect(textoParaBlocos('  \r\n\r\n ')).toEqual([]);
  });
  it('ida e volta', () => {
    const b: Bloco[] = [{ t: 'sub', texto: 'S' }, { t: 'p', texto: 'P 1.' }, { t: 'lista', itens: ['x', 'y'] }, { t: 'p', texto: 'P 2.' }];
    expect(textoParaBlocos(blocosParaTexto(b))).toEqual(b);
    const t = '## S\n\nP 1.\n\n- x\n- y';
    expect(blocosParaTexto(textoParaBlocos(t))).toBe(t);
  });
});

describe('montarConteudo', () => {
  it('seção editada substitui o texto gerado e marca editada', () => {
    const c = montarConteudo(dados([projeto]), { objeto: 'Escopo reescrito.\n\n- item' });
    const s = c.secoes.find((x) => x.id === 'objeto')!;
    expect(s.editada).toBe(true);
    expect(s.blocos.slice(0, 2)).toEqual([{ t: 'p', texto: 'Escopo reescrito.' }, { t: 'lista', itens: ['item'] }]);
    expect(JSON.stringify(s.blocos)).not.toContain('Plataforma SaaS.');
    expect(c.secoes.find((x) => x.id === 'termos')!.editada).toBe(false);
  });
  it('editar Responsabilidades mantém a tabela RACI', () => {
    const s = montarConteudo(dados([projeto]), { responsabilidades: 'Equipe nossa.' }).secoes.find((x) => x.id === 'responsabilidades')!;
    expect(s.editada).toBe(true);
    expect(s.blocos.some((b) => b.t === 'tabela' && b.cab.includes('Consultoria'))).toBe(true);
    expect(s.blocos).toContainEqual({ t: 'p', texto: 'Equipe nossa.' });
  });
  it('Objeto editado continua listando os serviços atuais, inclusive o acrescentado depois da edição', () => {
    const s = montarConteudo(dados([projeto, avulso]), { objeto: 'Escopo reescrito.' }).secoes.find((x) => x.id === 'objeto')!;
    expect(s.blocos).toContainEqual({ t: 'lista', itens: ['Implementação ISO 27001 · ISO/IEC 27001', 'Treinamento LGPD'] });
  });
  it('textosEditaveis traz só a parte editável (sem lista de serviços nem tabela)', () => {
    const t = textosEditaveis(dados([projeto]), {});
    expect(t.objeto).toBe('Plataforma SaaS.');
    expect(t.sumario).toBe('A empresa quer certificar.');
    expect(t.responsabilidades ?? '').not.toContain('Ponto focal');
    expect(t.responsabilidades ?? '').not.toContain('Aprovar escopo');
    expect(textosEditaveis(dados([projeto]), { objeto: 'Meu.' }).objeto).toBe('Meu.');
    expect(t).not.toHaveProperty('investimento');
  });
  it('seção de dados não é afetada por editadas', () => {
    const d = dados([projeto]);
    const antes = montarConteudo(d, {}).secoes.find((x) => x.id === 'investimento');
    const depois = montarConteudo(d, { investimento: 'nada', cronograma: 'nada' } as any).secoes.find((x) => x.id === 'investimento');
    expect(depois).toEqual(antes);
    expect(depois!.editada).toBe(false);
  });
  it('sumário editado mantém os indicadores calculados', () => {
    const s = montarConteudo(dados([projeto]), { sumario: 'Novo texto.' }).secoes[0];
    expect(s.blocos[0]).toEqual({ t: 'p', texto: 'Novo texto.' });
    expect(s.blocos.some((b) => b.t === 'kpis')).toBe(true);
  });
  it('avulso sozinho não tem como trabalhamos, cronograma, responsabilidades; projeto tem', () => {
    const a = ids(dados([avulso], { diagnostico: null }));
    for (const x of ['como_trabalhamos', 'cronograma', 'responsabilidades']) expect(a).not.toContain(x);
    const p = ids(dados([projeto]));
    for (const x of ['como_trabalhamos', 'cronograma', 'responsabilidades']) expect(p).toContain(x);
  });
  it('sem diagnóstico some a seção e as lacunas', () => {
    const s = ids(dados([projeto], { diagnostico: null }));
    expect(s).not.toContain('diagnostico');
    expect(s).not.toContain('lacunas');
    expect(ids(dados([projeto]))).toEqual(expect.arrayContaining(['diagnostico', 'lacunas']));
  });
  it('secoesDesligadas respeitada', () => {
    const s = ids(dados([projeto], { org: org({ secoesDesligadas: ['como_trabalhamos', 'responsabilidades'] }) }));
    expect(s).not.toContain('como_trabalhamos');
    expect(s).not.toContain('responsabilidades');
    expect(s).toContain('cronograma');
  });
  it('numeração em sequência só nas que aparecem; aceite sem número; observações só se houver', () => {
    const c = montarConteudo(dados([avulso], { diagnostico: null }), {});
    const numeradas = c.secoes.filter((s) => s.id !== 'aceite');
    expect(numeradas.map((s) => s.numero)).toEqual(numeradas.map((_, i) => String(i + 1).padStart(2, '0')));
    expect(c.secoes.at(-1)).toMatchObject({ id: 'aceite', numero: null });
    expect(c.secoes.map((s) => s.id)).not.toContain('observacoes');
    expect(ids(dados([avulso], { textos: { contexto: '', escopo: '', observacoes: 'Obs.' } }))).toContain('observacoes');
  });
  it('{org} vira o nome da organização', () => {
    const c = montarConteudo(dados([projeto]), {});
    const termos = c.secoes.find((s) => s.id === 'termos')!;
    expect(termos.blocos[0]).toEqual({ t: 'sub', texto: 'Obrigações de ness.' });
    expect(JSON.stringify(c)).not.toContain('{org}');
    expect(c.secoes.find((s) => s.id === 'sobre')!.titulo).toBe('Sobre nós');
  });
  it('recorrente mostra "por mês"; projeto + recorrente mostra os dois totais separados', () => {
    const html = renderizarHtml(montarConteudo(dados([recorrente], { diagnostico: null }), {}));
    expect(html).toContain('por mês');
    const ambos = dados([projeto, recorrente]);
    const inv = montarConteudo(ambos, {}).secoes.find((s) => s.id === 'investimento')!;
    const tabelas = inv.blocos.filter((b) => b.t === 'tabela') as Extract<Bloco, { t: 'tabela' }>[];
    const totaisLinha = tabelas.map((t) => t.total?.join(' ')).filter(Boolean).join(' | ');
    expect(totaisLinha).toContain('Total por mês');
    expect(totaisLinha).toContain('R$ 4.000');
    // o total do projeto é só o do projeto, sem a mensalidade
    const so = ambos.itens[0].calc.valor.toLocaleString('pt-BR');
    expect(totaisLinha).toContain(`Total do projeto`);
    expect(tabelas.find((t) => t.total?.[0] === 'Total do projeto')!.total!.at(-1)).toBe(`R$ ${so}`);
  });
  it('pagamento 40/30/30: parcelas somam o total do projeto', () => {
    const d = dados([projeto]);
    const inv = montarConteudo(d, {}).secoes.find((s) => s.id === 'investimento')!;
    const pag = inv.blocos.find((b) => b.t === 'tabela' && b.cab[0] === 'Parcela') as Extract<Bloco, { t: 'tabela' }>;
    expect(pag.linhas).toHaveLength(3);
    const soma = pag.linhas.reduce((t, l) => t + Number(l[2].replace(/\D/g, '')), 0);
    expect(soma).toBe(d.totais.totalProjeto);
  });
  it('a memória de cálculo não vai para o documento', () => {
    const d = dados([projeto]);
    expect(JSON.stringify(montarConteudo(d, {}))).not.toContain(d.itens[0].calc.memoria);
  });
});

describe('renderizarHtml', () => {
  afterEach(() => vi.useRealTimers());

  it('marca da ness. em wordmark; outra organização em texto; selo no rodapé', () => {
    const html = renderizarHtml(montarConteudo(dados([projeto]), {}));
    expect(html).toContain('ness<span class="dot">.</span>');
    expect(html).toContain('emitida com n.iso');
    const outra = renderizarHtml(montarConteudo(dados([projeto], { org: org({ id: 'org_x', nome: 'Ponte Consultoria', seloNiso: false }) }), {}));
    expect(outra).not.toContain('<span class="dot">');
    expect(outra).toContain('Ponte Consultoria');
    expect(outra).not.toContain('emitida com n.iso');
  });

  it('sem <script> e sem handler; A4', () => {
    const html = renderizarHtml(montarConteudo(dados([projeto, avulso, recorrente]), {}));
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('size: A4');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
  });

  it('injeção em todo campo livre sai escapada', () => {
    const X = '<script>alert(1)</script><img src=x onerror=alert(2)>" onclick="alert(3)';
    const sx = (s: Servico, extra: object) => ({ ...s, ...extra }) as unknown as Servico;
    const p = sx(projeto, {
      nome: `P ${X}`, norma: X, descricao: X, premissas: [X], exclusoes: [X],
      fases: [{ nome: X, objetivo: X, atividades: X, entregaveis: X, criterioAceite: X, pct: 100, semanas: 2 }],
    });
    const a = sx(avulso, { nome: `A ${X}`, entregaveis: [X], criterioAceite: X });
    const r = sx(recorrente, { nome: `R ${X}`, inclusoMes: [X] });
    const d = dados([p, a, r], {
      org: org({ id: 'org_x', nome: `Org ${X}`, textos: { sobre: X, comoTrabalhamos: X, equipe: X, termos: `## ${X}\n\n- ${X}`, premissas: X, pagamentoPadrao: '' } }),
      cliente: { nome: `Cli ${X}`, cnpj: X, pessoas: 10 },
      textos: { contexto: X, escopo: X, observacoes: X },
      pagamento: X,
      diagnostico: { ...diag, faixaNome: X, maturidade: [{ dominio: X, pct: 50 }], lacunas: [{ titulo: X, requisito: X, impacto: X, acao: X }] },
    });
    d.itens.forEach((i) => { i.textoCliente = X; });
    const editada = renderizarHtml(montarConteudo(d, { sobre: X, termos: `## ${X}` }));
    for (const html of [renderizarHtml(montarConteudo(d, {})), editada]) {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
      expect(html).not.toContain('" onclick="');
      expect(html).toContain('&lt;script&gt;');
      // o nome da organização e o número entram também no CSS das margens da página
      expect(html.match(/<\/style>/g)).toHaveLength(1);
      const strings = [...html.matchAll(/content: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
      expect(strings.join('')).toContain('Org');
      for (const s of strings) expect(s).not.toMatch(/[<>{};]/);
    }
  });

  it('cor da organização só entra se for #rrggbb', () => {
    const ok = renderizarHtml(montarConteudo(dados([projeto], { org: org({ corDestaque: '#1f7a5c' }) }), {}));
    expect(ok).toContain('#1f7a5c');
    const ruim = renderizarHtml(montarConteudo(dados([projeto], { org: org({ corDestaque: 'red;}</style><script>alert(1)</script>' }) }), {}));
    expect(ruim).not.toMatch(/<script/i);
    expect(ruim).not.toContain('red;}');
    expect(ruim).toContain('#00ade8');
  });

  it('determinístico: não depende da hora atual', () => {
    const d = dados([projeto, recorrente]);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const a = renderizarHtml(montarConteudo(d, { sobre: 'x' }));
    vi.setSystemTime(new Date('2031-06-15T13:00:00Z'));
    const b = renderizarHtml(montarConteudo(d, { sobre: 'x' }));
    expect(b).toBe(a);
    expect(a).toContain('02/10/2026');
    expect(a).toContain('01/11/2026');
  });
});

describe('hashDocumento', () => {
  it('estável para o mesmo HTML e diferente para HTML diferente', async () => {
    const h = await hashDocumento('<p>a</p>');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashDocumento('<p>a</p>')).toBe(h);
    expect(await hashDocumento('<p>b</p>')).not.toBe(h);
  });
});

describe('SECOES_EDITAVEIS', () => {
  it('só seções de texto', () => {
    expect(SECOES_EDITAVEIS).toEqual(['sumario', 'objeto', 'como_trabalhamos', 'responsabilidades', 'sobre', 'premissas', 'termos', 'observacoes']);
  });
});
