// Cobre a cifragem de segredos em repouso (D1/S1): round-trip, formato, IV único,
// detecção de cifrado, e o tratamento de valor legado em texto claro.
import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../src/secret-crypto';

const KEY = 'chave-de-teste-forte';

describe('secret-crypto (AES-GCM)', () => {
  it('round-trip: decifra o que cifrou', async () => {
    const enc = await encryptSecret('ghp_SUPERSECRET', KEY);
    expect(await decryptSecret(enc, KEY)).toBe('ghp_SUPERSECRET');
  });

  it('produz formato v1:<iv>:<ct> e é detectado por isEncrypted', async () => {
    const enc = await encryptSecret('x', KEY);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc.split(':').length).toBe(3);
    expect(isEncrypted(enc)).toBe(true);
    expect(isEncrypted('ghp_plaintext')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });

  it('IV aleatório: dois cifrados do mesmo texto diferem', async () => {
    const a = await encryptSecret('mesmo', KEY);
    const b = await encryptSecret('mesmo', KEY);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, KEY)).toBe('mesmo');
    expect(await decryptSecret(b, KEY)).toBe('mesmo');
  });

  it('valor legado em texto claro (sem v1:) volta como está', async () => {
    expect(await decryptSecret('ghp_legado', KEY)).toBe('ghp_legado');
  });

  it('chave errada falha ao decifrar (integridade GCM)', async () => {
    const enc = await encryptSecret('segredo', KEY);
    await expect(decryptSecret(enc, 'outra-chave')).rejects.toThrow();
  });

  it('cifrar sem chave lança', async () => {
    await expect(encryptSecret('x', '')).rejects.toThrow(/TOKEN_ENC_KEY/);
  });
});
