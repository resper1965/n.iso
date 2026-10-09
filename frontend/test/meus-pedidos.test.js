// Fatia 2 do acesso de stakeholders: "Meus pedidos" lista o que foi atribuído, mostra o conteúdo
// congelado (escapado) e o hash, e decide com senha. Senha errada (401) não pode derrubar a sessão.
// A consultoria pede a aprovação a partir da matriz de Governança.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import '../src/ui.js';
import '../src/api.js';
import '../src/views/meus-pedidos.js';
import { initDelegation } from '../src/delegation.js';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 50));
const el = (id) => document.getElementById(id);

const PEDIDO = {
  id: 'pd1', tipo: 'dpia', titulo: 'DPIA: Folha <b>x</b>', papel_exigido: 'ciso', status: 'aberto',
  hash: 'a'.repeat(64), criado_por: 'cons@ness.lat', criado_em: '2026-10-04T10:00:00Z',
  conteudo: { processing_name: 'Folha de pagamento', technical_measures: '<img src=x onerror=alert(1)>', dpo_opinion: null },
};

let fetchMock;
beforeEach(() => {
  document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  initDelegation();
  window.showToast = vi.fn();
  window.doLogout = vi.fn();
  window.render = vi.fn();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('lista de Meus pedidos', () => {
  it('mostra os pedidos atribuídos, escapados, sem handler inline', async () => {
    fetchMock.mockResolvedValueOnce(json({ pedidos: [{ ...PEDIDO, meu_status: 'pendente' }] }));
    await window.renderMeusPedidos(el('c'), el('h'), el('a'));
    expect(el('h').textContent).toBe('Meus pedidos');
    const html = el('c').innerHTML;
    expect(html).toContain('Aguardando você');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(el('c').querySelector('[data-action="abrirPedido"]')).toBeTruthy();
  });

  it('sem pedidos: estado vazio', async () => {
    fetchMock.mockResolvedValueOnce(json({ pedidos: [] }));
    await window.renderMeusPedidos(el('c'), el('h'), el('a'));
    expect(el('c').textContent).toMatch(/Nenhum pedido/);
  });
});

describe('abrir e decidir', () => {
  const abrir = async (p = PEDIDO, d = { status: 'pendente' }) => {
    fetchMock.mockResolvedValueOnce(json({ pedido: p, destinatario: d }));
    await window.abrirPedido('pd1');
  };

  it('mostra o conteúdo congelado escapado e o hash; o formulário pede a senha', async () => {
    await abrir();
    const html = el('modal-content').innerHTML;
    expect(html).toContain('Folha de pagamento');
    expect(html).toContain('&lt;img');
    // o texto "onerror=" aparece escapado; nenhum ELEMENTO pode ter atributo on*
    expect(document.querySelector('#modal-content img')).toBeNull();
    const comHandler = [...document.querySelectorAll('#modal-content *')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name)));
    expect(comHandler).toEqual([]);
    expect(html).toContain('a'.repeat(64));
    expect(el('pd-form').getAttribute('data-action-submit')).toBe('aprovarPedido');
    expect(document.querySelector('label[for="pd-senha"]')).toBeTruthy();
  });

  it('pedido de documento: mostra título, versão e texto congelados, escapados', async () => {
    await abrir({
      id: 'pd2', tipo: 'documento', titulo: 'Documento: Política de Acesso', papel_exigido: 'ciente', status: 'aberto',
      hash: 'b'.repeat(64), criado_por: 'cons@ness.lat', criado_em: '2026-10-09T10:00:00Z',
      conteudo: { titulo: 'Política <b>de</b> Acesso', numero: 3, texto: '<img src=x onerror=alert(1)>' },
    });
    const html = el('modal-content').innerHTML;
    expect(html).toContain('Versão');
    expect(html).toContain('&lt;img');
    expect(document.querySelector('#modal-content img')).toBeNull();
    expect(document.querySelector('#modal-content b')).toBeNull();
    expect(el('modal-content').textContent).toContain('Política <b>de</b> Acesso');
    expect(el('modal-content').textContent).toContain('3');
  });

  it('aprovar manda a senha; senha errada (401) mostra o erro e não desloga', async () => {
    await abrir();
    el('pd-senha').value = 'errada';
    fetchMock.mockResolvedValueOnce(json({ error: 'Senha incorreta' }, 401));
    el('pd-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await espera();
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(url).toMatch(/\/api\/v1\/pedidos\/pd1\/aprovar$/);
    expect(JSON.parse(init.body)).toEqual({ senha: 'errada' });
    expect(el('pd-erro').textContent).toBe('Senha incorreta');
    expect(window.doLogout).not.toHaveBeenCalled();
  });

  it('recusar exige motivo e o envia', async () => {
    await abrir();
    el('pd-senha').value = 'certa';
    window.recusarPedido('pd1');
    await espera();
    expect(fetchMock).toHaveBeenCalledTimes(1); // só o GET: faltou motivo
    expect(el('pd-erro').textContent).toMatch(/motivo/);
    el('pd-motivo').value = 'Falta o fluxo';
    fetchMock.mockResolvedValueOnce(json({ ok: true, status: 'recusado' }));
    window.recusarPedido('pd1');
    await espera();
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(url).toMatch(/\/pd1\/recusar$/);
    expect(JSON.parse(init.body)).toEqual({ senha: 'certa', motivo: 'Falta o fluxo' });
  });

  it('pedido substituído: avisa e não oferece decisão', async () => {
    await abrir({ ...PEDIDO, status: 'substituido' }, { status: 'pendente' });
    expect(el('modal-content').textContent).toMatch(/documento mudou/);
    expect(el('pd-form')).toBeNull();
  });
});

describe('pedir aprovação (consultoria)', () => {
  it('lista quem tem e-mail na matriz (sem consultor) e envia o pedido com os escolhidos', async () => {
    fetchMock.mockResolvedValueOnce(json([
      { name: 'Dora', email: 'dpo@cliente.com', job_title: 'DPO', role_category: 'executivo' },
      { name: 'Cons', email: 'cons@ness.lat', job_title: 'Consultor', role_category: 'consultor' },
      { name: 'Sem', email: null, job_title: 'CTO', role_category: 'executivo' },
    ]));
    await window.abrirPedidoAprovacao('p1', 'dpia', 'd1');
    const caixas = document.querySelectorAll('input[name="pn-dest"]');
    expect([...caixas].map((c) => c.value)).toEqual(['dpo@cliente.com']);
    caixas[0].checked = true;
    el('pn-papel').value = 'ceo';
    fetchMock.mockResolvedValueOnce(json({ ok: true, id: 'pd9', hash: 'h' }, 201));
    el('pn-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await espera();
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(url).toMatch(/\/api\/v1\/projects\/p1\/pedidos$/);
    expect(JSON.parse(init.body)).toEqual({ tipo: 'dpia', ref_id: 'd1', papel_exigido: 'ceo', destinatarios: [{ email: 'dpo@cliente.com', nome: 'Dora' }] });
    expect(window.podePedirAprovacao({ role: 'stakeholder' })).toBe(false);
    expect(window.podePedirAprovacao({ role: 'consultor' })).toBe(true);
  });
});

describe('ciência por link (consultoria, fatia 3)', () => {
  it('nova ciência: escolhe o documento vigente, separa os e-mails da lista e envia o lote', async () => {
    // GET .../documentos (src/routes/documentos.ts): lista pura; só entra quem tem versão vigente
    fetchMock.mockResolvedValueOnce(json([
      { id: 'd1', tipo: 'politica', titulo: 'Política de <b>Segurança</b>', status: 'vigente', versao_vigente: 2, tem_rascunho: false },
      { id: 'd2', tipo: 'politica', titulo: 'Só rascunho', status: 'rascunho', versao_vigente: null, tem_rascunho: true },
    ]));
    await window.abrirCienciaLink('p1');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/projects\/p1\/documentos$/);
    expect([...el('cl-doc').options].map((o) => o.value)).toEqual(['d1']);
    expect(el('cl-doc').options[0].textContent).toBe('Política de <b>Segurança</b> (versão 2)');
    expect(el('cl-doc').querySelector('b')).toBeNull(); // título é texto, não HTML
    el('cl-emails').value = 'ana@cliente.com; bia@cliente.com\nana@cliente.com, invalido';
    fetchMock.mockResolvedValueOnce(json({ id: 'pd7', hash: 'h', enviados: 2, falhas: [] }, 201));
    el('cl-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await espera();
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(url).toMatch(/\/api\/v1\/projects\/p1\/pedidos\/ciencia$/);
    expect(JSON.parse(init.body)).toEqual({ tipo: 'documento', ref_id: 'd1', destinatarios: [{ email: 'ana@cliente.com' }, { email: 'bia@cliente.com' }] });
  });

  it('acompanhamento: situação por pessoa escapada, versão anterior, e reenviar aos pendentes', async () => {
    fetchMock.mockResolvedValueOnce(json({
      pedido: { id: 'pd7', titulo: 'Política: <b>x</b>', status: 'aberto', papel_exigido: 'ciente', hash: 'h'.repeat(64) },
      destinatarios: [
        { email: 'ana@cliente.com', situacao: 'ciente', decidido_em: '2026-10-04T10:00:00Z', canal: 'link', versao_anterior: null, portal_antigo: null },
        { email: '<img src=x onerror=alert(1)>@c.com', situacao: 'nao_abriu', versao_anterior: { decidido_em: '2026-09-01T10:00:00Z', hash_lido: 'v'.repeat(64) }, portal_antigo: null },
        { email: 'olga@cliente.com', situacao: 'pendente', versao_anterior: null, portal_antigo: { acknowledged_at: '2026-01-01 10:00:00', hash: null } },
      ],
    }));
    await window.abrirAcompanhamento('p1', 'pd7');
    const txt = el('modal-content').textContent;
    expect(txt).toMatch(/Ciente/);
    expect(txt).toMatch(/Não abriu/);
    expect(txt).toMatch(/versão anterior/i);
    expect(txt).toMatch(/versão não registrada/i);
    expect(document.querySelector('#modal-content img')).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ enviados: 2, falhas: [] }));
    fetchMock.mockResolvedValueOnce(json({ pedido: { id: 'pd7', titulo: 't', status: 'aberto', papel_exigido: 'ciente', hash: 'h' }, destinatarios: [] }));
    document.querySelector('[data-action="reenviarCiencia"]').click();
    await espera();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/projects\/p1\/pedidos\/pd7\/reenviar$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({});
  });
});
