// Portal /politicas, fluxo do link pessoal de ciência (fatia 3 do acesso de stakeholders): o token
// vem no fragmento (#token) e segue só no CORPO do POST; o conteúdo do documento é escapado; o
// portal antigo (sem #token) continua na tela do OTP por e-mail.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import html from '../public/politicas.html?raw';

const TOKEN = 'ab'.repeat(32);
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 30));
const el = (id) => document.getElementById(id);

let fetchMock;
let iniciar;
/** Carrega o script de novo e guarda SÓ o handler de DOMContentLoaded desta carga (os das cargas
 *  anteriores continuam presos em `window`; disparar o evento rodaria todos). */
async function abrir(hash) {
  let semScripts = html;
  for (let ant; ant !== semScripts;) { ant = semScripts; semScripts = semScripts.replace(/<script[\s\S]*?<\/script[^>]*>/gi, ''); }
  document.documentElement.innerHTML = semScripts;
  window.location.hash = hash;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const add = vi.spyOn(window, 'addEventListener');
  vi.resetModules();
  await import('../public/politicas.js');
  iniciar = add.mock.calls.filter(([ev]) => ev === 'DOMContentLoaded').at(-1)[1];
  add.mockRestore();
}

describe('portal /politicas: ciência por link', () => {
  beforeEach(() => { window.location.hash = ''; });

  it('sem #token: portal antigo, sem chamada às rotas de pedido', async () => {
    await abrir('');
    iniciar();
    await espera();
    expect(el('step-request-otp').classList.contains('hidden')).toBe(false);
    expect(el('step-link').classList.contains('hidden')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com #token: abre o documento escapado e o hash; token só no corpo; código e ciência', async () => {
    await abrir('#' + TOKEN);
    fetchMock.mockResolvedValueOnce(json({
      estado: 'pendente', tipo: 'politica', titulo: 'Política: Segurança', hash: 'f'.repeat(64), nome: 'Ana', email: 'a*****@c.com',
      conteudo: { title: 'Segurança <b>x</b>', description: '<img src=x onerror=alert(1)>' },
    }));
    iniciar();
    await espera();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/public/pedidos/ver');
    expect(url).not.toContain(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
    // O token sai da barra de endereço (histórico, captura de tela, cópia do link) e fica só em memória.
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(el('step-request-otp').classList.contains('hidden')).toBe(true);
    expect(el('link-documento').innerHTML).toContain('&lt;img');
    expect(el('link-documento').querySelector('img')).toBeNull();
    expect(el('link-hash').textContent).toBe('f'.repeat(64));
    expect(el('link-nome').value).toBe('Ana');

    fetchMock.mockResolvedValueOnce(json({ ok: true, enviado_para: 'a*****@c.com' }));
    el('btn-link-codigo').click();
    await espera();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/public/pedidos/codigo');
    expect(el('form-link-ciencia').classList.contains('hidden')).toBe(false);

    el('link-codigo').value = '123456';
    el('link-aceite').checked = true;
    el('link-aceite').dispatchEvent(new Event('change'));
    expect(el('btn-link-confirmar').disabled).toBe(false);
    fetchMock.mockResolvedValueOnce(json({ ok: true, decidido_em: '2026-10-04T12:00:00.000Z', hash_lido: 'f'.repeat(64) }));
    el('form-link-ciencia').dispatchEvent(new Event('submit', { cancelable: true }));
    await espera();
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/public/pedidos/ciencia');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ token: TOKEN, codigo: '123456', nome: 'Ana' });
    expect(el('link-concluido').classList.contains('hidden')).toBe(false);
    expect(el('link-concluido').textContent).toContain('f'.repeat(64));
  });

  it('link inválido: mensagem, sem formulário', async () => {
    await abrir('#' + TOKEN);
    fetchMock.mockResolvedValueOnce(json({ error: 'Link inválido ou expirado' }, 404));
    iniciar();
    await espera();
    expect(el('msg-link').textContent).toMatch(/inválido ou expirou/);
    expect(el('link-leitura').classList.contains('hidden')).toBe(true);
  });
});
