// Tela do catálogo de serviços (src/views/catalogo.js). O que importa:
// (1) a lista resume o preço certo de cada tipo; (2) o formulário muda com o tipo;
// (3) projeto só salva com as fases somando 100%; (4) o corpo enviado é o do servicoSchema;
// (5) o 400 do servidor aparece junto do campo apontado por details[].path; (6) sem handler inline.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/api.js';
import '../src/views/catalogo.js';
import { initDelegation } from '../src/delegation.js';

const MODAL = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 30));
const $ = (id) => document.getElementById(id);
const digita = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
const troca = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
const envia = () => $('cat-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const acao = (c, nome, id) => c.querySelector(`[data-action="${nome}"]` + (id ? `[data-args='["${id}"]']` : ''));

const SERVICOS = [
  { id: 's1', orgId: 'org_ness', ativo: true, nome: 'Implementação ISO 27001', norma: 'ISO 27001', descricao: '', tipo: 'projeto',
    diasPorFaixa: { '1': 60, '2': 90, '3': 130 }, premissas: [], exclusoes: [],
    fases: [{ nome: 'Escopo', objetivo: '', atividades: '', entregaveis: '', criterioAceite: '', pct: 100, semanas: 4 }] },
  { id: 's2', orgId: 'org_ness', ativo: true, nome: 'Teste de invasão', norma: '', descricao: '', tipo: 'avulso', formaPreco: 'fixo',
    valorFixo: 4000, entregaveis: ['Relatório'], criterioAceite: 'Relatório aceito', premissas: [], exclusoes: [] },
  { id: 's3', orgId: 'org_ness', ativo: true, nome: 'Acompanhamento', norma: '', descricao: '', tipo: 'recorrente',
    mensalidade: 4000, prazoMinimoMeses: 12, inclusoMes: ['Reunião mensal'], premissas: [], exclusoes: [] },
  { id: 's4', orgId: 'org_ness', ativo: false, nome: 'Serviço antigo', norma: '', descricao: '', tipo: 'recorrente',
    mensalidade: 1000, prazoMinimoMeses: 6, inclusoMes: ['x'], premissas: [], exclusoes: [] },
];

let fetchMock;
async function monta(papel = 'platform_admin', lista = SERVICOS) {
  document.body.innerHTML = MODAL + '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  initDelegation();
  S.user = { role: papel };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o) => {
    if ((o?.method || 'GET') === 'GET') return json(lista);
    return json({}, 201);
  });
  await window.renderCatalogo($('content'), $('hdr'), $('act'));
  return $('content');
}
const chamadas = (metodo) => fetchMock.mock.calls.filter(([, o]) => o.method === metodo);

beforeEach(() => {
  window.showToast = vi.fn();
  vi.restoreAllMocks();
});

describe('lista', () => {
  it('mostra os serviços ativos com o resumo de preço de cada tipo', async () => {
    const c = await monta();
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain('90 dias na faixa Standard');
    expect(linhas[1].textContent).toContain('R$ 4.000');
    expect(linhas[2].textContent).toContain('R$ 4.000/mês × 12');
    expect(c.textContent).not.toContain('Serviço antigo');
  });

  it('"mostrar arquivados" traz o arquivado, com a situação', async () => {
    const c = await monta();
    $('cat-arquivados').checked = true;
    $('cat-arquivados').dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(c.textContent).toContain('Arquivado');
  });

  it('arquivar pede confirmação na própria tela e só então chama a API', async () => {
    const c = await monta();
    acao(c, '__catArquivar', 's2').click();
    expect(chamadas('POST')).toHaveLength(0);
    acao(c, '__catArquivarSim').click();
    await espera();
    expect(chamadas('POST')[0][0]).toContain('/api/v1/servicos/s2/arquivar');
  });

  it('catálogo vazio: platform_admin e consultoria_admin veem "Carregar catálogo inicial"', async () => {
    let c = await monta('platform_admin', []);
    expect(c.textContent).toContain('Carregar catálogo inicial');
    c = await monta('consultoria_admin', []);
    expect(c.querySelector('[data-action="__catSemear"]')).toBeTruthy();
    c = await monta('comercial', []);
    expect(c.textContent).not.toContain('Carregar catálogo inicial');
  });

  it('consultoria_admin cria, edita e arquiva (botões de gravação presentes)', async () => {
    const c = await monta('consultoria_admin');
    expect(c.querySelector('[data-action="__catNovo"]')).toBeTruthy();
    expect(c.querySelector('[data-action="__catEditar"]')).toBeTruthy();
    expect(c.querySelector('[data-action="__catArquivar"]')).toBeTruthy();
  });
});

describe('formulário', () => {
  it('trocar o tipo troca os campos', async () => {
    const c = await monta();
    acao(c, '__catNovo').click();
    expect($('cat-diasPorFaixa-1')).toBeTruthy();
    expect($('cat-mensalidade')).toBeNull();
    troca('cat-tipo', 'recorrente');
    expect($('cat-mensalidade')).toBeTruthy();
    expect($('cat-diasPorFaixa-1')).toBeNull();
    troca('cat-tipo', 'avulso');
    expect($('cat-formaPreco')).toBeTruthy();
    expect($('cat-valorFixo')).toBeTruthy();
    troca('cat-formaPreco', 'esforco');
    expect($('cat-valorFixo')).toBeNull();
    expect($('cat-diasPorFaixa-2')).toBeTruthy();
  });

  it('fases somando 90 desabilitam Salvar e destacam o total; 100 habilita', async () => {
    const c = await monta();
    acao(c, '__catNovo').click();
    digita('cat-fases-0-pct', '90');
    expect($('cat-salvar').disabled).toBe(true);
    expect($('cat-fases-total').textContent).toContain('90');
    expect($('cat-fases-total').classList.contains('cat-total-erro')).toBe(true);
    digita('cat-fases-0-pct', '100');
    expect($('cat-salvar').disabled).toBe(false);
    expect($('cat-fases-total').classList.contains('cat-total-erro')).toBe(false);
  });

  it('adicionar e remover fase mantém o que já foi digitado e recalcula o total', async () => {
    const c = await monta();
    acao(c, '__catNovo').click();
    digita('cat-fases-0-nome', 'Escopo');
    digita('cat-fases-0-pct', '60');
    acao(document, '__catFaseAdd').click();
    expect($('cat-fases-0-nome').value).toBe('Escopo');
    digita('cat-fases-1-pct', '40');
    expect($('cat-salvar').disabled).toBe(false);
    acao(document, '__catFaseDel', '0').click();
    expect($('cat-fases-1')).toBeNull();
    expect($('cat-fases-0-pct').value).toBe('40');
    expect($('cat-salvar').disabled).toBe(true);
  });

  it('salva no formato do servicoSchema (projeto), com números como número', async () => {
    const c = await monta();
    acao(c, '__catNovo').click();
    digita('cat-nome', 'Novo projeto');
    digita('cat-norma', 'ISO 27001');
    digita('cat-premissas', 'Acesso ao time\n\nAcesso aos sistemas');
    digita('cat-diasPorFaixa-1', '60');
    digita('cat-diasPorFaixa-2', '90');
    digita('cat-diasPorFaixa-3', '130');
    digita('cat-fases-0-nome', 'Escopo');
    digita('cat-fases-0-pct', '100');
    digita('cat-fases-0-semanas', '4');
    envia();
    await espera();
    const [url, o] = chamadas('POST')[0];
    expect(url).toContain('/api/v1/servicos');
    expect(JSON.parse(o.body)).toEqual({
      tipo: 'projeto', nome: 'Novo projeto', norma: 'ISO 27001', descricao: '',
      premissas: ['Acesso ao time', 'Acesso aos sistemas'], exclusoes: [],
      diasPorFaixa: { '1': 60, '2': 90, '3': 130 },
      fases: [{ nome: 'Escopo', objetivo: '', atividades: '', entregaveis: '', criterioAceite: '', pct: 100, semanas: 4 }],
    });
  });

  it('salva avulso fixo, avulso por esforço e recorrente com as chaves do schema', async () => {
    const c = await monta();
    acao(c, '__catNovo').click();
    troca('cat-tipo', 'avulso');
    digita('cat-nome', 'Pentest');
    digita('cat-valorFixo', '4000');
    digita('cat-entregaveis', 'Relatório');
    digita('cat-criterioAceite', 'Aceito pelo cliente');
    envia();
    await espera();
    expect(JSON.parse(chamadas('POST')[0][1].body)).toMatchObject({
      tipo: 'avulso', formaPreco: 'fixo', valorFixo: 4000, entregaveis: ['Relatório'], criterioAceite: 'Aceito pelo cliente',
    });
    acao(c, '__catNovo').click();
    troca('cat-tipo', 'avulso');
    troca('cat-formaPreco', 'esforco');
    digita('cat-nome', 'Auditoria');
    for (const f of ['1', '2', '3']) digita('cat-diasPorFaixa-' + f, '10');
    digita('cat-entregaveis', 'Relatório');
    digita('cat-criterioAceite', 'Aceito');
    envia();
    await espera();
    const esforco = JSON.parse(chamadas('POST')[1][1].body);
    expect(esforco).toMatchObject({ tipo: 'avulso', formaPreco: 'esforco', diasPorFaixa: { '1': 10, '2': 10, '3': 10 } });
    expect(esforco).not.toHaveProperty('valorFixo');
    acao(c, '__catNovo').click();
    troca('cat-tipo', 'recorrente');
    digita('cat-nome', 'Acompanhamento');
    digita('cat-mensalidade', '4000');
    digita('cat-prazoMinimoMeses', '12');
    digita('cat-inclusoMes', 'Reunião mensal');
    envia();
    await espera();
    expect(JSON.parse(chamadas('POST')[2][1].body)).toMatchObject({
      tipo: 'recorrente', mensalidade: 4000, prazoMinimoMeses: 12, inclusoMes: ['Reunião mensal'],
    });
  });

  it('editar abre preenchido e salva por PUT', async () => {
    const c = await monta();
    acao(c, '__catEditar', 's3').click();
    expect($('cat-mensalidade').value).toBe('4000');
    envia();
    await espera();
    expect(chamadas('PUT')[0][0]).toContain('/api/v1/servicos/s3');
  });

  it('400 do servidor mostra a mensagem junto do campo apontado pelo path', async () => {
    const c = await monta();
    acao(c, '__catNovo').click();
    digita('cat-fases-0-pct', '100');
    fetchMock.mockImplementation(async (url, o) => (o.method === 'POST'
      ? json({ error: 'Payload invalido', details: [{ path: 'nome', message: 'Informe o nome' }, { path: 'diasPorFaixa.2', message: 'Dias inválidos' }] }, 400)
      : json(SERVICOS)));
    envia();
    await espera();
    expect($('cat-nome-erro').textContent).toBe('Informe o nome');
    expect($('cat-diasPorFaixa-2-erro').textContent).toBe('Dias inválidos');
    expect($('cat-nome').getAttribute('aria-invalid')).toBe('true');
    expect($('modal-overlay').classList.contains('open')).toBe(true);
  });
});

describe('segurança', () => {
  it('valor do servidor é escapado e não há handler nem script inline', async () => {
    const hostil = [{ ...SERVICOS[1], nome: '<img src=x onerror=alert(1)>' }];
    const c = await monta('platform_admin', hostil);
    expect(c.querySelector('img')).toBeNull();
    acao(c, '__catEditar').click();
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    expect(document.querySelector('script')).toBeNull();
    expect($('cat-nome').value).toBe('<img src=x onerror=alert(1)>');
  });
});
