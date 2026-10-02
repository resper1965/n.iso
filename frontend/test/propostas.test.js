// Tela de propostas (src/views/propostas.js). O que importa:
// (1) a lista mostra número/revisão, cliente, status em pílula e totais; (2) o assistente percorre
// os 5 passos e envia corpos no formato exato dos schemas .strict() (propostaCriar/Editar/Gerar);
// (3) desconto acima do teto avisa antes de gerar; (4) o 409 do servidor aparece na tela;
// (5) aguardando aprovação: botão só para platform_admin e consultoria_admin; (6) documento em iframe srcdoc e Word
// baixado com o token; (7) nada inline e todo valor escapado.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/api.js';
import '../src/views/propostas.js';
import { initDelegation } from '../src/delegation.js';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 30));
const $ = (id) => document.getElementById(id);
const digita = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
const troca = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
const clica = async (nome, args) => {
  const el = document.querySelector(`[data-action="${nome}"]` + (args ? `[data-args='${JSON.stringify(args)}']` : ''));
  expect(el, `botão ${nome}`).toBeTruthy();
  el.click();
  await espera();
};

const CFG = { prefixoProposta: 'NESS', proximoNumero: 7, sugestaoNumero: 'NESS-2026-007', preco: { tetoDesconto: 15 } };
const LEADS = [
  { id: 'l1', company_name: 'Acme', razao_social: 'Acme Ltda.', cnpj: '11222333000181', porte: 'DEMAIS' },
  { id: 'l2', company_name: 'Beta', razao_social: null, cnpj: null, porte: null },
];
const ASSESSMENTS = [{ id: 'a1', lead_id: 'l1' }];
const SERVICOS = [
  { id: 's1', ativo: true, nome: 'Implementação ISO 27001', norma: 'ISO 27001', tipo: 'projeto', diasPorFaixa: { '1': 60, '2': 90, '3': 140 } },
  { id: 's2', ativo: true, nome: 'Treinamento LGPD', norma: '', tipo: 'avulso', formaPreco: 'fixo', valorFixo: 8200 },
  { id: 's3', ativo: true, nome: 'Acompanhamento', norma: '', tipo: 'recorrente', mensalidade: 4000, prazoMinimoMeses: 12 },
];
const LISTA = [
  { id: 'p1', numero: 'NESS-2026-001', revisao: 2, status: 'gerada', cliente: 'Acme Ltda.', total_projeto: 339300, mensalidade: 0 },
  { id: 'p2', numero: null, revisao: 1, status: 'rascunho', cliente: 'Beta', total_projeto: 0, mensalidade: 4000 },
  { id: 'p3', numero: null, revisao: 1, status: 'aguardando_aprovacao', cliente: 'Gama', total_projeto: 10000, mensalidade: 0 },
];
const item = (o) => ({ id: 'i-' + o.servico_id, servico_id: o.servico_id, servico: SERVICOS.find((s) => s.id === o.servico_id),
  dias: null, meses: null, desconto_pct: 0, valor_base: 1000, valor: 1000, texto_cliente: '', ...o });
const proposta = (o = {}) => ({
  id: 'pn', numero: null, revisao: 1, status: 'rascunho', cliente: 'Acme Ltda.', lead_id: 'l1', assessment_id: 'a1',
  validade_dias: 30, pagamento: '40/30/30', contexto: '', escopo: '', observacoes: '', consultor_email: null,
  total_projeto: 0, mensalidade: 0, secoes_editadas: {},
  memoria: { faixa: '3', pessoas: 120, origem: 'diagnóstico', itens: [] },
  margem: { custoTotal: 100000, receitaLiquida: 250000, margemPct: 0.42, viavel: true }, itens: [], ...o,
});
const PREVIA = {
  html: '<!doctype html><html><body><h1>Prévia</h1></body></html>',
  conteudo: { numero: 'NESS-2026-007', revisao: 1, secoes: [
    { id: 'sumario', titulo: 'Sumário executivo', editada: false },
    { id: 'sobre', titulo: 'Sobre a ness.', editada: false },
    { id: 'termos', titulo: 'Termos e condições', editada: true },
    { id: 'investimento', titulo: 'Investimento', editada: false },
  ] },
  textos: { sumario: 'Contexto atual.', sobre: 'Somos a ness.', termos: '## Foro\n\nSão Paulo.' },
};

let fetchMock;
let rotas;
// rotas: { 'GET /api/v1/propostas': corpo | (o) => Response }
function servidor(extra = {}) {
  let atual = proposta();
  rotas = {
    'GET /api/v1/propostas': LISTA,
    'GET /api/v1/org/config': CFG,
    'GET /api/v1/leads': LEADS,
    'GET /api/v1/assessments': ASSESSMENTS,
    'GET /api/v1/servicos?ativos=1': SERVICOS,
    'POST /api/v1/propostas': () => json(atual, 201),
    'PUT /api/v1/propostas/pn': (o) => {
      const b = JSON.parse(o.body);
      if (b.itens) atual = { ...atual, itens: b.itens.map((i) => item({ servico_id: i.servicoId, dias: i.dias ?? null, meses: i.meses ?? null, desconto_pct: i.descontoPct ?? 0, texto_cliente: i.textoCliente ?? '' })),
        memoria: { ...atual.memoria, itens: b.itens.map((i) => `Memória de ${i.servicoId}: 90 dias × R$ 2.900`) } };
      return json(atual);
    },
    'GET /api/v1/propostas/pn': () => json(atual),
    'GET /api/v1/propostas/pn/previa': PREVIA,
    'POST /api/v1/propostas/pn/gerar': () => json({ ...atual, status: 'gerada', numero: 'NESS-2026-007' }),
    'GET /api/v1/propostas/pn/documento': () => new Response('<html><body><h1>Documento congelado</h1></body></html>', { headers: { 'content-type': 'text/html' } }),
    ...extra,
  };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
    const chave = `${o.method || 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`;
    const r = rotas[chave];
    if (r === undefined) return json({ error: 'sem rota ' + chave }, 404);
    return typeof r === 'function' ? r(o) : json(r);
  });
}
const chamadas = (metodo, caminho) => fetchMock.mock.calls.filter(([u, o = {}]) => (o.method || 'GET') === metodo && String(u).endsWith(caminho));
const corpo = (metodo, caminho, i = 0) => JSON.parse(chamadas(metodo, caminho)[i][1].body);

async function monta(papel = 'comercial') {
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="hdr"></h1><div id="act"></div><div id="content"></div>';
  initDelegation();
  S.user = { role: papel, email: 'com@ness.lat' };
  S.token = 'tok-123';
  await window.renderPropostas($('content'), $('hdr'), $('act'));
  await espera();
  return $('content');
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.showToast = vi.fn();
  servidor();
});

describe('lista', () => {
  it('número e revisão, cliente, pílula de status, totais e ações por status', async () => {
    const c = await monta();
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain('NESS-2026-001');
    expect(linhas[0].textContent).toContain('rev. 2');
    expect(linhas[0].textContent).toContain('R$ 339.300');
    expect(linhas[1].textContent).toContain('sem número');
    expect(linhas[1].textContent).toContain('R$ 4.000');
    const pilulas = [...c.querySelectorAll('.prp-pilula')].map((p) => [p.textContent.trim(), p.className]);
    expect(pilulas[0]).toEqual(['Gerada', 'prp-pilula prp-st-gerada']);
    expect(pilulas[1][0]).toBe('Rascunho');
    expect(pilulas[2][0]).toBe('Aguardando aprovação');
    expect(linhas[0].querySelector('[data-action="__prpRevisao"]')).toBeTruthy();
    expect(linhas[0].querySelector('[data-action="__prpDocumento"]')).toBeTruthy();
    expect(linhas[1].querySelector('[data-action="__prpRevisao"]')).toBeNull();
    expect(linhas[1].querySelector('[data-action="__prpDocumento"]')).toBeNull();
  });
});

async function ateAjustes() {
  await monta();
  await clica('__prpNova');
  troca('prp-lead', 'l1');
  await espera();
  await clica('__prpAvancar');
  await clica('__prpAvancar');
}

describe('assistente', () => {
  it('passo Cliente mostra CNPJ, porte e se há diagnóstico; cria com o corpo do propostaCriarSchema', async () => {
    await monta();
    await clica('__prpNova');
    troca('prp-lead', 'l1');
    await espera();
    const ficha = $('prp-ficha').textContent;
    expect(ficha).toContain('11.222.333/0001-81');
    expect(ficha).toContain('DEMAIS');
    expect(ficha).toContain('com diagnóstico');
    troca('prp-lead', 'l2');
    await espera();
    expect($('prp-ficha').textContent).toContain('sem diagnóstico');
    troca('prp-lead', 'l1');
    await clica('__prpAvancar');
    expect(corpo('POST', '/api/v1/propostas')).toEqual({ leadId: 'l1', itens: [] });
  });

  it('percorre os 5 passos e envia os corpos no formato dos schemas', async () => {
    await monta();
    await clica('__prpNova');
    troca('prp-lead', 'l1');
    await clica('__prpAvancar');

    // Serviços: com diagnóstico, o de projeto vem marcado com os dias da faixa (3 = Enterprise, 140)
    expect($('prp-srv-s1').checked).toBe(true);
    expect($('prp-srv-s2').checked).toBe(false);
    expect(document.querySelector('[for="prp-srv-s1"]').closest('li').textContent).toContain('140 dias');
    $('prp-srv-s3').checked = true;
    await clica('__prpAvancar');
    expect(corpo('PUT', '/api/v1/propostas/pn')).toEqual({ itens: [{ servicoId: 's1' }, { servicoId: 's3' }] });

    // Ajustes: memória e margem visíveis
    expect(document.querySelector('.prp-memoria').textContent).toContain('Memória de s1');
    expect(document.querySelector('.prp-margem').textContent).toContain('42%');
    digita('prp-item-0-dias', '100');
    digita('prp-item-0-desconto', '10');
    digita('prp-item-0-texto', 'Inclui a certificação.');
    digita('prp-item-1-meses', '24');
    await clica('__prpAvancar');
    expect(corpo('PUT', '/api/v1/propostas/pn', 1)).toEqual({ itens: [
      { servicoId: 's1', dias: 100, descontoPct: 10, textoCliente: 'Inclui a certificação.' },
      { servicoId: 's3', meses: 24 },
    ] });

    // Número e condições: sugestão da sequência, dita provisória
    expect($('prp-numero').value).toBe('NESS-2026-007');
    expect(document.querySelector('.prp-passo').textContent).toMatch(/provisório/i);
    digita('prp-contexto', 'A Acme cresce.');
    digita('prp-escopo', 'Matriz.');
    digita('prp-validade', '45');
    digita('prp-consultor', 'cons@ness.lat');
    await clica('__prpAvancar');
    expect(corpo('PUT', '/api/v1/propostas/pn', 2)).toEqual({
      contexto: 'A Acme cresce.', escopo: 'Matriz.', observacoes: '', validadeDias: 45, pagamento: '40/30/30', consultorEmail: 'cons@ness.lat',
    });

    // Revisar documento: seções editáveis pré-preenchidas com o texto da prévia; seção de dados não aparece
    expect($('prp-secao-sumario').value).toBe('Contexto atual.');
    expect($('prp-secao-termos').value).toBe('## Foro\n\nSão Paulo.');
    expect($('prp-secao-investimento')).toBeNull();
    expect($('prp-previa').getAttribute('srcdoc') ?? $('prp-previa').srcdoc).toContain('Prévia');
    expect(document.querySelector('.prp-passo').textContent).toMatch(/provisório/i);
    expect(document.querySelector('.prp-passo').textContent).toContain('linha em branco');
    digita('prp-secao-sobre', 'Somos outra coisa.');
    await clica('__prpGerar');
    // só a seção alterada vai; as outras continuam no padrão
    expect(corpo('PUT', '/api/v1/propostas/pn', 3)).toEqual({ secoesEditadas: { sobre: 'Somos outra coisa.' } });
    expect(corpo('POST', '/api/v1/propostas/pn/gerar')).toEqual({});
    // gerada: abre o documento congelado
    await espera();
    expect($('prp-documento').srcdoc).toContain('Documento congelado');
  });

  it('número trocado vai no gerar; "Restaurar padrão" envia null', async () => {
    await ateAjustes();
    await clica('__prpAvancar');
    digita('prp-numero', 'NESS-2026-050');
    await clica('__prpAvancar');
    await clica('__prpRestaurar', ['termos']);
    expect(chamadas('PUT', '/api/v1/propostas/pn').map(([, o]) => JSON.parse(o.body)).pop()).toEqual({ secoesEditadas: { termos: null } });
    expect(document.querySelector('[data-action="__prpRestaurar"][data-args=\'["sobre"]\']')).toBeNull();
    await clica('__prpGerar');
    expect(corpo('POST', '/api/v1/propostas/pn/gerar')).toEqual({ numero: 'NESS-2026-050' });
  });

  it('desconto acima do teto avisa na hora, sem bloquear', async () => {
    await ateAjustes();
    expect(document.querySelector('.prp-teto')).toBeNull();
    digita('prp-item-0-desconto', '15');
    expect(document.querySelector('.prp-teto')).toBeNull();
    digita('prp-item-0-desconto', '20');
    const aviso = document.querySelector('.prp-teto');
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toContain('15%');
    expect(aviso.textContent).toMatch(/aprova/);
  });

  it('409 do gerar aparece na tela e a proposta mostra o aviso de aprovação ao comercial', async () => {
    servidor({
      'POST /api/v1/propostas/pn/gerar': () => json({ error: 'Desconto acima do teto de 15%: a proposta aguarda a aprovação do administrador' }, 409),
      'GET /api/v1/propostas/pn': () => json(proposta({ status: 'aguardando_aprovacao' })),
    });
    await ateAjustes();
    await clica('__prpAvancar');
    await clica('__prpAvancar');
    await clica('__prpGerar');
    await espera();
    expect($('prp-erro').textContent).toContain('Desconto acima do teto de 15%');
    expect($('prp-erro').getAttribute('role')).toBe('alert');
    expect(document.querySelector('.prp-aprovacao').textContent).toMatch(/aguarda a aprovação/i);
    expect(document.querySelector('[data-action="__prpAprovar"]')).toBeNull();
  });

  it.each(['platform_admin', 'consultoria_admin'])('%s vê "Aprovar desconto" e aprova pela API', async (papel) => {
    servidor({
      'GET /api/v1/propostas/p3': proposta({ id: 'p3', status: 'aguardando_aprovacao' }),
      'POST /api/v1/propostas/p3/aprovar-desconto': () => json(proposta({ id: 'p3', status: 'rascunho' })),
    });
    await monta(papel);
    await clica('__prpAbrir', ['p3']);
    await clica('__prpAprovar');
    expect(chamadas('POST', '/api/v1/propostas/p3/aprovar-desconto')).toHaveLength(1);
  });
});

describe('documento', () => {
  it('iframe srcdoc com o HTML congelado; Word baixado com o token, sem handler inline', async () => {
    servidor({
      'GET /api/v1/propostas/p1': proposta({ id: 'p1', status: 'gerada', numero: 'NESS-2026-001', revisao: 2 }),
      'GET /api/v1/propostas/p1/documento': () => new Response('<html><body>Doc p1</body></html>', { headers: { 'content-type': 'text/html' } }),
      // Corpo em texto: o Blob do jsdom dentro do Response do Node 22 (o do CI) não é lido; no Node 24 é.
      'GET /api/v1/propostas/p1/docx': () => new Response('PK', { headers: { 'content-type': 'application/octet-stream' } }),
      'POST /api/v1/propostas/p1/revisao': () => json(proposta({ id: 'p9', numero: 'NESS-2026-001', revisao: 3 }), 201),
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await monta();
    await clica('__prpDocumento', ['p1']);
    const frame = $('prp-documento');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.srcdoc).toContain('Doc p1');
    expect(chamadas('GET', '/api/v1/propostas/p1/documento')[0][1].headers.Authorization).toBe('Bearer tok-123');
    expect(document.querySelector('[data-action="__prpImprimir"]').textContent).toContain('Imprimir / PDF');
    await clica('__prpWord');
    expect(chamadas('GET', '/api/v1/propostas/p1/docx')[0][1].headers.Authorization).toBe('Bearer tok-123');
    // `r.blob()` leva mais ciclos sob cobertura (CI): espera a condição, não um número fixo de ticks.
    await vi.waitFor(() => expect(clique, `erro mostrado: ${JSON.stringify(window.showToast.mock.calls)}`).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clique.mock.instances[0].download).toBe('NESS-2026-001-rev2.docx');
  });

  it('platform_admin atuando em outra organização: o documento (fetch direto) leva o X-Org-Id', async () => {
    servidor({
      'GET /api/v1/propostas/p1': proposta({ id: 'p1', status: 'gerada', numero: 'ALFA-2026-001', revisao: 1 }),
      'GET /api/v1/propostas/p1/documento': () => new Response('<html><body>Doc</body></html>', { headers: { 'content-type': 'text/html' } }),
    });
    S.orgAtuacao = 'org_alfa';
    try {
      await monta('platform_admin');
      await clica('__prpDocumento', ['p1']);
      expect(chamadas('GET', '/api/v1/propostas/p1/documento')[0][1].headers['X-Org-Id']).toBe('org_alfa');
      expect(chamadas('GET', '/api/v1/propostas').every(([, o]) => o.headers['X-Org-Id'] === 'org_alfa')).toBe(true);
    } finally { S.orgAtuacao = null; }
  });
});

describe('segurança', () => {
  it('valor do servidor é escapado e não há handler nem script inline', async () => {
    servidor({ 'GET /api/v1/propostas': [{ ...LISTA[0], cliente: '<img src=x onerror=alert(1)>', numero: '"><script>x</script>' }] });
    const c = await monta();
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('script')).toBeNull();
    expect(c.textContent).toContain('<img src=x onerror=alert(1)>');
    await clica('__prpNova');
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    expect(document.querySelector('script')).toBeNull();
  });
});
