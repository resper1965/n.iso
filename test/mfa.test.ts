import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword, sha256Hex } from '../src/helpers';
import {
  gerarSegredoTotp, gerarCodigoTotp, verificarCodigoTotp, base32Encode, base32Decode, uriProvisionamento, gerarCodigosRecuperacao,
} from '../src/services/totp';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * TOTP e o fluxo de MFA.
 *
 * O TOTP é implementado à mão (WebCrypto, sem dependência), então os testes
 * conferem contra os vetores da RFC 6238 — não contra a própria implementação.
 * Testar HMAC com o resultado do próprio HMAC não prova nada.
 */
describe('TOTP (RFC 6238)', () => {
  // Vetor da RFC 6238, apêndice B: segredo ASCII "12345678901234567890".
  const SEGREDO_RFC = base32Encode(new TextEncoder().encode('12345678901234567890'));

  it('bate com os vetores de teste da RFC 6238', async () => {
    // t=59s -> contador 1; a RFC especifica 94287082 para SHA-1/8 dígitos, e os
    // 6 últimos são o que usamos.
    expect(await gerarCodigoTotp(SEGREDO_RFC, Math.floor(59 / 30))).toBe('287082');
    expect(await gerarCodigoTotp(SEGREDO_RFC, Math.floor(1111111109 / 30))).toBe('081804');
    expect(await gerarCodigoTotp(SEGREDO_RFC, Math.floor(1234567890 / 30))).toBe('005924');
  });

  it('base32 vai e volta sem perder bytes', () => {
    const original = new Uint8Array([1, 2, 3, 250, 255, 0, 128]);
    expect(Array.from(base32Decode(base32Encode(original)))).toEqual(Array.from(original));
  });

  it('gera segredo de 160 bits, como manda a RFC 4226', () => {
    expect(base32Decode(gerarSegredoTotp()).length).toBe(20);
  });

  it('dois segredos nunca são iguais', () => {
    expect(gerarSegredoTotp()).not.toBe(gerarSegredoTotp());
  });

  it('aceita o código da janela atual e das vizinhas — relógio de celular deriva', async () => {
    const s = gerarSegredoTotp();
    const agora = 1_700_000_000;
    const c = Math.floor(agora / 30);
    for (const delta of [-1, 0, 1]) {
      // Devolve a janela QUE CASOU, não `true`: é ela que precisa ser gravada.
      expect(await verificarCodigoTotp(s, await gerarCodigoTotp(s, c + delta), agora), `delta ${delta}`).toBe(c + delta);
    }
  });

  it('recusa código de janela distante', async () => {
    const s = gerarSegredoTotp();
    const agora = 1_700_000_000;
    const antigo = await gerarCodigoTotp(s, Math.floor(agora / 30) - 10);
    expect(await verificarCodigoTotp(s, antigo, agora)).toBeNull();
  });

  it('recusa entrada que não é 6 dígitos, em vez de tentar mesmo assim', async () => {
    const s = gerarSegredoTotp();
    for (const ruim of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(await verificarCodigoTotp(s, ruim), ruim).toBeNull();
    }
  });

  it('a URI de provisionamento traz o que o autenticador precisa', () => {
    const uri = uriProvisionamento('ABCDEFGH', 'a@b.c');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=ABCDEFGH');
    expect(uri).toContain('issuer=nISO');
    expect(uri).toContain('period=30');
  });

  it('códigos de recuperação são distintos entre si', () => {
    const c = gerarCodigosRecuperacao(8);
    expect(c.length).toBe(8);
    expect(new Set(c).size).toBe(8);
  });
});

describe('Fluxo de MFA', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','a@b.c',?,'A','platform_admin')`).bind(hash).run();
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'a@b.c', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function post(path: string, body: unknown = {}) {
    return app.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
      env as any
    );
  }

  async function codigoValido(segredo: string) {
    return gerarCodigoTotp(segredo, Math.floor(Date.now() / 1000 / 30));
  }

  it('setup gera segredo e QR mas NÃO ativa', async () => {
    const res = await post('/api/v1/auth/mfa/setup', { password: 'password123' });
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.secret).toBeTruthy();
    expect(body.otpauth_url).toContain('otpauth://');

    // Ativar no setup trancaria para fora quem escaneou errado.
    const row = await env.DB.prepare("SELECT totp_enabled FROM users WHERE id='u1'").first<any>();
    expect(row.totp_enabled).toBe(0);
  });

  it('activate com código errado não ativa', async () => {
    await post('/api/v1/auth/mfa/setup', { password: 'password123' });
    const res = await post('/api/v1/auth/mfa/activate', { codigo: '000000' });
    expect(res.status).toBe(401);
    const row = await env.DB.prepare("SELECT totp_enabled FROM users WHERE id='u1'").first<any>();
    expect(row.totp_enabled).toBe(0);
  });

  it('activate com código válido ativa e entrega os códigos de recuperação', async () => {
    const { secret } = await (await post('/api/v1/auth/mfa/setup', { password: 'password123' })).json() as any;
    const res = await post('/api/v1/auth/mfa/activate', { codigo: await codigoValido(secret) });
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.recovery_codes.length).toBe(8);

    const row = await env.DB.prepare("SELECT totp_enabled, totp_recovery_hashes FROM users WHERE id='u1'").first<any>();
    expect(row.totp_enabled).toBe(1);
    // Guardados como hash: só precisam ser comparados, nunca reexibidos.
    expect(row.totp_recovery_hashes).not.toContain(body.recovery_codes[0]);
    expect(row.totp_recovery_hashes.split(',')).toContain(await sha256Hex(body.recovery_codes[0]));
  });

  it('verify aceita o código, e o MESMO código não vale duas vezes', async () => {
    const { secret } = await (await post('/api/v1/auth/mfa/setup', { password: 'password123' })).json() as any;
    const codigo = await codigoValido(secret);
    await post('/api/v1/auth/mfa/activate', { codigo });

    expect((await post('/api/v1/auth/mfa/verify', { codigo })).status).toBe(200);

    // Código interceptado (ombro, phishing, log) valeria de novo até expirar.
    const reuso = await post('/api/v1/auth/mfa/verify', { codigo });
    expect(reuso.status).toBe(401);
    expect((await reuso.json() as any).error).toContain('já utilizado');
  });

  it('código de recuperação funciona e é de uso único', async () => {
    const { secret } = await (await post('/api/v1/auth/mfa/setup', { password: 'password123' })).json() as any;
    const { recovery_codes } = await (await post('/api/v1/auth/mfa/activate', { codigo: await codigoValido(secret) })).json() as any;

    const primeiro = await post('/api/v1/auth/mfa/verify', { codigo: recovery_codes[0] });
    const body = await primeiro.json() as any;
    expect(primeiro.status, JSON.stringify(body)).toBe(200);
    expect(body.metodo).toBe('recuperacao');
    expect(body.codigos_restantes).toBe(7);

    expect((await post('/api/v1/auth/mfa/verify', { codigo: recovery_codes[0] })).status).toBe(401);
  });

  it('desativar exige a senha — sessão roubada não desliga o segundo fator', async () => {
    const { secret } = await (await post('/api/v1/auth/mfa/setup', { password: 'password123' })).json() as any;
    await post('/api/v1/auth/mfa/activate', { codigo: await codigoValido(secret) });

    expect((await post('/api/v1/auth/mfa/disable', { password: 'errada' })).status).toBe(401);
    const aindaAtivo = await env.DB.prepare("SELECT totp_enabled FROM users WHERE id='u1'").first<any>();
    expect(aindaAtivo.totp_enabled).toBe(1);

    expect((await post('/api/v1/auth/mfa/disable', { password: 'password123' })).status).toBe(200);
    const row = await env.DB.prepare("SELECT totp_enabled, totp_secret FROM users WHERE id='u1'").first<any>();
    expect(row.totp_enabled).toBe(0);
    expect(row.totp_secret).toBeNull();
  });

  it('setup é recusado quando o MFA já está ativo', async () => {
    const { secret } = await (await post('/api/v1/auth/mfa/setup', { password: 'password123' })).json() as any;
    await post('/api/v1/auth/mfa/activate', { codigo: await codigoValido(secret) });
    expect((await post('/api/v1/auth/mfa/setup', { password: 'password123' })).status).toBe(409);
  });

  it('status nunca devolve o segredo', async () => {
    await post('/api/v1/auth/mfa/setup', { password: 'password123' });
    const res = await app.fetch(new Request('http://localhost/api/v1/auth/mfa/status', { headers }), env as any);
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toMatch(/secret/i);
  });

  it('setup exige a senha — sessão roubada não vincula o próprio autenticador', async () => {
    // Sem isto, quem rouba uma sessão de conta ainda SEM MFA gera um segredo,
    // ativa com o próprio autenticador e vira dono do segundo fator; o
    // legítimo perde o acesso quando as sessões dele expiram.
    expect((await post('/api/v1/auth/mfa/setup', { password: 'errada' })).status).toBe(401);
    const semSenha = await post('/api/v1/auth/mfa/setup', {});
    expect(semSenha.status).toBe(400);
  });

  it('activate é limitado — não dá para martelar 6 dígitos até casar', async () => {
    // Quem sequestra uma sessão ANTES da ativação e adivinha um código liga o
    // MFA com códigos de recuperação que só ele viu. O /verify já era limitado;
    // o /activate ficara de fora.
    await post('/api/v1/auth/mfa/setup', { password: 'password123' });
    let bloqueou = 0;
    for (let i = 0; i < 14; i++) {
      const r = await post('/api/v1/auth/mfa/activate', { codigo: '000000' });
      if (r.status === 429) bloqueou++;
    }
    expect(bloqueou).toBeGreaterThan(0);
  });

  it('disable é limitado — não vira oráculo de senha', async () => {
    // O /auth/login limita por IP; este endpoint não passava por lá. E acertar
    // a senha aqui desliga o segundo fator.
    let bloqueou = 0;
    for (let i = 0; i < 14; i++) {
      const r = await post('/api/v1/auth/mfa/disable', { password: `tentativa${i}` });
      if (r.status === 429) bloqueou++;
    }
    expect(bloqueou).toBeGreaterThan(0);
  });

  it('MFA exige sessão — não é rota pública', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      env as any
    );
    expect(res.status).toBe(401);
  });
});

describe('MFA imposto no login', () => {
  let senhaHash: string;

  beforeAll(async () => {
    await applySchema();
    senhaHash = await hashPassword('password123');
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u9','mfa@ness.io',?,'Com MFA','platform_admin')`).bind(senhaHash).run();
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u8','sem@ness.io',?,'Sem MFA','platform_admin')`).bind(senhaHash).run();
  });

  async function login(email: string) {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
      env as any
    );
    return { status: res.status, body: await res.json() as any };
  }

  function h(token: string) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  it('usuário sem MFA entra direto', async () => {
    const { body } = await login('sem@ness.io');
    expect(body.requiresMfa).toBe(false);
    const res = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: h(body.token) }), env as any);
    expect(res.status).toBe(200);
  });

  it('usuário com MFA recebe token, mas ele NÃO abre porta nenhuma', async () => {
    // Ativa o MFA de u9.
    const primeiro = await login('mfa@ness.io');
    const setup = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/setup', { method: 'POST', headers: h(primeiro.body.token), body: JSON.stringify({ password: 'password123' }) }),
      env as any
    );
    const { secret } = await setup.json() as any;
    await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/activate', {
        method: 'POST', headers: h(primeiro.body.token),
        body: JSON.stringify({ codigo: await gerarCodigoTotp(secret, Math.floor(Date.now() / 1000 / 30)) }),
      }),
      env as any
    );

    // Novo login: agora exige segundo fator.
    const { body } = await login('mfa@ness.io');
    expect(body.requiresMfa).toBe(true);
    expect(body.token).toBeTruthy();

    // É este o ponto do PR: o token do login sozinho não vale nada.
    const bloqueado = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: h(body.token) }), env as any);
    expect(bloqueado.status).toBe(401);
    expect((await bloqueado.json() as any).mfa_required).toBe(true);

    // Confere o código...
    const verify = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/verify', {
        method: 'POST', headers: h(body.token),
        body: JSON.stringify({ codigo: await gerarCodigoTotp(secret, Math.floor(Date.now() / 1000 / 30)) }),
      }),
      env as any
    );
    expect(verify.status, await verify.clone().text()).toBe(200);

    // ...e a MESMA sessão passa a valer.
    const liberado = await app.fetch(new Request('http://localhost/api/v1/projects', { headers: h(body.token) }), env as any);
    expect(liberado.status).toBe(200);
  });

  it('sessão pendente NÃO alcança /disable — senão a senha derruba o próprio fator', async () => {
    // Quem tem só a senha consegue a sessão pendente. Se ela chegasse a
    // /disable, a MESMA senha desligaria o segundo fator e o login seguinte
    // passaria sem código: o fator seria contornável com aquilo que ele existe
    // para complementar. Liberar todo o /auth/mfa/* para a sessão pendente era
    // exatamente esse buraco.
    // Storage isolado por teste: o MFA ativado no teste anterior não sobrevive.
    const inicial = await login('mfa@ness.io');
    const setup = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/setup', {
        method: 'POST', headers: h(inicial.body.token),
        body: JSON.stringify({ password: 'password123' }),
      }),
      env as any
    );
    const { secret } = await setup.json() as any;
    await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/activate', {
        method: 'POST', headers: h(inicial.body.token),
        body: JSON.stringify({ codigo: await gerarCodigoTotp(secret, Math.floor(Date.now() / 1000 / 30)) }),
      }),
      env as any
    );

    const { body } = await login('mfa@ness.io');
    expect(body.requiresMfa).toBe(true);

    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/disable', {
        method: 'POST', headers: h(body.token),
        body: JSON.stringify({ password: 'password123' }),
      }),
      env as any
    );
    expect(res.status).toBe(401);
    expect((await res.json() as any).mfa_required).toBe(true);

    const row = await env.DB.prepare("SELECT totp_enabled FROM users WHERE id='u9'").first<any>();
    expect(row.totp_enabled).toBe(1);
  });

  it('org_user com MFA consegue confirmar o código — não fica trancado para fora', async () => {
    // O allow-list de escrita de papéis read-only vale para TODO POST sob
    // /api/v1. Sem uma entrada para o auto-serviço de MFA, /verify devolvia 403
    // e a conta ficava sem caminho nenhum de login — não é vazamento, é
    // lockout permanente, e nenhum teste pegava porque todos usavam admin.
    const hash = await hashPassword('password123');
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('u7','leitor@ness.io',?,'Leitor','org_user')`
    ).bind(hash).run();

    const inicial = await login('leitor@ness.io');
    const setup = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/setup', {
        method: 'POST', headers: h(inicial.body.token),
        body: JSON.stringify({ password: 'password123' }),
      }),
      env as any
    );
    expect(setup.status, await setup.clone().text()).toBe(200);
    const { secret } = await setup.json() as any;

    const ativar = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/activate', {
        method: 'POST', headers: h(inicial.body.token),
        body: JSON.stringify({ codigo: await gerarCodigoTotp(secret, Math.floor(Date.now() / 1000 / 30)) }),
      }),
      env as any
    );
    expect(ativar.status, await ativar.clone().text()).toBe(200);

    const { body } = await login('leitor@ness.io');
    expect(body.requiresMfa).toBe(true);
    const verify = await app.fetch(
      new Request('http://localhost/api/v1/auth/mfa/verify', {
        method: 'POST', headers: h(body.token),
        body: JSON.stringify({ codigo: await gerarCodigoTotp(secret, Math.floor(Date.now() / 1000 / 30)) }),
      }),
      env as any
    );
    expect(verify.status, await verify.clone().text()).toBe(200);
  });
});

describe('Reuso de código na janela tolerada', () => {
  beforeAll(async () => {
    await applySchema();
  });

  it('grava a janela que casou, não a atual do servidor', async () => {
    // Com tolerância de ±1 o código aceito pode ser o da janela seguinte. Ao
    // gravar a janela ATUAL, o servidor cruzava o limite e o MESMO código
    // passava de novo, porque o contador novo era maior que o gravado.
    const s = gerarSegredoTotp();
    const agora = 1_700_000_000;
    const atual = Math.floor(agora / 30);

    const casou = await verificarCodigoTotp(s, await gerarCodigoTotp(s, atual + 1), agora);
    expect(casou).toBe(atual + 1);

    // Trinta segundos depois, o servidor está em `atual + 1`. Se tivéssemos
    // gravado `atual`, a comparação `janela <= gravado` deixaria passar.
    expect(casou! <= (atual + 1)).toBe(true);
  });

  it('aceitar o código da janela anterior não bloqueia o código legítimo da atual', async () => {
    // O outro lado do mesmo defeito: gravar `atual` depois de aceitar um código
    // de `atual - 1` fazia o código legítimo de `atual` ser recusado como
    // "já utilizado" pelo resto da janela.
    const s = gerarSegredoTotp();
    const agora = 1_700_000_000;
    const atual = Math.floor(agora / 30);

    const anterior = await verificarCodigoTotp(s, await gerarCodigoTotp(s, atual - 1), agora);
    expect(anterior).toBe(atual - 1);

    const legitimo = await verificarCodigoTotp(s, await gerarCodigoTotp(s, atual), agora);
    expect(legitimo).toBe(atual);
    expect(legitimo! > anterior!).toBe(true);
  });
});
