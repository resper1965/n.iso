// Portal /politicas, fluxo do código por e-mail (fatia 3.3): lista os DOCUMENTOS vigentes (não mais os
// controles), a ciência é da versão ("Assinado" na vigente, "Versão anterior (n)" nas passadas), o POST leva só
// o id do documento e o conteúdo, que vem do servidor, é sempre escapado. Mesmo molde de politicas-link.test.js:
// o HTML e o script reais, com `fetch` dublado.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import html from '../public/politicas.html?raw';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const el = (id) => document.getElementById(id);

let fetchMock;
let iniciar;
async function abrir() {
  let semScripts = html;
  for (let ant; ant !== semScripts;) { ant = semScripts; semScripts = semScripts.replace(/<script[\s\S]*?<\/script[^>]*>/gi, ''); }
  document.documentElement.innerHTML = semScripts;
  window.location.hash = '';
  window.history.replaceState(null, '', '/politicas?project=p1');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('alert', vi.fn());
  const add = vi.spyOn(window, 'addEventListener');
  vi.resetModules();
  await import('../public/politicas.js');
  iniciar = add.mock.calls.filter(([ev]) => ev === 'DOMContentLoaded').at(-1)[1];
  add.mockRestore();
}

const DOCS = [
  { id: 'd1', tipo: 'politica', titulo: 'Política de Acesso', numero: 2, texto: 'Texto v2 do acesso', ciencia: null },
  { id: 'd2', tipo: 'norma', titulo: 'Norma <b>X</b>', numero: 1, texto: '<img src=x onerror=alert(1)>', ciencia: { numero: 1, em: '2026-10-09 10:00:00', atual: true } },
  { id: 'd3', tipo: 'procedimento', titulo: 'Procedimento de Backup', numero: 3, texto: 'Passos', ciencia: { numero: 2, em: '2026-09-01 10:00:00', atual: false } },
];
const lista = (extra = {}) => json({
  ok: true, project: { client_name: 'Cliente Portal' }, user: { name: 'Ana', email: 'ana@c.com' },
  documents: DOCS, legacy: [{ policy_type: 'Política <i>Antiga</i>', acknowledged_at: '2020-01-01' }], ...extra,
});

/** Percorre o portal até a leitura: pede o código, confirma, carrega a lista. */
async function entrar(respostaLista = lista()) {
  await abrir();
  iniciar();
  el('req-name').value = 'Ana';
  el('req-email').value = 'ana@c.com';
  fetchMock.mockResolvedValueOnce(json({ ok: true, message: 'Código enviado.' }));
  el('form-request-otp').dispatchEvent(new Event('submit', { cancelable: true }));
  await espera();
  el('otp-code').value = '123456';
  fetchMock.mockResolvedValueOnce(json({ ok: true, token: 'pubpol_tok', name: 'Ana', email: 'ana@c.com' }));
  fetchMock.mockResolvedValueOnce(respostaLista);
  el('form-verify-otp').dispatchEvent(new Event('submit', { cancelable: true }));
  await espera(60);
}

describe('portal /politicas: documentos e ciência por versão', () => {
  beforeEach(() => { window.location.hash = ''; });

  it('lista os documentos vigentes, com o selo certo de cada um e o texto escapado', async () => {
    await entrar();
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/public/policies/list?token=pubpol_tok');
    const itens = [...document.querySelectorAll('.policy-item')];
    expect(itens.map((i) => i.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Política de Acesso', 'Norma <b>X</b> Assinado', 'Procedimento de Backup Versão anterior (2)',
    ]);
    expect(document.querySelector('.policy-item b')).toBeNull(); // título é texto, não HTML
    expect(el('reader-project-name').textContent).toBe('Cliente Portal');
    // primeiro documento aberto: cabeçalho com tipo e versão
    expect(el('document-paper-body').textContent).toContain('Política de Acesso');
    expect(el('document-paper-body').textContent).toContain('Política · versão 2');
    expect(el('document-paper-body').textContent).toContain('Texto v2 do acesso');
  });

  it('o texto vindo do servidor nunca vira HTML', async () => {
    await entrar();
    document.querySelectorAll('.policy-item')[1].click();
    expect(el('document-paper-body').innerHTML).toContain('&lt;img');
    expect(el('document-paper-body').querySelector('img')).toBeNull();
  });

  it('registros antigos (sem versão) aparecem à parte, escapados', async () => {
    await entrar();
    expect(el('policy-list-container').textContent).toContain('Registros anteriores, sem prova de versão: Política <i>Antiga</i>');
    expect(el('policy-list-container').querySelector('i')).toBeNull();
  });

  it('documento já assinado na vigente mostra o banner; sem ciência, o botão fica travado até aceitar', async () => {
    await entrar();
    // d1 (sem ciência)
    expect(el('ack-pending-box').classList.contains('hidden')).toBe(false);
    expect(el('btn-sign-ack').disabled).toBe(true);
    el('chk-accept').checked = true;
    el('chk-accept').dispatchEvent(new Event('change'));
    expect(el('btn-sign-ack').disabled).toBe(false);
    // d2 (assinado na vigente)
    document.querySelectorAll('.policy-item')[1].click();
    expect(el('ack-completed-box').classList.contains('hidden')).toBe(false);
    expect(el('ack-details-hash').textContent).toContain('Versão 1');
  });

  it('versão anterior: avisa que a ciência anterior fica gravada e pede confirmação nova', async () => {
    await entrar();
    document.querySelectorAll('.policy-item')[2].click();
    expect(el('ack-pending-box').classList.contains('hidden')).toBe(false);
    expect(el('ack-prev-note').classList.contains('hidden')).toBe(false);
    expect(el('ack-prev-note').textContent).toBe('Você deu ciência da versão 2. Esta é a versão 3: leia e confirme de novo.');
  });

  it('assinar manda SÓ o id do documento, marca como assinado e continua no mesmo documento', async () => {
    await entrar();
    el('chk-accept').checked = true;
    el('chk-accept').dispatchEvent(new Event('change'));
    fetchMock.mockResolvedValueOnce(json({ ok: true, documento_id: 'd1', numero: 2, hash: 'f'.repeat(64), acknowledged_at: '2026-10-09T12:00:00.000Z', ja_registrada: false }));
    el('btn-sign-ack').click();
    await espera();
    const [url, init] = fetchMock.mock.calls[3];
    expect(url).toBe('/api/v1/public/policies/ack?token=pubpol_tok');
    expect(JSON.parse(init.body)).toEqual({ documento_id: 'd1' }); // sem nome nem e-mail: valem os da sessão
    expect(document.querySelectorAll('.policy-item')[0].textContent).toContain('Assinado');
    expect(document.querySelector('.policy-item.active').textContent).toContain('Política de Acesso');
    expect(el('ack-completed-box').classList.contains('hidden')).toBe(false);
  });

  it('se saiu versão nova entre a leitura e a confirmação, recarrega e avisa', async () => {
    await entrar();
    el('chk-accept').checked = true;
    el('chk-accept').dispatchEvent(new Event('change'));
    fetchMock.mockResolvedValueOnce(json({ ok: true, documento_id: 'd1', numero: 3, hash: 'a'.repeat(64), acknowledged_at: '2026-10-09T12:00:00.000Z', ja_registrada: false }));
    fetchMock.mockResolvedValueOnce(lista({ documents: [{ ...DOCS[0], numero: 3, texto: 'Texto v3 do acesso' }, DOCS[1], DOCS[2]] }));
    el('btn-sign-ack').click();
    await espera(60);
    expect(fetchMock.mock.calls[4][0]).toBe('/api/v1/public/policies/list?token=pubpol_tok');
    expect(el('document-paper-body').textContent).toContain('Texto v3 do acesso');
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('versão 3'));
  });

  it('erro do servidor ao assinar vai para o aviso e não marca nada', async () => {
    await entrar();
    el('chk-accept').checked = true;
    el('chk-accept').dispatchEvent(new Event('change'));
    fetchMock.mockResolvedValueOnce(json({ error: 'Sessão expirada. Por favor, autentique-se novamente.' }, 401));
    el('btn-sign-ack').click();
    await espera();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Sessão expirada'));
    expect(document.querySelectorAll('.policy-item')[0].textContent).not.toContain('Assinado');
  });

  it('sem documentos vigentes: mensagem, sem erro', async () => {
    await entrar(lista({ documents: [], legacy: [] }));
    expect(el('policy-list-container').textContent).toContain('Nenhum documento vigente');
  });
});

describe('portal /politicas: link pessoal de documento', () => {
  it('mostra título e versão do documento congelado no pedido, com o texto escapado', async () => {
    const TOKEN = 'cd'.repeat(32);
    let semScripts = html;
    for (let ant; ant !== semScripts;) { ant = semScripts; semScripts = semScripts.replace(/<script[\s\S]*?<\/script[^>]*>/gi, ''); }
    document.documentElement.innerHTML = semScripts;
    window.location.hash = '#' + TOKEN;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const add = vi.spyOn(window, 'addEventListener');
    vi.resetModules();
    await import('../public/politicas.js');
    const inicio = add.mock.calls.filter(([ev]) => ev === 'DOMContentLoaded').at(-1)[1];
    add.mockRestore();
    fetchMock.mockResolvedValueOnce(json({
      estado: 'pendente', tipo: 'documento', titulo: 'Documento: Política de Acesso', hash: 'e'.repeat(64), nome: 'Ana', email: 'a*****@c.com',
      conteudo: { titulo: 'Política <b>de</b> Acesso', texto: '<script>alert(1)</script>', numero: 4 },
    }));
    inicio();
    await espera();
    const corpo = el('link-documento');
    expect(corpo.textContent).toContain('Política <b>de</b> Acesso');
    expect(corpo.textContent).toContain('Versão 4');
    expect(corpo.querySelector('b')).toBeNull();
    expect(corpo.querySelector('script')).toBeNull();
  });
});
