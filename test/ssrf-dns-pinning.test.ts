// S8 — resolveHostIsPublic fecha o DNS rebinding: resolve via DoH e recusa se
// qualquer IP resolvido for interno. fetchImpl é injetado (sem rede real).
import { describe, it, expect } from 'vitest';
import { resolveHostIsPublic } from '../src/routes/integrations';

// DoH mock: mapa host+tipo → registros {type,data}. type 1 = A, 28 = AAAA.
function dohMock(mapa: Record<string, { type: number; data: string }[]>): typeof fetch {
  return (async (url: string) => {
    const u = new URL(url);
    const name = u.searchParams.get('name')!;
    const tipo = u.searchParams.get('type')!;
    const chave = `${name}:${tipo}`;
    return {
      ok: true,
      json: async () => ({ Answer: mapa[chave] || [] }),
    } as any;
  }) as any;
}

describe('resolveHostIsPublic (S8 / DNS rebinding)', () => {
  it('host que resolve para IP público → true', async () => {
    const f = dohMock({ 'ok.example:A': [{ type: 1, data: '93.184.216.34' }], 'ok.example:AAAA': [] });
    expect(await resolveHostIsPublic('ok.example', f)).toBe(true);
  });

  it('host que resolve para IP privado (rebinding) → false', async () => {
    const f = dohMock({ 'evil.example:A': [{ type: 1, data: '169.254.169.254' }], 'evil.example:AAAA': [] });
    expect(await resolveHostIsPublic('evil.example', f)).toBe(false);
  });

  it('AAAA para loopback IPv6 → false', async () => {
    const f = dohMock({ 'v6.example:A': [], 'v6.example:AAAA': [{ type: 28, data: '::1' }] });
    expect(await resolveHostIsPublic('v6.example', f)).toBe(false);
  });

  it('AAAA IPv4-mapeado em HEX para loopback (::ffff:7f00:1) → false', async () => {
    const f = dohMock({ 'hex.example:A': [], 'hex.example:AAAA': [{ type: 28, data: '::ffff:7f00:1' }] });
    expect(await resolveHostIsPublic('hex.example', f)).toBe(false);
  });

  it('AAAA IPv4-mapeado em HEX para metadata (::ffff:a9fe:a9fe) → false', async () => {
    const f = dohMock({ 'meta.example:A': [], 'meta.example:AAAA': [{ type: 28, data: '::ffff:a9fe:a9fe' }] });
    expect(await resolveHostIsPublic('meta.example', f)).toBe(false);
  });

  it('mistura público + privado → false (basta um interno)', async () => {
    const f = dohMock({ 'mix.example:A': [{ type: 1, data: '8.8.8.8' }, { type: 1, data: '10.0.0.5' }], 'mix.example:AAAA': [] });
    expect(await resolveHostIsPublic('mix.example', f)).toBe(false);
  });

  it('sem registro A/AAAA → false (fail closed)', async () => {
    const f = dohMock({});
    expect(await resolveHostIsPublic('vazio.example', f)).toBe(false);
  });

  it('erro de resolução → false (fail closed)', async () => {
    const f = (async () => { throw new Error('DoH down'); }) as any;
    expect(await resolveHostIsPublic('erro.example', f)).toBe(false);
  });

  it('IP literal não precisa de DNS → true (já validado por isValidWebhookUrl)', async () => {
    const f = (async () => { throw new Error('não deveria resolver'); }) as any;
    expect(await resolveHostIsPublic('93.184.216.34', f)).toBe(true);
  });
});
