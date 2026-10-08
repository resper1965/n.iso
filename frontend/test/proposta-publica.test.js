// Página pública do cliente (public/proposta.html + proposta.js). O que importa:
// (1) o token sai do fragmento, some da barra e só viaja no CORPO; nunca em URL nem no console;
// (2) cada estado que o `ver` devolve tem a sua tela; 404, 409 e 429 têm mensagem própria;
// (3) aceitar manda o corpo exato do propostaAceiteLinkSchema e é bloqueado sem a caixa de poderes
// e com campo vazio, com o erro junto do campo; (4) nada inline no HTML (CSP script-src 'self').
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lido = (glob) => Object.values(glob)[0];
const HTML = lido(import.meta.glob('../public/proposta.html', { query: '?raw', import: 'default', eager: true }));

const TOKEN = 'tok_SEGREDO_abcdefghijklmnopqrstuvwxyz0123456789';
const DOC = '<!doctype html><html><head><title>Proposta</title></head><body><div class="run"><span>Consultoria Alfa</span><span>Proposta ALF-2026-004</span></div><h1>Documento</h1></body></html>';
const VER = { estado: 'visualizada', html: DOC, numero: 'ALF-2026-004', revisao: 2, validaAte: '2026-11-01' };

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 20));
const $ = (id) => document.getElementById(id);

let fetchMock;
let consoles;
function servidor(rotas) {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
    const r = rotas[String(url).replace(/^https?:\/\/[^/]+/, '')];
    if (r === undefined) return json({ error: 'sem rota' }, 500);
    return typeof r === 'function' ? r(o) : r;
  });
}
const chamadas = (fim) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(fim));
const corpo = (fim, i = 0) => JSON.parse(chamadas(fim)[i][1].body);

async function abre(hash = '#' + TOKEN) {
  document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
  history.replaceState(null, '', '/proposta' + hash);
  window.propostaPublica.iniciar();
  await espera();
}

beforeEach(async () => {
  try { sessionStorage.clear(); } catch { /* sem storage */ }
  await import('../public/proposta.js');
  consoles = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  // o token nunca vai para o console nem para a URL de alguma chamada
  for (const c of consoles) expect(JSON.stringify(c.mock.calls)).not.toContain(TOKEN);
  for (const [u] of fetchMock?.mock.calls || []) expect(String(u)).not.toContain(TOKEN);
  expect(location.href).not.toContain(TOKEN);
});

describe('HTML da página', () => {
  it('sem script nem handler inline; script e CSS são arquivos próprios', () => {
    expect(HTML).not.toMatch(/\son[a-z]+\s*=/i);
    const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][1]).toContain('src="/proposta.js"');
    expect(scripts[0][2].trim()).toBe('');
    expect(HTML).not.toMatch(/<style\b/i);
    expect(HTML).not.toMatch(/\sstyle=/i);
    expect(HTML).toContain('href="/proposta.css"');
    expect(HTML).not.toContain('/src/style.css');
  });

  it('todo campo tem <label for> e o documento fica em iframe com sandbox sem scripts', () => {
    document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
    for (const el of document.querySelectorAll('input, textarea')) {
      expect(document.querySelector(`label[for="${el.id}"]`), el.id).toBeTruthy();
    }
    const sandbox = $('pp-doc').getAttribute('sandbox');
    expect(sandbox).not.toBeNull();
    expect(sandbox).not.toContain('allow-scripts');
  });
});

describe('abertura', () => {
  it('lê o token do fragmento, apaga da barra e manda só no corpo do ver', async () => {
    servidor({ '/api/v1/public/propostas/ver': json(VER) });
    await abre();
    expect(location.hash).toBe('');
    expect(location.pathname).toBe('/proposta');
    expect(chamadas('/ver')).toHaveLength(1);
    expect(chamadas('/ver')[0][1].method).toBe('POST');
    expect(corpo('/ver')).toEqual({ token: TOKEN });
    expect($('pp-proposta').hidden).toBe(false);
    expect($('pp-doc').getAttribute('srcdoc') ?? $('pp-doc').srcdoc).toContain('Documento');
    expect($('pp-org').textContent).toBe('Consultoria Alfa');
    expect($('pp-meta').textContent).toContain('ALF-2026-004 rev. 2');
    expect($('pp-meta').textContent).toContain('01/11/2026');
    // no celular o documento é longo: atalho para a resposta
    expect($('pp-ir').hidden).toBe(false);
  });

  it('"Ir para a resposta" é botão que rola até a resposta sem tocar no hash', async () => {
    servidor({ '/api/v1/public/propostas/ver': json(VER) });
    await abre();
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    try {
      expect($('pp-ir').tagName).toBe('BUTTON');
      expect($('pp-ir').getAttribute('type')).toBe('button');
      expect($('pp-ir').hasAttribute('href')).toBe(false);
      $('pp-ir').click();
      expect(rolar).toHaveBeenCalledTimes(1);
      expect(rolar.mock.contexts[0]).toBe($('pp-resposta'));
      expect(location.hash).toBe('');
    } finally { delete Element.prototype.scrollIntoView; }
  });

  it('recarregar (F5) sem o hash usa o token guardado na sessão da aba', async () => {
    servidor({ '/api/v1/public/propostas/ver': () => json(VER) });
    await abre();
    expect(location.hash).toBe('');
    await abre('');
    expect(chamadas('/ver')).toHaveLength(2);
    expect(corpo('/ver', 1)).toEqual({ token: TOKEN });
    expect($('pp-proposta').hidden).toBe(false);
  });

  it('sessionStorage indisponível: abre pelo hash e, sem ele, diz que o link é inválido', async () => {
    const ler = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    servidor({ '/api/v1/public/propostas/ver': json(VER) });
    await abre();
    expect($('pp-proposta').hidden).toBe(false);
    await abre('');
    expect(chamadas('/ver')).toHaveLength(1);
    expect($('pp-estado').textContent).toMatch(/Link inválido ou expirado/);
    ler.mockRestore(); gravar.mockRestore();
  });

  it('sem token: link inválido, sem chamar o servidor', async () => {
    servidor({});
    await abre('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect($('pp-estado').textContent).toMatch(/Link inválido ou expirado/);
    expect($('pp-proposta').hidden).toBe(true);
  });

  it('carregando enquanto o ver não responde', async () => {
    servidor({ '/api/v1/public/propostas/ver': () => new Promise(() => {}) });
    await abre();
    expect($('pp-estado').textContent).toMatch(/Carregando/);
    expect($('pp-proposta').hidden).toBe(true);
  });

  const ESTADOS = [
    ['404', json({ error: 'Link inválido ou expirado' }, 404), /Link inválido ou expirado/],
    ['429', json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429), /Muitas tentativas/],
    ['aceita', json({ estado: 'aceita', aceitaPor: 'Maria Souza', aceitaEm: '2026-10-05T14:30:00.000Z' }), /Proposta aceita em 05\/10\/2026 por Maria Souza/],
    ['recusada', json({ estado: 'recusada' }), /recusada/i],
    ['substituida', json({ estado: 'substituida' }), /Existe uma versão mais nova; peça o novo link ao comercial/],
    ['expirada', json({ estado: 'expirada' }), /validade/i],
    ['corpo vazio', json(null), /Link inválido ou expirado/],
    ['falha de rede', () => Promise.reject(new TypeError('Failed to fetch')), /Não foi possível/],
  ];
  for (const [nome, resposta, texto] of ESTADOS) {
    it(`estado ${nome}: mensagem própria e sem documento nem ações`, async () => {
      servidor({ '/api/v1/public/propostas/ver': resposta });
      await abre();
      expect($('pp-estado').hidden).toBe(false);
      expect($('pp-estado').textContent).toMatch(texto);
      expect($('pp-proposta').hidden).toBe(true);
    });
  }

  it('valor do servidor vira texto, não HTML', async () => {
    servidor({ '/api/v1/public/propostas/ver': json({ estado: 'aceita', aceitaPor: '<img src=x onerror=alert(1)>', aceitaEm: '2026-10-05T14:30:00Z' }) });
    await abre();
    expect(document.querySelector('#pp-estado img')).toBeNull();
    expect($('pp-estado').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

async function abreAceitar(rotas = {}) {
  servidor({ '/api/v1/public/propostas/ver': json(VER), ...rotas });
  await abre();
  $('pp-op-aceitar').click();
}
const preenche = (o) => { for (const [k, v] of Object.entries(o)) { if (k === 'poderes') $('pp-poderes').checked = v; else $('pp-' + k).value = v; } };
const envia = async (form) => { $(form).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await espera(); };

describe('aceitar', () => {
  it('abre o formulário pelo botão e envia o corpo exato do schema', async () => {
    await abreAceitar({ '/api/v1/public/propostas/aceitar': json({ ok: true, aceitaEm: '2026-10-05T14:30:00.000Z' }) });
    expect($('pp-painel-aceitar').hidden).toBe(false);
    expect($('pp-op-aceitar').getAttribute('aria-expanded')).toBe('true');
    preenche({ nome: '  Maria Souza ', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: true });
    await envia('pp-painel-aceitar');
    expect(corpo('/aceitar')).toEqual({ token: TOKEN, nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: true });
    expect($('pp-proposta').hidden).toBe(true);
    expect($('pp-estado').textContent).toMatch(/Proposta aceita em 05\/10\/2026 por Maria Souza/);
  });

  it('sem a caixa de poderes: não envia e diz o motivo junto da caixa', async () => {
    await abreAceitar({ '/api/v1/public/propostas/aceitar': json({ ok: true }) });
    preenche({ nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: false });
    await envia('pp-painel-aceitar');
    expect(chamadas('/aceitar')).toHaveLength(0);
    expect($('pp-poderes-erro').textContent).toMatch(/poderes/i);
    expect($('pp-poderes-erro').getAttribute('role')).toBe('alert');
    expect($('pp-poderes').getAttribute('aria-invalid')).toBe('true');
  });

  it('campos vazios ou inválidos: erro em cada campo, foco no primeiro, nada enviado', async () => {
    await abreAceitar({ '/api/v1/public/propostas/aceitar': json({ ok: true }) });
    preenche({ nome: ' ', cargo: 'X', email: 'maria@', poderes: true });
    await envia('pp-painel-aceitar');
    expect(chamadas('/aceitar')).toHaveLength(0);
    expect($('pp-nome-erro').textContent).not.toBe('');
    expect($('pp-cargo-erro').textContent).not.toBe('');
    expect($('pp-email-erro').textContent).toMatch(/e-mail/i);
    expect($('pp-poderes-erro').textContent).toBe('');
    expect($('pp-nome').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('pp-nome'));
    // corrigido, o erro some e o envio sai
    preenche({ nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br' });
    await envia('pp-painel-aceitar');
    expect($('pp-nome-erro').textContent).toBe('');
    expect($('pp-nome').hasAttribute('aria-invalid')).toBe(false);
    expect(chamadas('/aceitar')).toHaveLength(1);
  });

  it('409: avisa que já foi respondida e mostra o estado atual', async () => {
    let n = 0;
    servidor({
      '/api/v1/public/propostas/ver': () => json(n++ === 0 ? VER : { estado: 'aceita', aceitaPor: 'Outra Pessoa', aceitaEm: '2026-10-04T10:00:00Z' }),
      '/api/v1/public/propostas/aceitar': json({ error: 'Esta proposta já foi respondida' }, 409),
    });
    await abre();
    $('pp-op-aceitar').click();
    preenche({ nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: true });
    await envia('pp-painel-aceitar');
    await espera();
    expect($('pp-estado').textContent).toMatch(/já foi respondida/);
    expect($('pp-estado').textContent).toMatch(/Proposta aceita em 04\/10\/2026 por Outra Pessoa/);
  });

  it('429 e 404 na ação: mensagem na tela', async () => {
    await abreAceitar({ '/api/v1/public/propostas/aceitar': json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429) });
    preenche({ nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: true });
    await envia('pp-painel-aceitar');
    expect($('pp-aceitar-erro').textContent).toMatch(/Muitas tentativas/);
    expect($('pp-proposta').hidden).toBe(false);

    await abreAceitar({ '/api/v1/public/propostas/aceitar': json({ error: 'Link inválido ou expirado' }, 404) });
    preenche({ nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: true });
    await envia('pp-painel-aceitar');
    expect($('pp-estado').textContent).toMatch(/Link inválido ou expirado/);
    expect($('pp-proposta').hidden).toBe(true);
  });

  it('botão desabilitado durante o envio: dois cliques, uma chamada', async () => {
    let solta;
    await abreAceitar({ '/api/v1/public/propostas/aceitar': () => new Promise((r) => { solta = () => r(json({ ok: true, aceitaEm: '2026-10-05T14:30:00Z' })); }) });
    preenche({ nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@cliente.com.br', poderes: true });
    await envia('pp-painel-aceitar');
    expect($('pp-aceitar-enviar').disabled).toBe(true);
    await envia('pp-painel-aceitar');
    expect(chamadas('/aceitar')).toHaveLength(1);
    solta();
    await espera();
  });
});

describe('recusar e pedir ajuste', () => {
  it('recusar pede confirmação na própria tela, sem confirm(), e manda o motivo', async () => {
    window.confirm = vi.fn(() => true);
    servidor({ '/api/v1/public/propostas/ver': json(VER), '/api/v1/public/propostas/recusar': json({ ok: true }) });
    await abre();
    $('pp-op-recusar').click();
    $('pp-motivo').value = '  Preço acima do orçamento ';
    await envia('pp-painel-recusar');
    expect(chamadas('/recusar')).toHaveLength(0);
    expect($('pp-recusar-passo2').hidden).toBe(false);
    $('pp-recusar-voltar').click();
    expect($('pp-recusar-passo2').hidden).toBe(true);
    await envia('pp-painel-recusar');
    $('pp-recusar-confirmar').click();
    await espera();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(corpo('/recusar')).toEqual({ token: TOKEN, motivo: 'Preço acima do orçamento' });
    expect($('pp-estado').textContent).toMatch(/recusa/i);
    expect($('pp-proposta').hidden).toBe(true);
  });

  it('recusar sem motivo manda só o token', async () => {
    servidor({ '/api/v1/public/propostas/ver': json(VER), '/api/v1/public/propostas/recusar': json({ ok: true }) });
    await abre();
    $('pp-op-recusar').click();
    await envia('pp-painel-recusar');
    $('pp-recusar-confirmar').click();
    await espera();
    expect(corpo('/recusar')).toEqual({ token: TOKEN });
  });

  it('ajuste exige mensagem, manda o corpo do schema e mantém a proposta na tela', async () => {
    servidor({ '/api/v1/public/propostas/ver': json(VER), '/api/v1/public/propostas/ajuste': json({ ok: true }) });
    await abre();
    $('pp-op-ajuste').click();
    expect($('pp-painel-aceitar').hidden).toBe(true);
    await envia('pp-painel-ajuste');
    expect(chamadas('/ajuste')).toHaveLength(0);
    expect($('pp-mensagem-erro').textContent).not.toBe('');
    $('pp-mensagem').value = 'Incluir a filial de Recife.';
    await envia('pp-painel-ajuste');
    expect(corpo('/ajuste')).toEqual({ token: TOKEN, mensagem: 'Incluir a filial de Recife.' });
    expect($('pp-proposta').hidden).toBe(false);
    expect($('pp-aviso').hidden).toBe(false);
    expect($('pp-aviso').textContent).toMatch(/ajuste enviado/i);
    expect($('pp-mensagem').value).toBe('');
  });
});
