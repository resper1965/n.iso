// Cifragem de segredos em repouso (AES-256-GCM, WebCrypto — nativo no workerd).
//
// Motivação: `projects.repository_token` era gravado em texto claro no D1. O
// #107 parou de devolvê-lo nas respostas; aqui ele deixa de existir em claro no
// banco. A chave vem do secret `TOKEN_ENC_KEY` (nunca versionada); derivamos uma
// chave AES de 256 bits por SHA-256 do material — assim qualquer string forte
// serve de secret, sem exigir 32 bytes exatos.
//
// Formato do ciphertext: `v1:<base64(iv)>:<base64(ct)>`. O prefixo versiona o
// esquema e distingue de tokens LEGADOS em texto claro (sem `v1:`), que o
// caminho de leitura devolve como estão — permitindo migração incremental.

const PREFIXO = 'v1:';

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function desb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(keyMaterial: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** true se o valor já está cifrado por este módulo. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIXO);
}

/** Cifra `plaintext`. IV aleatório de 96 bits (padrão GCM) por chamada. */
export async function encryptSecret(plaintext: string, keyMaterial: string): Promise<string> {
  if (!keyMaterial) throw new Error('TOKEN_ENC_KEY ausente: não é possível cifrar o segredo');
  const key = await deriveKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${PREFIXO}${b64(iv)}:${b64(ct)}`;
}

/**
 * Decifra um valor produzido por `encryptSecret`. Se o valor NÃO tiver o prefixo
 * `v1:`, é um token legado em texto claro e é devolvido como está (migração
 * incremental — o próximo write o cifra).
 */
export async function decryptSecret(value: string, keyMaterial: string): Promise<string> {
  if (!isEncrypted(value)) return value; // legado em claro
  if (!keyMaterial) throw new Error('TOKEN_ENC_KEY ausente: não é possível decifrar o segredo');
  const partes = value.slice(PREFIXO.length).split(':');
  if (partes.length !== 2) throw new Error('Ciphertext malformado');
  const iv = desb64(partes[0]);
  const ct = desb64(partes[1]);
  const key = await deriveKey(keyMaterial);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}
