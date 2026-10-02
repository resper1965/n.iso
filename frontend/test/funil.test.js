// Lista de leads e seção Funil (src/views/commercial.js): cartões com os status REAIS do banco
// (New/Assessment/Proposal/Won/Lost) e funil só para quem a rota admite.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/api.js';
import '../src/views/commercial.js';
import { initDelegation } from '../src/delegation.js';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo).
const lido = (glob) => Object.values(glob)[0];
const css = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));
const view = lido(import.meta.glob('../src/views/commercial.js', { query: '?raw', import: 'default', eager: true }));

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 30));
const $ = (id) => document.getElementById(id);

const lead = (id, status) => ({ id, company_name: `Empresa ${id}`, status });
const LEADS = [lead('1', 'New'), lead('2', 'New'), lead('3', 'Assessment'), lead('4', 'Proposal'), lead('5', 'Won'), lead('6', 'Lost'), lead('7', 'Lost'), lead('8', 'Lost')];
const FUNIL = {
  periodo: { de: '2026-01-01', ate: '2026-03-31' },
  leads: { New: 2, Assessment: 1, Proposal: 1, Won: 1, Lost: 3 },
  conversao: [
    { etapa: 'leads criados', leads: 8, percentualDaAnterior: 100 },
    { etapa: 'proposta gerada', leads: 3, percentualDaAnterior: 37.5 },
    { etapa: 'proposta enviada', leads: 3, percentualDaAnterior: 100 },
    { etapa: 'proposta aceita', leads: 1, percentualDaAnterior: 33.3 },
  ],
  pipeline: { propostas: 2, totalProjeto: 90000, mensalidade: 4000 },
  ganho: { propostas: 1, totalProjeto: 100000, mensalidade: 5000 },
  cicloMedioDias: 30.5,
  perdas: [{ motivo: 'preço alto <b>x</b>', quantidade: 2 }],
  propostasPorStatus: { rascunho: 0, aceita: 1, recusada: 2 },
};

let fetchMock;
async function monta(papel, funil = () => json(FUNIL)) {
  document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  initDelegation();
  S.user = { role: papel };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    String(url).includes('/api/v1/funil') ? funil(url) : json(LEADS));
  await window.renderLeads($('content'), $('hdr'), $('act'));
  await espera();
  return $('content');
}
const valorDoCartao = (c, rotulo) =>
  [...c.querySelectorAll('.stat-card')].find((x) => x.textContent.includes(rotulo))
    ?.children[1].textContent;
const chamadasFunil = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/api/v1/funil'));

beforeEach(() => vi.restoreAllMocks());

describe('cartões de leads', () => {
  it('contam pelos status reais do banco', async () => {
    const c = await monta('comercial');
    expect(valorDoCartao(c, 'Total de Oportunidades')).toBe('8');
    expect(valorDoCartao(c, 'Novos')).toBe('2');
    expect(valorDoCartao(c, 'Em diagnóstico')).toBe('1');
    expect(valorDoCartao(c, 'Com proposta')).toBe('1');
    expect(valorDoCartao(c, 'Ganhos')).toBe('1');
    expect(valorDoCartao(c, 'Perdidos')).toBe('3');
  });
});

describe('seção Funil por papel', () => {
  for (const papel of ['comercial', 'consultoria_admin', 'platform_admin']) {
    it(`${papel} vê o funil e a tela chama GET /funil`, async () => {
      const c = await monta(papel);
      expect($('fn-funil')).toBeTruthy();
      expect(chamadasFunil()).toHaveLength(1);
      expect($('fn-de').value).toBe('2026-01-01');
      expect($('fn-ate').value).toBe('2026-03-31');
      expect(valorDoCartao(c, 'Pipeline: projeto')).toMatch(/90\.000,00/);
      expect(valorDoCartao(c, 'Pipeline: mensalidade')).toMatch(/4\.000,00/);
      expect(valorDoCartao(c, 'Ganho: projeto')).toMatch(/100\.000,00/);
      expect(valorDoCartao(c, 'Ciclo médio')).toBe('30,5 dias');
      expect($('fn-corpo').textContent).toContain('proposta aceita');
      expect($('fn-corpo').textContent).toContain('33,3%');
    });
  }

  for (const papel of ['consultor', 'org_admin', 'client']) {
    it(`${papel} não vê a seção nem chama a rota`, async () => {
      await monta(papel);
      expect($('fn-funil')).toBeNull();
      expect(chamadasFunil()).toEqual([]);
    });
  }

  it('motivo de perda vem escapado (nada vira HTML)', async () => {
    const c = await monta('comercial');
    expect(c.querySelector('#fn-corpo b')).toBeNull();
    expect($('fn-corpo').textContent).toContain('preço alto <b>x</b>');
  });

  it('o seletor de período manda de e ate; label ligado a cada input', async () => {
    await monta('comercial');
    expect(document.querySelector('label[for="fn-de"]')).toBeTruthy();
    expect(document.querySelector('label[for="fn-ate"]')).toBeTruthy();
    $('fn-de').value = '2026-02-01';
    $('fn-ate').value = '2026-02-28';
    $('fn-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await espera();
    expect(chamadasFunil().at(-1)).toMatch(/\/api\/v1\/funil\?de=2026-02-01&ate=2026-02-28$/);
  });

  it('erro do servidor aparece no alerta da seção, sem derrubar a lista', async () => {
    const c = await monta('comercial', () => json({ error: 'Janela máxima de 366 dias' }, 400));
    expect($('fn-erro').textContent).toContain('Janela máxima de 366 dias');
    expect(valorDoCartao(c, 'Total de Oportunidades')).toBe('8');
  });
});

describe('CSS e markup da seção', () => {
  it('toda classe fn-* usada tem regra em style.css', () => {
    const usadas = new Set([...view.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].match(/\bfn-[a-z0-9-]+/g) || []));
    expect(usadas.size).toBeGreaterThan(5);
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });

  it('sem handler nem script inline na seção', () => {
    const trecho = view.slice(view.indexOf('id="fn-funil"'), view.indexOf('const PAPEIS_FUNIL'));
    expect(trecho).not.toMatch(/\son[a-z]+=|<script/i);
  });
});
