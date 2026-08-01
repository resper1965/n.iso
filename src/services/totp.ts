/**
 * TOTP (RFC 6238) para segundo fator.
 *
 * O produto audita o MFA de terceiros — `vendors.has_mfa` é um dos critérios do
 * trust score — e não tinha o próprio. Senha sozinha protege o acesso a dado
 * pessoal de terceiros sob LGPD e à trilha de auditoria de vários clientes.
 *
 * ponytail: implementado com WebCrypto, sem dependência nova. TOTP são ~60
 * linhas de HMAC e base32; uma biblioteca traria mais superfície de supply
 * chain do que código economizado, e este é justamente o caminho onde isso
 * importa.
 */

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Segredo de 20 bytes (160 bits), o tamanho recomendado pela RFC 4226. */
export function gerarSegredoTotp(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decode(s: string): Uint8Array {
  const limpo = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let valor = 0;
  const saida: number[] = [];
  for (const ch of limpo) {
    const i = ALFABETO_BASE32.indexOf(ch);
    if (i === -1) throw new Error('Segredo TOTP inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(saida);
}

/** Código de 6 dígitos para uma janela de 30 segundos. */
export async function gerarCodigoTotp(segredo: string, contador: number): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw', base32Decode(segredo) as unknown as ArrayBuffer, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(contador / 2 ** 32));
  view.setUint32(4, contador >>> 0);

  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', chave, buf));
  const offset = mac[mac.length - 1] & 0x0f;
  const truncado =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(truncado % 1_000_000).padStart(6, '0');
}

/**
 * Verifica um código, aceitando a janela anterior e a seguinte.
 *
 * A tolerância de ±1 janela (±30s) existe porque o relógio do celular do
 * usuário nunca bate exatamente com o do servidor. Sem ela, uma parcela real
 * de logins legítimos falha; com mais que isso, a janela de ataque cresce sem
 * necessidade.
 */
export async function verificarCodigoTotp(
  segredo: string,
  codigo: string,
  agoraSec = Math.floor(Date.now() / 1000),
  tolerancia = 1
): Promise<boolean> {
  const limpo = (codigo || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpo)) return false;

  const contador = Math.floor(agoraSec / 30);
  for (let d = -tolerancia; d <= tolerancia; d++) {
    const esperado = await gerarCodigoTotp(segredo, contador + d);
    // Comparação de tempo constante: são 6 dígitos, mas vazar por timing um
    // segredo de autenticação é o tipo de detalhe que só aparece no pentest.
    if (comparacaoConstante(esperado, limpo)) return true;
  }
  return false;
}

function comparacaoConstante(a: string, b: string): boolean {
  let dif = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return dif === 0;
}

/** URI otpauth:// para o QR Code do aplicativo autenticador. */
export function uriProvisionamento(segredo: string, email: string, emissor = 'nISO'): string {
  const rotulo = encodeURIComponent(`${emissor}:${email}`);
  const params = new URLSearchParams({
    secret: segredo,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${rotulo}?${params.toString()}`;
}

/**
 * Códigos de recuperação. Perder o celular não pode significar perder o acesso
 * a um sistema de conformidade — e o caminho alternativo ("fale com o suporte")
 * é o elo mais fraco de todo MFA.
 */
export function gerarCodigosRecuperacao(quantidade = 8): string[] {
  const codigos: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    codigos.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return codigos;
}
