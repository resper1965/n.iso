// O desafio anti-abuso só liga com as DUAS chaves do Turnstile presentes.
//
// Isto é um teste de armadilha, não de funcionalidade. Antes, o interruptor era
// só o segredo: defini-lo fazia o servidor exigir `challengeToken` a partir da 2ª
// falha, e a tela não tinha como produzir um — quem errasse a senha uma vez
// ficava sem entrar até a janela de 15 min expirar. Aconteceu em produção, em
// 14/09/2026, e é a issue #170.
//
// A falha segura é NÃO exigir desafio. Perder uma camada extra é muito menos
// grave do que trancar quem sabe a própria senha, e o que segura força bruta
// continua no lugar sem o Turnstile: bloqueio de 15 min na 5ª falha por
// conta+IP, e teto atômico por conta no D1.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions } from './helpers/d1';

const SITE_KEY = '0xSITEKEYDETESTE';

/** Duas tentativas com a mesma conta e IP; devolve o corpo da SEGUNDA. */
async function segundaTentativa(ambiente: Record<string, unknown>, marca: string) {
  const e = { ...env, ...ambiente } as any;
  const pedir = () =>
    app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.9.${marca.length}` },
        body: JSON.stringify({ email: `${marca}@exemplo.invalido`, password: 'errada' }),
      }),
      e
    );
  await pedir();
  return (await (await pedir()).json()) as Record<string, unknown>;
}

describe('interruptor do desafio anti-abuso', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
  });

  it('com as duas chaves, a 2ª falha exige o desafio e diz com que chave montá-lo', async () => {
    const corpo = await segundaTentativa(
      { TURNSTILE_SECRET_KEY: 'seg', TURNSTILE_SITE_KEY: SITE_KEY },
      'duas'
    );
    expect(corpo.challengeRequired).toBe(true);
    // Sem a site key na resposta, a tela sabe que precisa de um desafio mas não
    // com que chave montá-lo — que é o mesmo beco sem saída por outro caminho.
    expect(corpo.challengeSiteKey).toBe(SITE_KEY);
  });

  it('só com o segredo, NÃO exige desafio — era a armadilha', async () => {
    const corpo = await segundaTentativa({ TURNSTILE_SECRET_KEY: 'seg', TURNSTILE_SITE_KEY: undefined }, 'soseg');
    expect(corpo.challengeRequired).toBe(false);
    expect(corpo.error).toContain('E-mail ou senha incorretos');
  });

  it('só com a site key, também não exige — sem segredo não há como conferir', async () => {
    const corpo = await segundaTentativa({ TURNSTILE_SECRET_KEY: undefined, TURNSTILE_SITE_KEY: SITE_KEY }, 'sosite');
    expect(corpo.challengeRequired).toBe(false);
  });

  it('sem chave nenhuma, o caminho normal segue valendo', async () => {
    const corpo = await segundaTentativa(
      { TURNSTILE_SECRET_KEY: undefined, TURNSTILE_SITE_KEY: undefined },
      'nenhuma'
    );
    expect(corpo.challengeRequired).toBe(false);
    expect(corpo.attemptsRemaining).toBe(3);
  });
});
