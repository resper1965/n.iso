// Tela de configuração comercial (src/views/config-comercial.js): comercial só lê, platform_admin e
// consultoria_admin gravam; logo com pré-visualização e regras; a prévia do número acompanha o prefixo; 400 aparece junto do campo.
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

  it.each(['platform_admin', 'consultoria_admin'])('%s tem campos editáveis e o botão Salvar', async (papel) => {
    const c = await monta(papel);
    expect($('cfg-nome').readOnly).toBe(false);
    expect($('cfg-corDestaque').disabled).toBe(false);
    expect($('cfg-seloNiso').disabled).toBe(false);
    expect(c.querySelector('#cfg-salvar')).toBeTruthy();
    expect(c.querySelector('.cfg-nota[role="note"]')).toBeNull();
  });

  it('consultoria_admin grava pelo PUT', async () => {
    await monta('consultoria_admin');
    envia();
    await espera();
    expect(put()).toBeTruthy();
  });

  it.each(['consultor', 'org_admin'])('%s: tudo travado, sem Salvar nem envio de logo', async (papel) => {
    const c = await monta(papel);
    expect([...c.querySelectorAll('input, textarea, select')].filter((x) => !x.readOnly && !x.disabled)).toEqual([]);
    expect(c.querySelector('#cfg-salvar')).toBeNull();
    expect($('cfg-logo-arquivo')).toBeNull();
  });
});

describe('logo', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let logo;
  async function montaLogo(papel, resposta) {
    document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
    initDelegation();
    S.user = { role: papel };
    S.token = 'tok-123';
    URL.createObjectURL = vi.fn((b) => (b instanceof File ? 'blob:novo' : 'blob:atual'));
    URL.revokeObjectURL = vi.fn();
    logo = resposta;
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
      if (String(url).endsWith('/api/v1/org/logo')) return (o.method === 'POST' ? logo.post : logo.get)();
      return json(CONFIG);
    });
    await window.renderConfigComercial($('content'), $('hdr'), $('act'));
    await espera();
  }
  const escolhe = (arquivo) => {
    const i = $('cfg-logo-arquivo');
    Object.defineProperty(i, 'files', { value: [arquivo], configurable: true });
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const posts = () => fetchMock.mock.calls.filter(([u, o = {}]) => String(u).endsWith('/api/v1/org/logo') && o.method === 'POST');
  const semLogo = { get: () => json({ error: 'Organização sem logo' }, 404), post: () => json({ ok: true }) };

  it('mostra o logo atual (fetch com o token, Blob URL) e as regras', async () => {
    await montaLogo('consultoria_admin', { get: () => new Response(PNG, { headers: { 'content-type': 'image/png' } }) });
    expect($('cfg-logo-img').getAttribute('src')).toBe('blob:atual');
    const get = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/v1/org/logo'));
    expect(get[1].headers.Authorization).toBe('Bearer tok-123');
    expect($('cfg-logo-regras').textContent).toMatch(/PNG ou JPEG, até 200 KB/);
  });

  it('sem logo: aviso', async () => {
    await montaLogo('consultoria_admin', semLogo);
    expect($('cfg-logo-sem').textContent).toMatch(/ainda não tem logo/);
    expect($('cfg-logo-img')).toBeNull();
  });

  it('comercial vê o logo e não tem envio', async () => {
    await montaLogo('comercial', semLogo);
    expect($('cfg-logo-atual')).toBeTruthy();
    expect($('cfg-logo-arquivo')).toBeNull();
  });

  it('SVG é recusado no cliente, sem pré-visualização nem envio', async () => {
    await montaLogo('consultoria_admin', semLogo);
    escolhe(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect($('cfg-logo-arquivo-erro').textContent).toMatch(/PNG ou JPEG/);
    expect($('cfg-logo-arquivo').getAttribute('aria-invalid')).toBe('true');
    expect($('cfg-logo-novo').hidden).toBe(true);
    expect(posts()).toHaveLength(0);
  });

  it('arquivo acima de 200 KB é recusado no cliente', async () => {
    await montaLogo('consultoria_admin', semLogo);
    escolhe(new File([new Uint8Array(200 * 1024 + 1)], 'grande.png', { type: 'image/png' }));
    expect($('cfg-logo-arquivo-erro').textContent).toMatch(/200 KB/);
    expect($('cfg-logo-novo').hidden).toBe(true);
  });

  it('PNG válido: pré-visualiza ANTES de enviar; enviar manda o arquivo com o Content-Type dele e o token', async () => {
    await montaLogo('consultoria_admin', semLogo);
    const f = new File([PNG], 'logo.png', { type: 'image/png' });
    escolhe(f);
    expect($('cfg-logo-arquivo-erro').textContent).toBe('');
    expect($('cfg-logo-novo').hidden).toBe(false);
    expect($('cfg-logo-previa').getAttribute('src')).toBe('blob:novo');
    expect(posts()).toHaveLength(0);
    $('cfg-logo-enviar').click();
    await espera();
    expect(posts()).toHaveLength(1);
    const [, o] = posts()[0];
    expect(o.body).toBe(f);
    expect(o.headers['Content-Type']).toBe('image/png');
    expect(o.headers.Authorization).toBe('Bearer tok-123');
    expect(window.showToast).toHaveBeenCalledWith('Logo atualizado');
  });

  it('JPEG vai como image/jpeg; a mensagem do servidor é a fonte de verdade no erro', async () => {
    await montaLogo('consultoria_admin', { ...semLogo, post: () => json({ error: 'Logo inválido: envie PNG ou JPEG de até 200 KB' }, 400) });
    escolhe(new File([new Uint8Array([0xff, 0xd8, 0xff])], 'logo.jpg', { type: 'image/jpeg' }));
    $('cfg-logo-enviar').click();
    await espera();
    expect(posts()[0][1].headers['Content-Type']).toBe('image/jpeg');
    expect($('cfg-logo-arquivo-erro').textContent).toBe('Logo inválido: envie PNG ou JPEG de até 200 KB');
    expect($('cfg-logo-enviar').disabled).toBe(false);
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
    expect(c.innerHTML).not.toMatch(/\sstyle\s*=/i);
    expect(c.querySelector('script')).toBeNull();
  });
});
