// Logo da organização (fatia 5, tarefa 6). Arquivo enviado por usuário que vai parar dentro do
// documento entregue ao cliente: só PNG ou JPEG, reconhecidos pelos BYTES (o tipo declarado tem de
// bater), até 200 KB. SVG fica de fora de propósito: é XML com script.
import { log } from '../observability';

export const LOGO_MAX_BYTES = 200 * 1024;

export type TipoLogo = 'png' | 'jpg';
export const MIME_LOGO: Record<TipoLogo, string> = { png: 'image/png', jpg: 'image/jpeg' };

const PNG_MAGICO = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGICO = [0xff, 0xd8, 0xff];
const comeca = (b: Uint8Array, m: number[]) => b.length > m.length && m.every((x, i) => b[i] === x);

/** Tipo pelos bytes mágicos; `null` para tudo o mais (SVG, GIF, WebP, PDF, HTML, vazio, só a assinatura). */
export function tipoPelosBytes(b: Uint8Array): TipoLogo | null {
  if (comeca(b, PNG_MAGICO)) return 'png';
  if (comeca(b, JPEG_MAGICO)) return 'jpg';
  return null;
}

/**
 * `data:` URI aceito no documento. Ancorada: nada antes, nada depois, só o alfabeto base64. É a
 * última barreira antes do atributo `src` (o conteúdo congelado é JSON no banco).
 */
export const LOGO_DATA_URI = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Base64 sem estourar a pilha com `String.fromCharCode(...bytes)` (200 KB de argumentos). */
function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Lê o logo do R2 e devolve o `data:` URI, ou `undefined` (sem logo, objeto sumido, bytes que não
 * são PNG/JPEG, ou falha do R2). Falha NÃO derruba a geração da proposta: sai sem logo e registra.
 */
export async function logoComoDataUri(storage: R2Bucket, chave: string | null | undefined, orgId: string): Promise<string | undefined> {
  if (!chave) return undefined;
  try {
    // falha fechada: chave fora da pasta da própria organização não é lida
    if (!chave.startsWith(`logos/${orgId}/`)) throw new Error('chave fora da organização');
    const obj = await storage.get(chave);
    if (!obj) throw new Error('objeto ausente');
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const tipo = tipoPelosBytes(bytes);
    if (!tipo || bytes.length > LOGO_MAX_BYTES) throw new Error('conteúdo inválido');
    return `data:${MIME_LOGO[tipo]};base64,${base64(bytes)}`;
  } catch (e) {
    log('error', { msg: 'logo da organização indisponível: proposta gerada sem logo', org: orgId, erro: e instanceof Error ? e.message : 'desconhecido' });
    return undefined;
  }
}

/** Bytes do `data:` URI validado (para o Word), ou `null` se não casa ou não é PNG/JPEG de fato. */
export function bytesDoDataUri(uri: string | undefined): { tipo: TipoLogo; bytes: Uint8Array } | null {
  if (!uri || !LOGO_DATA_URI.test(uri)) return null;
  try {
    const bytes = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    const tipo = tipoPelosBytes(bytes);
    return tipo ? { tipo, bytes } : null;
  } catch { return null; }
}

/** Largura e altura em pixels (PNG: IHDR; JPEG: primeiro SOFn). `null` se não achar. */
export function dimensoes(t: TipoLogo, b: Uint8Array): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (t === 'png') return b.length >= 24 ? { w: dv.getUint32(16), h: dv.getUint32(20) } : null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
    i += 2 + dv.getUint16(i + 2);
  }
  return null;
}
