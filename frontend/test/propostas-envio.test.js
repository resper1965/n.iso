// Envio, link e aceite na tela de propostas (fatia 4). O que importa:
// (1) os botões aparecem conforme o estado; (2) os corpos seguem os schemas .strict()
// (propostaEnviarSchema, propostaAceiteManualSchema); (3) "Copiar link" só copia DEPOIS do
// POST /link e diz que o anterior deixou de valer; (4) o 502 do e-mail aparece no modal;
// (5) a ficha mostra pedido de ajuste, motivo da recusa e, aceita, o contrato e o projeto.
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
const botao = (nome) => document.querySelector(`[data-action="${nome}"]`);
const clica = async (nome) => { const el = botao(nome); expect(el, `botão ${nome}`).toBeTruthy(); el.click(); await espera(); };
const envia = async (id) => { $(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await espera(); };

const base = (o = {}) => ({
  id: 'p1', numero: 'NESS-2026-001', revisao: 1, status: 'gerada', cliente: 'Acme Ltda.', lead_id: 'l1',
  total_projeto: 100000, mensalidade: 0, memoria: null, margem: null, secoes_editadas: {}, itens: [],
  enviada_em: null, enviada_para: null, visualizada_em: null, ajuste_mensagem: null, recusa_motivo: null,
  aceite_nome: null, aceite_cargo: null, aceite_email: null, aceite_em: null, aceite_origem: null, aceite_comprovante: null,
  contrato_id: null, projeto_id: null, tem_link: false, ...o,
});

let fetchMock;
let ordem;
let atual;
function servidor(extra = {}) {
  ordem = [];
  const rotas = {
    'GET /api/v1/propostas': [{ id: 'p1', numero: 'NESS-2026-001', revisao: 1, status: atual.status, cliente: 'Acme Ltda.', total_projeto: 100000, mensalidade: 0 }],
    'GET /api/v1/propostas/p1': () => json(atual),
    'GET /api/v1/propostas/p1/documento': () => new Response('<html><body>Doc</body></html>', { headers: { 'content-type': 'text/html' } }),
    'POST /api/v1/propostas/p1/enviar': (o) => { atual = { ...atual, status: 'enviada', enviada_para: JSON.parse(o.body).email, enviada_em: '2026-10-02 15:00:00' }; return json(atual); },
    'POST /api/v1/propostas/p1/link': () => { atual = { ...atual, status: 'enviada' }; return json({ url: 'https://niso.ness.com.br/proposta#abc123' }); },
    'POST /api/v1/propostas/p1/revogar-link': json({ ok: true }),
    'POST /api/v1/propostas/p1/aceite-manual': (o) => {
      const b = JSON.parse(o.body);
      atual = { ...atual, status: 'aceita', aceite_nome: b.nome, aceite_cargo: b.cargo, aceite_email: b.email, aceite_comprovante: b.comprovante,
        aceite_origem: 'manual', aceite_em: '2026-10-02T18:00:00.000Z', contrato_id: 'ct1', projeto_id: 'pj1' };
      return json({ contratoId: 'ct1', projetoId: 'pj1' });
    },
    ...extra,
  };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
    const chave = `${o.method || 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`;
    ordem.push(chave);
    const r = rotas[chave];
    if (r === undefined) return json({ error: 'sem rota ' + chave }, 404);
    return typeof r === 'function' ? r(o) : json(r);
  });
}
const chamadas = (metodo, caminho) => fetchMock.mock.calls.filter(([u, o = {}]) => (o.method || 'GET') === metodo && String(u).endsWith(caminho));
const corpo = (metodo, caminho, i = 0) => JSON.parse(chamadas(metodo, caminho)[i][1].body);

async function ficha(o = {}, extra = {}) {
  atual = base(o);
  servidor(extra);
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="hdr"></h1><div id="act"></div><div id="content"></div>';
  initDelegation();
  S.user = { role: 'comercial', email: 'com@ness.lat' };
  S.token = 'tok-123';
  await window.renderPropostas($('content'), $('hdr'), $('act'));
  await espera();
  await window.__prpDocumento('p1');
  await espera();
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.showToast = vi.fn();
  window.navigate = vi.fn();
  S.propostaAbrir = null;
});

describe('botões por estado', () => {
  const TEM = (nomes) => nomes.map((n) => !!botao(n));
  const ACOES = ['__prpEnviar', '__prpCopiarLink', '__prpRevogarLink', '__prpAceiteManual'];
  it('gerada: enviar, copiar e aceite manual; sem revogar (ainda não há link)', async () => {
    await ficha({ status: 'gerada' });
    expect(TEM(ACOES)).toEqual([true, true, false, true]);
  });
  for (const status of ['enviada', 'visualizada']) {
    it(`${status} com link: as quatro ações`, async () => {
      await ficha({ status, tem_link: true });
      expect(TEM(ACOES)).toEqual([true, true, true, true]);
    });
  }
  it('enviada sem link (revogado): sem "Revogar link"', async () => {
    await ficha({ status: 'enviada', tem_link: false });
    expect(TEM(ACOES)).toEqual([true, true, false, true]);
  });
  it('expirada: enviar, aceite manual e nova revisão', async () => {
    await ficha({ status: 'expirada' });
    expect(TEM(['__prpEnviar', '__prpAceiteManual', '__prpRevisao'])).toEqual([true, true, true]);
    expect(document.querySelector('.prp-pilula').textContent).toBe('Expirada');
  });
  for (const status of ['aceita', 'recusada', 'substituida']) {
    it(`${status}: nenhuma ação de envio, pílula do estado`, async () => {
      await ficha({ status });
      expect(TEM(ACOES)).toEqual([false, false, false, false]);
      expect(document.querySelector('.prp-pilula').textContent).toBe({ aceita: 'Aceita', recusada: 'Recusada', substituida: 'Substituída' }[status]);
    });
  }
  it('na lista, "Enviar ao cliente" só nas enviáveis', async () => {
    atual = base({ status: 'visualizada' });
    servidor({ 'GET /api/v1/propostas': [
      { id: 'p1', numero: 'N-1', revisao: 1, status: 'visualizada', cliente: 'A', total_projeto: 1, mensalidade: 0 },
      { id: 'p2', numero: 'N-2', revisao: 1, status: 'aceita', cliente: 'B', total_projeto: 1, mensalidade: 0 },
      { id: 'p3', numero: null, revisao: 1, status: 'rascunho', cliente: 'C', total_projeto: 1, mensalidade: 0 },
    ] });
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="hdr"></h1><div id="act"></div><div id="content"></div>';
    initDelegation();
    await window.renderPropostas($('content'), $('hdr'), $('act'));
    await espera();
    const linhas = [...document.querySelectorAll('tbody tr')];
    expect(linhas.map((l) => !!l.querySelector('[data-action="__prpEnviar"]'))).toEqual([true, false, false]);
    expect(linhas[0].querySelector('.prp-pilula').textContent).toBe('Visualizada');
  });
});

describe('enviar ao cliente', () => {
  it('modal com e-mail e mensagem; envia o corpo do schema e atualiza a ficha', async () => {
    await ficha({ status: 'gerada' });
    await clica('__prpEnviar');
    expect($('modal-overlay').classList.contains('open')).toBe(true);
    expect(document.querySelector('label[for="prp-env-email"]')).toBeTruthy();
    $('prp-env-email').value = ' cliente@acme.com.br ';
    $('prp-env-mensagem').value = 'Segue a proposta.';
    await envia('prp-env-form');
    expect(corpo('POST', '/api/v1/propostas/p1/enviar')).toEqual({ email: 'cliente@acme.com.br', mensagem: 'Segue a proposta.' });
    expect($('modal-overlay').classList.contains('open')).toBe(false);
    expect(document.querySelector('.prp-pilula').textContent).toBe('Enviada');
    expect($('content').textContent).toContain('cliente@acme.com.br');
  });

  it('sem mensagem: só o e-mail; e-mail inválido não sai', async () => {
    await ficha({ status: 'enviada', enviada_para: 'antes@acme.com.br' });
    await clica('__prpEnviar');
    expect($('prp-env-email').value).toBe('antes@acme.com.br');
    $('prp-env-email').value = 'acme';
    await envia('prp-env-form');
    expect(chamadas('POST', '/api/v1/propostas/p1/enviar')).toHaveLength(0);
    expect($('prp-env-email-erro').textContent).toMatch(/e-mail/i);
    $('prp-env-email').value = 'outro@acme.com.br';
    await envia('prp-env-form');
    expect(corpo('POST', '/api/v1/propostas/p1/enviar')).toEqual({ email: 'outro@acme.com.br' });
  });

  it('502 do e-mail aparece no modal, que continua aberto', async () => {
    await ficha({ status: 'gerada' }, {
      'POST /api/v1/propostas/p1/enviar': () => json({ error: 'Não foi possível enviar o e-mail: nada foi alterado, tente de novo' }, 502),
    });
    await clica('__prpEnviar');
    $('prp-env-email').value = 'cliente@acme.com.br';
    await envia('prp-env-form');
    expect($('prp-env-erro').textContent).toContain('Não foi possível enviar o e-mail');
    expect($('prp-env-erro').getAttribute('role')).toBe('alert');
    expect($('modal-overlay').classList.contains('open')).toBe(true);
  });
});

describe('link', () => {
  it('"Copiar link" copia só depois do POST /link e avisa que o anterior deixou de valer', async () => {
    await ficha({ status: 'enviada' });
    const writeText = vi.fn(async () => { ordem.push('clipboard'); });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect($('content').textContent).not.toContain('abc123');
    await clica('__prpCopiarLink');
    expect(writeText).toHaveBeenCalledWith('https://niso.ness.com.br/proposta#abc123');
    expect(ordem.indexOf('clipboard')).toBeGreaterThan(ordem.indexOf('POST /api/v1/propostas/p1/link'));
    expect($('prp-link').textContent).toMatch(/anterior deixou de valer/);
    expect($('prp-link-url').value).toBe('https://niso.ness.com.br/proposta#abc123');
    // a URL não fica na tela depois: reabrir a ficha não a mostra
    await window.__prpDocumento('p1');
    await espera();
    expect($('content').innerHTML).not.toContain('abc123');
  });

  it('falha do POST /link: nada copiado, erro mostrado', async () => {
    await ficha({ status: 'gerada' }, { 'POST /api/v1/propostas/p1/link': () => json({ error: 'A proposta mudou de estado' }, 409) });
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await clica('__prpCopiarLink');
    expect(writeText).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('A proposta mudou de estado', 'error');
  });

  it('sem área de transferência: a URL fica no campo para copiar à mão', async () => {
    await ficha({ status: 'gerada' });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('negado'); }) }, configurable: true });
    await clica('__prpCopiarLink');
    expect($('prp-link-url').value).toBe('https://niso.ness.com.br/proposta#abc123');
    expect($('prp-link').textContent).toMatch(/copie/i);
  });

  it('"Revogar link" chama a rota', async () => {
    await ficha({ status: 'visualizada', tem_link: true });
    await clica('__prpRevogarLink');
    expect(chamadas('POST', '/api/v1/propostas/p1/revogar-link')).toHaveLength(1);
    expect(window.showToast).toHaveBeenCalledWith(expect.stringMatching(/revogado/i));
  });
});

describe('aceite manual', () => {
  it('modal envia o corpo do schema e a ficha mostra contrato e projeto', async () => {
    await ficha({ status: 'visualizada' });
    await clica('__prpAceiteManual');
    for (const c of ['nome', 'cargo', 'email', 'comprovante']) expect(document.querySelector(`label[for="prp-ac-${c}"]`), c).toBeTruthy();
    $('prp-ac-nome').value = 'Maria Souza';
    $('prp-ac-cargo').value = 'Diretora';
    $('prp-ac-email').value = 'maria@acme.com.br';
    $('prp-ac-comprovante').value = 'Contrato assinado em 02/10, arquivo contrato-acme.pdf';
    await envia('prp-ac-form');
    expect(corpo('POST', '/api/v1/propostas/p1/aceite-manual')).toEqual({
      nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@acme.com.br', comprovante: 'Contrato assinado em 02/10, arquivo contrato-acme.pdf',
    });
    expect($('modal-overlay').classList.contains('open')).toBe(false);
    const texto = $('content').textContent;
    expect(texto).toContain('Maria Souza');
    expect(texto).toContain('ct1');
    expect(texto).toContain('pj1');
    expect(texto).toContain('contrato-acme.pdf');
    await clica('__prpAbrirProjeto');
    expect(window.navigate).toHaveBeenCalledWith('project-detail', { currentProject: { id: 'pj1' } });
  });

  it('campo curto não sai; erro do servidor aparece no modal', async () => {
    await ficha({ status: 'gerada' }, { 'POST /api/v1/propostas/p1/aceite-manual': () => json({ error: 'A proposta já foi aceita' }, 409) });
    await clica('__prpAceiteManual');
    $('prp-ac-nome').value = 'M';
    await envia('prp-ac-form');
    expect(chamadas('POST', '/api/v1/propostas/p1/aceite-manual')).toHaveLength(0);
    expect($('prp-ac-nome-erro').textContent).not.toBe('');
    $('prp-ac-nome').value = 'Maria Souza';
    $('prp-ac-cargo').value = 'Diretora';
    $('prp-ac-email').value = 'maria@acme.com.br';
    $('prp-ac-comprovante').value = 'Contrato assinado';
    await envia('prp-ac-form');
    expect($('prp-ac-erro').textContent).toContain('A proposta já foi aceita');
  });
});

describe('o que o cliente respondeu', () => {
  it('pedido de ajuste aparece na ficha, escapado', async () => {
    await ficha({ status: 'visualizada', visualizada_em: '2026-10-02 13:00:00', ajuste_mensagem: '[02/10/2026 10:00] Incluir a filial <b>Recife</b>' });
    const aviso = document.querySelector('.prp-ajuste');
    expect(aviso.textContent).toContain('Incluir a filial <b>Recife</b>');
    expect(aviso.querySelector('b')).toBeNull();
    expect($('content').textContent).toContain('02/10/2026');
  });

  it('recusada mostra o motivo', async () => {
    await ficha({ status: 'recusada', recusa_motivo: 'Preço acima do orçamento' });
    expect(document.querySelector('.prp-recusa').textContent).toContain('Preço acima do orçamento');
  });

  it('aceita só com recorrente: contrato sem projeto', async () => {
    await ficha({ status: 'aceita', aceite_nome: 'Maria', aceite_cargo: 'CEO', aceite_email: 'm@a.com', aceite_origem: 'link', aceite_em: '2026-10-02T18:00:00Z', contrato_id: 'ct9', projeto_id: null });
    expect($('content').textContent).toContain('ct9');
    expect($('content').textContent).toMatch(/sem projeto/i);
    expect(botao('__prpAbrirProjeto')).toBeNull();
  });

  it('notificação de proposta abre a ficha dela', async () => {
    atual = base({ status: 'visualizada' });
    servidor();
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="hdr"></h1><div id="act"></div><div id="content"></div>';
    initDelegation();
    S.propostaAbrir = 'p1';
    await window.renderPropostas($('content'), $('hdr'), $('act'));
    await espera();
    expect(S.propostaAbrir).toBeNull();
    expect(chamadas('GET', '/api/v1/propostas/p1')).toHaveLength(1);
    expect(botao('__prpEnviar')).toBeTruthy();
  });

  it('nada inline na ficha nem nos modais', async () => {
    await ficha({ status: 'visualizada', ajuste_mensagem: 'x' });
    await clica('__prpEnviar');
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    await clica('__prpAceiteManual');
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    expect(document.querySelector('script')).toBeNull();
  });
});
