// Tela de organizações (src/views/organizacoes.js) e seletor de organização do platform_admin.
// O que importa: (1) a lista mostra uso de quanto, situação e termo, e a ness. não tem Suspender;
// (2) criar envia exatamente o corpo do criarOrgSchema e NUNCA mostra senha; (3) suspender/reativar
// com confirmação na tela; (4) transferência: motivo curto barra sem chamar o servidor, a
// confirmação diz o que acontece, 409/404 aparecem; (5) X-Org-Id só sai do platform_admin que
// escolheu outra organização, e de nenhum outro papel (todas as chamadas varridas).
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/api.js';
import '../src/views/organizacoes.js';
import '../src/views/config-comercial.js';
import '../src/views/catalogo.js';
import { initDelegation } from '../src/delegation.js';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 30));
const $ = (id) => document.getElementById(id);
const digita = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
const troca = (id, valor) => { $(id).value = valor; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
const envia = (id) => $(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const clica = async (nome, args) => {
  const el = document.querySelector(`[data-action="${nome}"]` + (args ? `[data-args='${JSON.stringify(args)}']` : ''));
  expect(el, `botão ${nome}`).toBeTruthy();
  el.click();
  await espera();
};

const ORGS = [
  { id: 'org_ness', nome: 'ness.', slug: 'ness', plano: 'interno', status: 'Active', maxProjetos: 1000, maxUsuarios: 1000,
    termoAceitoEm: null, termoVersao: null, projetos: 12, usuarios: 8, propostas: {} },
  { id: 'org_alfa', nome: 'Alfa Consultoria', slug: 'alfa', plano: 'consultoria', status: 'Active', maxProjetos: 10, maxUsuarios: 5,
    termoAceitoEm: '2026-10-02 12:00:00', termoVersao: 'v1-2026', projetos: 3, usuarios: 2, propostas: {} },
  { id: 'org_beta', nome: 'Beta <b>Seg</b>', slug: 'beta', plano: 'consultoria', status: 'Suspended', maxProjetos: 4, maxUsuarios: 3,
    termoAceitoEm: '2026-09-30 09:00:00', termoVersao: 'v1-2026', projetos: 1, usuarios: 1, propostas: {} },
];
const PROJETOS = [
  { id: 'p1', client_name: 'Cliente Um', org_id: 'org_alfa' },
  { id: 'p2', project_name: 'Projeto Dois', org_id: 'org_ness' },
];
const CONFIG = {
  id: 'org_ness', nome: 'ness.', cnpj: null, corDestaque: '#00ade8', seloNiso: true, prefixoProposta: 'NESS', proximoNumero: 1,
  preco: { diaria: { '1': 1, '2': 2, '3': 3 }, porte: [{ maxPessoas: null, fator: 1 }], tetoDesconto: 15,
    custoInterno: { '1': 1, '2': 1, '3': 1 }, overheadPct: 0.2, tributosPct: 0.1, margemAlvo: 0.4 },
  textos: {}, secoesDesligadas: [],
};

let fetchMock;
let rotas;
function servidor(extra = {}) {
  rotas = {
    'GET /api/v1/platform/orgs': () => json(ORGS),
    'GET /api/v1/projects': () => json(PROJETOS),
    'GET /api/v1/org/config': () => json(CONFIG),
    'GET /api/v1/org/logo': () => json({ error: 'Organização sem logo' }, 404),
    'GET /api/v1/servicos': () => json([]),
    ...extra,
  };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
    const chave = `${o.method || 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`;
    const r = rotas[chave];
    if (!r) return json({ error: 'rota não simulada: ' + chave }, 500);
    return r(o);
  });
}
const chamadas = (metodo, caminho) => fetchMock.mock.calls.filter(([u, o = {}]) => (o.method || 'GET') === metodo && String(u).endsWith(caminho));
const corpo = (metodo, caminho) => JSON.parse(chamadas(metodo, caminho).at(-1)[1].body);
const xorg = (o) => (o?.headers || {})['X-Org-Id'];

const SHELL = `<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>
  <div id="org-seletor" hidden></div><div id="org-faixa" hidden></div>
  <h1 id="hdr"></h1><div id="act"></div><div id="content"></div>`;

async function monta(papel = 'platform_admin') {
  document.body.innerHTML = SHELL;
  initDelegation();
  S.user = { role: papel, email: 'adm@ness.lat' };
  S.token = 'tok-123';
  S.view = 'organizacoes';
  await window.renderOrganizacoes($('content'), $('hdr'), $('act'));
  await espera();
  return $('content');
}
const linha = (id) => document.querySelector(`tr[data-org="${id}"]`);
const semInline = (html) => {
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/\sstyle\s*=/i);
};

beforeEach(() => {
  vi.restoreAllMocks();
  window.showToast = vi.fn();
  window.render = vi.fn();
  S.orgAtuacao = null;
  try { sessionStorage.clear(); } catch { /* noop */ }
  servidor();
});

describe('lista', () => {
  it('mostra uso de quanto, plano, situação e termo; texto do servidor escapado', async () => {
    const c = await monta();
    expect(c.querySelectorAll('tbody tr')).toHaveLength(3);
    const alfa = linha('org_alfa').textContent;
    expect(alfa).toContain('Alfa Consultoria');
    expect(alfa).toContain('alfa');
    expect(alfa).toContain('consultoria');
    expect(alfa).toContain('3 de 10');
    expect(alfa).toContain('2 de 5');
    expect(alfa).toContain('Ativa');
    expect(alfa).toContain('v1-2026');
    expect(alfa).toContain('02/10/2026');
    expect(linha('org_beta').textContent).toContain('Suspensa');
    expect(c.querySelector('b')).toBeNull();
    expect(linha('org_beta').textContent).toContain('Beta <b>Seg</b>');
  });

  it('a ness. não tem botão de suspender; as outras têm Suspender ou Reativar', async () => {
    await monta();
    expect(linha('org_ness').querySelector('[data-action="__orgSuspender"], [data-action="__orgReativar"]')).toBeNull();
    expect(linha('org_ness').querySelector('[data-action="__orgEditar"]')).toBeTruthy();
    expect(linha('org_alfa').querySelector('[data-action="__orgSuspender"]')).toBeTruthy();
    expect(linha('org_beta').querySelector('[data-action="__orgReativar"]')).toBeTruthy();
  });

  it.each(['consultoria_admin', 'comercial', 'consultor', 'org_admin'])('%s: tela restrita, sem chamar o servidor', async (papel) => {
    const c = await monta(papel);
    expect(c.textContent).toMatch(/restrito ao administrador da plataforma/i);
    expect(c.querySelector('table')).toBeNull();
    expect($('act').innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('suspender e reativar', () => {
  it('pede confirmação na linha, só então envia {status: Suspended}; cancelar não envia', async () => {
    rotas['PUT /api/v1/platform/orgs/org_alfa'] = () => json({ ok: true });
    await monta();
    await clica('__orgSuspender', ['org_alfa']);
    expect(linha('org_alfa').textContent).toMatch(/Suspender Alfa Consultoria\?/);
    expect(chamadas('PUT', '/api/v1/platform/orgs/org_alfa')).toHaveLength(0);
    await clica('__orgCancelarStatus');
    expect(chamadas('PUT', '/api/v1/platform/orgs/org_alfa')).toHaveLength(0);
    await clica('__orgSuspender', ['org_alfa']);
    await clica('__orgConfirmarStatus');
    expect(corpo('PUT', '/api/v1/platform/orgs/org_alfa')).toEqual({ status: 'Suspended' });
  });

  it('reativar envia {status: Active}', async () => {
    rotas['PUT /api/v1/platform/orgs/org_beta'] = () => json({ ok: true });
    await monta();
    await clica('__orgReativar', ['org_beta']);
    expect(linha('org_beta').textContent).toMatch(/Reativar/);
    await clica('__orgConfirmarStatus');
    expect(corpo('PUT', '/api/v1/platform/orgs/org_beta')).toEqual({ status: 'Active' });
  });

  it('suspender a ness. pela ação direta não abre confirmação', async () => {
    await monta();
    window.__orgSuspender('org_ness');
    expect(document.querySelector('[data-action="__orgConfirmarStatus"]')).toBeNull();
  });
});

describe('nova organização', () => {
  const preenche = (cnpj = '') => {
    digita('org-n-nome', 'Gama Consultoria');
    digita('org-n-slug', 'gama');
    digita('org-n-prefixoProposta', 'GAMA');
    digita('org-n-cnpj', cnpj);
    digita('org-n-adminNome', 'Ana Gama');
    digita('org-n-adminEmail', 'ana@gama.test');
    digita('org-n-maxProjetos', '8');
    digita('org-n-maxUsuarios', '4');
    digita('org-n-termoVersao', 'v1-2026');
  };

  it('envia o corpo exato do criarOrgSchema, sem CNPJ vazio, e mostra "Convite enviado" sem senha', async () => {
    rotas['POST /api/v1/platform/orgs'] = () =>
      json({ id: 'org_gama', slug: 'gama', adminId: 'u9', adminEmail: 'ana@gama.test', emailEnviado: true, senha: 'SENHA-SECRETA-123' }, 201);
    await monta();
    await clica('__orgNova');
    preenche();
    envia('org-n-form');
    await espera();
    expect(corpo('POST', '/api/v1/platform/orgs')).toEqual({
      nome: 'Gama Consultoria', slug: 'gama', prefixoProposta: 'GAMA', adminEmail: 'ana@gama.test', adminNome: 'Ana Gama',
      maxProjetos: 8, maxUsuarios: 4, termoVersao: 'v1-2026',
    });
    const modal = $('modal-content').textContent;
    expect(modal).toContain('Convite enviado para ana@gama.test');
    expect(modal).not.toContain('SENHA-SECRETA-123');
    expect(document.body.innerHTML).not.toContain('SENHA-SECRETA-123');
    expect(document.querySelector('#modal-content input[type="password"]')).toBeNull();
  });

  it('CNPJ preenchido vai no corpo; emailEnviado false mostra o caminho "Esqueci a senha"', async () => {
    rotas['POST /api/v1/platform/orgs'] = () =>
      json({ id: 'org_gama', slug: 'gama', adminId: 'u9', adminEmail: 'ana@gama.test', emailEnviado: false }, 201);
    await monta();
    await clica('__orgNova');
    preenche('12345678000199');
    envia('org-n-form');
    await espera();
    expect(corpo('POST', '/api/v1/platform/orgs').cnpj).toBe('12345678000199');
    const aviso = document.querySelector('#modal-content .org-aviso');
    expect(aviso.getAttribute('role')).toBe('alert');
    expect(aviso.textContent).toMatch(/NÃO foi enviado/);
    expect(aviso.textContent).toContain('Esqueci a senha');
    expect(aviso.textContent).toContain('ana@gama.test');
  });

  it('400 do servidor aparece junto de cada campo; 409 no aviso geral', async () => {
    rotas['POST /api/v1/platform/orgs'] = () => json({ error: 'Payload invalido', details: [
      { path: 'slug', message: 'Slug com 3 a 40 letras minúsculas, números ou hífen' },
      { path: 'adminEmail', message: 'E-mail inválido' }] }, 400);
    await monta();
    await clica('__orgNova');
    preenche();
    envia('org-n-form');
    await espera();
    expect($('org-n-slug-erro').textContent).toMatch(/Slug com 3 a 40/);
    expect($('org-n-slug').getAttribute('aria-invalid')).toBe('true');
    expect($('org-n-adminEmail-erro').textContent).toBe('E-mail inválido');
    expect($('org-n-criar').disabled).toBe(false);

    rotas['POST /api/v1/platform/orgs'] = () => json({ error: 'Prefixo de proposta já usado por outra organização' }, 409);
    envia('org-n-form');
    await espera();
    expect($('org-n-slug-erro').textContent).toBe('');
    expect($('org-n-erro').textContent).toBe('Prefixo de proposta já usado por outra organização');
  });

  it('todo campo tem rótulo', async () => {
    await monta();
    await clica('__orgNova');
    const m = $('modal-content');
    const sem = [...m.querySelectorAll('input, select, textarea')].filter((x) => !m.querySelector(`label[for="${x.id}"]`));
    expect(sem.map((x) => x.id)).toEqual([]);
  });
});

describe('editar', () => {
  it('envia nome e limites; erro do servidor no campo', async () => {
    rotas['PUT /api/v1/platform/orgs/org_alfa'] = () => json({ error: 'Payload invalido', details: [{ path: 'maxProjetos', message: 'Número muito grande' }] }, 400);
    await monta();
    await clica('__orgEditar', ['org_alfa']);
    expect($('org-e-nome').value).toBe('Alfa Consultoria');
    digita('org-e-maxProjetos', '20000');
    envia('org-e-form');
    await espera();
    expect(corpo('PUT', '/api/v1/platform/orgs/org_alfa')).toEqual({ nome: 'Alfa Consultoria', maxProjetos: 20000, maxUsuarios: 5 });
    expect($('org-e-maxProjetos-erro').textContent).toBe('Número muito grande');
  });
});

describe('transferir projeto', () => {
  async function abre() {
    await monta();
    await clica('__orgTransferir');
    troca('org-t-origem', 'org_alfa');
    await espera();
  }

  it('o projeto vem da origem; o destino exclui a origem e as suspensas', async () => {
    await abre();
    const projetos = [...$('org-t-projeto').options].map((o) => o.value).filter(Boolean);
    expect(projetos).toEqual(['p1']);
    const destinos = [...$('org-t-destino').options].map((o) => o.value).filter(Boolean);
    expect(destinos).toEqual(['org_ness']);
  });

  it('motivo curto (ou faltando projeto/destino) bloqueia sem chamar o servidor', async () => {
    await abre();
    const antes = fetchMock.mock.calls.length;
    envia('org-t-form');
    await espera();
    expect($('org-t-projeto-erro').textContent).toBeTruthy();
    expect($('org-t-destino-erro').textContent).toBeTruthy();
    troca('org-t-projeto', 'p1');
    troca('org-t-destino', 'org_ness');
    $('org-t-motivo').value = '  abc  ';
    envia('org-t-form');
    await espera();
    expect($('org-t-motivo-erro').textContent).toMatch(/5 a 500/);
    expect($('org-t-motivo').getAttribute('aria-invalid')).toBe('true');
    expect($('org-t-confirma')).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(antes);
    expect(chamadas('POST', '/transferir')).toHaveLength(0);
  });

  async function confirma() {
    await abre();
    troca('org-t-projeto', 'p1');
    troca('org-t-destino', 'org_ness');
    $('org-t-motivo').value = 'Cliente contratou a ness.';
    envia('org-t-form');
    await espera();
  }

  it('a confirmação diz o que acontece; confirmar envia {orgDestinoId, motivo}', async () => {
    rotas['POST /api/v1/platform/projects/p1/transferir'] = () => json({ ok: true });
    await confirma();
    const t = $('org-t-confirma').textContent;
    expect(t).toContain('Cliente Um');
    expect(t).toContain('O projeto passa para ness.');
    expect(t).toContain('Os consultores de Alfa Consultoria perdem o acesso');
    expect(t).toContain('Os agentes conectados ao projeto são desconectados');
    expect(t).toContain('Chaves de API, webhooks, SSO e SCIM do projeto são desativados');
    expect(t).toContain('precisa reconfigurá-los');
    expect(t).toContain('Propostas e contratos continuam com Alfa Consultoria');
    expect(chamadas('POST', '/transferir')).toHaveLength(0);
    await clica('__orgTConfirmar');
    expect(corpo('POST', '/api/v1/platform/projects/p1/transferir')).toEqual({ orgDestinoId: 'org_ness', motivo: 'Cliente contratou a ness.' });
    expect(window.showToast).toHaveBeenCalledWith('Projeto transferido');
  });

  it.each([
    [409, 'A organização de destino não está ativa'],
    [404, 'Projeto ou organização de destino não encontrado'],
  ])('%s do servidor aparece na confirmação', async (status, msg) => {
    rotas['POST /api/v1/platform/projects/p1/transferir'] = () => json({ error: msg }, status);
    await confirma();
    await clica('__orgTConfirmar');
    expect($('org-t-erro').textContent).toBe(msg);
    expect($('org-t-confirmar').disabled).toBe(false);
  });

  it('Voltar mantém o que foi escolhido', async () => {
    await confirma();
    await clica('__orgTVoltar');
    expect($('org-t-projeto').value).toBe('p1');
    expect($('org-t-destino').value).toBe('org_ness');
    expect($('org-t-motivo').value).toBe('Cliente contratou a ness.');
  });
});

describe('seletor de organização e X-Org-Id', () => {
  async function seletor(papel) {
    document.body.innerHTML = SHELL;
    initDelegation();
    S.user = { role: papel, email: 'x@ness.lat' };
    S.token = 'tok-123';
    window.atualizarSeletorOrg();
    await espera();
  }
  const telas = async () => {
    await window.renderConfigComercial($('content'), $('hdr'), $('act'));
    await window.renderCatalogo($('content'), $('hdr'), $('act'));
    await espera();
  };

  it('platform_admin na ness.: seletor sem faixa e nenhum X-Org-Id', async () => {
    await seletor('platform_admin');
    expect($('org-seletor').hidden).toBe(false);
    expect([...$('org-sel').options].map((o) => o.value)).toEqual(['org_ness', 'org_alfa', 'org_beta']);
    expect($('org-sel').value).toBe('org_ness');
    expect($('org-faixa').hidden).toBe(true);
    await telas();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    expect(fetchMock.mock.calls.filter(([, o]) => xorg(o))).toEqual([]);
  });

  it('escolher outra organização: faixa persistente, sessionStorage, telas recarregam e TODA chamada leva X-Org-Id', async () => {
    await seletor('platform_admin');
    troca('org-sel', 'org_alfa');
    await espera();
    expect(window.render).toHaveBeenCalled();
    expect($('org-faixa').hidden).toBe(false);
    expect($('org-faixa').textContent).toContain('Atuando em Alfa Consultoria');
    expect(sessionStorage.getItem('niso_orgAtuacao')).toBe('org_alfa');
    fetchMock.mockClear();
    await telas();
    // o logo (fetch binário) também
    expect(chamadas('GET', '/api/v1/org/logo')).toHaveLength(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    expect(fetchMock.mock.calls.filter(([, o]) => xorg(o) !== 'org_alfa')).toEqual([]);
    // a faixa sobrevive a um novo desenho do cabeçalho
    window.atualizarSeletorOrg();
    expect($('org-faixa').textContent).toContain('Atuando em Alfa Consultoria');

    await clica('__orgVoltar');
    expect($('org-faixa').hidden).toBe(true);
    expect(sessionStorage.getItem('niso_orgAtuacao')).toBeNull();
    fetchMock.mockClear();
    await telas();
    expect(fetchMock.mock.calls.filter(([, o]) => xorg(o))).toEqual([]);
  });

  it.each(['consultoria_admin', 'comercial', 'consultor', 'org_admin', 'client'])(
    '%s: mesmo com organização em memória, NENHUMA chamada leva X-Org-Id', async (papel) => {
      document.body.innerHTML = SHELL;
      initDelegation();
      S.user = { role: papel, email: 'x@alfa.test' };
      S.token = 'tok-123';
      S.orgAtuacao = 'org_alfa';            // resto de uma sessão de platform_admin, por exemplo
      await telas();
      await window.renderOrganizacoes($('content'), $('hdr'), $('act'));
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      expect(fetchMock.mock.calls.filter(([, o]) => xorg(o))).toEqual([]);
    });

  it.each(['consultoria_admin', 'comercial', 'consultor', 'org_admin', 'client'])(
    '%s: o seletor não existe e a organização guardada é descartada', async (papel) => {
      sessionStorage.setItem('niso_orgAtuacao', 'org_alfa');
      S.orgAtuacao = 'org_alfa';
      await seletor(papel);
      expect($('org-seletor').hidden).toBe(true);
      expect($('org-seletor').innerHTML).toBe('');
      expect($('org-faixa').hidden).toBe(true);
      expect(S.orgAtuacao).toBeNull();
      expect(sessionStorage.getItem('niso_orgAtuacao')).toBeNull();
      expect(chamadas('GET', '/api/v1/platform/orgs')).toHaveLength(0);
    });

  it('organização guardada que não existe mais volta à ness.', async () => {
    S.orgAtuacao = 'org_sumiu';
    await seletor('platform_admin');
    expect(S.orgAtuacao).toBeNull();
    expect($('org-faixa').hidden).toBe(true);
  });
});

describe('nada inline', () => {
  it('lista, modais de criação, edição e transferência, confirmação e cabeçalho', async () => {
    await monta();
    semInline($('content').innerHTML + $('act').innerHTML);
    await clica('__orgNova');
    semInline($('modal-content').innerHTML);
    await clica('__orgEditar', ['org_alfa']);
    semInline($('modal-content').innerHTML);
    await clica('__orgTransferir');
    troca('org-t-origem', 'org_alfa');
    semInline($('modal-content').innerHTML);
    troca('org-t-projeto', 'p1');
    troca('org-t-destino', 'org_ness');
    $('org-t-motivo').value = 'Motivo válido';
    envia('org-t-form');
    await espera();
    semInline($('modal-content').innerHTML);
    window.__orgEscolher('org_alfa');
    await espera();
    semInline($('org-seletor').innerHTML + $('org-faixa').innerHTML);
  });
});
