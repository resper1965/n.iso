// Tela de configuração comercial (src/views/config-comercial.js): comercial só lê, platform_admin
// grava; a prévia do número acompanha o prefixo; 400 aparece junto do campo.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/api.js';
import '../src/views/config-comercial.js';
import { initDelegation } from '../src/delegation.js';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 30));
const $ = (id) => document.getElementById(id);
const digita = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('input', { bubbles: true })); };

const CONFIG = {
  id: 'org_ness', nome: 'ness.', cnpj: '12345678000199', corDestaque: '#00ade8', seloNiso: true,
  prefixoProposta: 'NESS', proximoNumero: 14, sugestaoNumero: 'NESS-2026-014',
  preco: {
    diaria: { '1': 2000, '2': 2900, '3': 3800 },
    porte: [{ maxPessoas: 50, fator: 1 }, { maxPessoas: null, fator: 1.5 }],
    tetoDesconto: 15, custoInterno: { '1': 900, '2': 1200, '3': 1600 }, overheadPct: 0.2, tributosPct: 0.1, margemAlvo: 0.4,
  },
  textos: { sobre: 'Sobre a <b>ness.</b>', comoTrabalhamos: '', equipe: '', termos: '', premissas: '', pagamentoPadrao: '30 dias' },
  secoesDesligadas: [],
};

let fetchMock;
async function monta(papel) {
  document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  initDelegation();
  S.user = { role: papel };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(CONFIG));
  await window.renderConfigComercial($('content'), $('hdr'), $('act'));
  return $('content');
}
const envia = () => $('cfg-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const put = () => fetchMock.mock.calls.find(([, x]) => x.method === 'PUT');

beforeEach(() => {
  window.showToast = vi.fn();
  vi.restoreAllMocks();
});

describe('permissão', () => {
  it('comercial vê tudo preenchido, readonly e sem Salvar', async () => {
    const c = await monta('comercial');
    expect($('cfg-nome').value).toBe('ness.');
    const campos = [...c.querySelectorAll('input, textarea, select')];
    expect(campos.length).toBeGreaterThan(20);
    expect(campos.filter((x) => !x.readOnly && !x.disabled)).toEqual([]);
    expect(c.querySelector('#cfg-salvar')).toBeNull();
  });

  it('platform_admin tem campos editáveis e o botão Salvar', async () => {
    const c = await monta('platform_admin');
    expect($('cfg-nome').readOnly).toBe(false);
    expect(c.querySelector('#cfg-salvar')).toBeTruthy();
  });
});

describe('conteúdo', () => {
  it('quatro blocos, o custo interno recolhido, seis textos rotulados', async () => {
    const c = await monta('platform_admin');
    for (const t of ['Identidade', 'Numeração', 'Preço', 'Textos']) expect(c.textContent).toContain(t);
    expect(c.querySelector('details#cfg-custos').open).toBe(false);
    for (const k of ['sobre', 'comoTrabalhamos', 'equipe', 'termos', 'premissas', 'pagamentoPadrao']) {
      expect(c.querySelector(`label[for="cfg-textos-${k}"]`)).toBeTruthy();
      expect($('cfg-textos-' + k).tagName).toBe('TEXTAREA');
    }
    expect($('cfg-corDestaque').type).toBe('color');
    expect(c.querySelectorAll('.cfg-porte-linha')).toHaveLength(2);
  });

  it('toda entrada tem rótulo associado', async () => {
    const c = await monta('platform_admin');
    const sem = [...c.querySelectorAll('input, textarea, select')].filter((x) => !c.querySelector(`label[for="${x.id}"]`));
    expect(sem.map((x) => x.id)).toEqual([]);
  });

  it('a prévia do número muda ao digitar o prefixo', async () => {
    await monta('platform_admin');
    const ano = new Date().getFullYear();
    expect($('cfg-previa').textContent).toBe(`NESS-${ano}-014`);
    digita('cfg-prefixoProposta', 'ABC');
    expect($('cfg-previa').textContent).toBe(`ABC-${ano}-014`);
  });
});

describe('salvar', () => {
  it('envia o corpo no formato do configOrgSchema', async () => {
    await monta('platform_admin');
    digita('cfg-preco-tetoDesconto', '20');
    digita('cfg-preco-overheadPct', '25');
    envia();
    await espera();
    const [url, o] = put();
    expect(url).toContain('/api/v1/org/config');
    const b = JSON.parse(o.body);
    expect(b.nome).toBe('ness.');
    expect(b.cnpj).toBe('12345678000199');
    expect(b.corDestaque).toBe('#00ade8');
    expect(b.seloNiso).toBe(true);
    expect(b.proximoNumero).toBe(14);
    expect(b.preco.diaria).toEqual({ '1': 2000, '2': 2900, '3': 3800 });
    expect(b.preco.porte).toEqual([{ maxPessoas: 50, fator: 1 }, { maxPessoas: null, fator: 1.5 }]);
    expect(b.preco.tetoDesconto).toBe(20);
    expect(b.preco.overheadPct).toBe(0.25);
    expect(b.preco.tributosPct).toBe(0.1);
    expect(b.preco.custoInterno).toEqual({ '1': 900, '2': 1200, '3': 1600 });
    expect(b.textos.sobre).toBe('Sobre a <b>ness.</b>');
    expect(b.secoesDesligadas).toEqual([]);
    expect(Object.keys(b).sort()).toEqual(['cnpj', 'corDestaque', 'nome', 'preco', 'prefixoProposta', 'proximoNumero', 'secoesDesligadas', 'seloNiso', 'textos']);
  });

  it('seção desligada vai no corpo', async () => {
    await monta('platform_admin');
    $('cfg-sec-responsabilidades').checked = true;
    envia();
    await espera();
    expect(JSON.parse(put()[1].body).secoesDesligadas).toEqual(['responsabilidades']);
  });

  it('400 mostra a mensagem junto do campo pelo path, abrindo o bloco recolhido', async () => {
    await monta('platform_admin');
    fetchMock.mockImplementation(async (url, o) => (o?.method === 'PUT'
      ? json({ error: 'Payload invalido', details: [
        { path: 'preco.diaria.1', message: 'Diária inválida' },
        { path: 'preco.custoInterno.2', message: 'Custo inválido' }] }, 400)
      : json(CONFIG)));
    envia();
    await espera();
    expect($('cfg-preco-diaria-1-erro').textContent).toBe('Diária inválida');
    expect($('cfg-preco-diaria-1').getAttribute('aria-invalid')).toBe('true');
    expect($('cfg-preco-custoInterno-2-erro').textContent).toBe('Custo inválido');
    expect($('cfg-custos').open).toBe(true);
  });
});

describe('segurança', () => {
  it('texto do servidor é escapado; sem handler nem script inline', async () => {
    const c = await monta('platform_admin');
    expect(c.querySelector('b')).toBeNull();
    expect($('cfg-textos-sobre').value).toBe('Sobre a <b>ness.</b>');
    expect(c.innerHTML).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    expect(c.querySelector('script')).toBeNull();
  });
});
