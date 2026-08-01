import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, sha256Hex, verifyPassword, invalidateUserSessions, rateLimit, SESSION_TTL_SEC } from '../helpers';
import { validateBody } from '../schemas';
import { z } from 'zod';
import {
  gerarSegredoTotp, verificarCodigoTotp, uriProvisionamento, gerarCodigosRecuperacao,
} from '../services/totp';

/**
 * Segundo fator (TOTP) por usuário.
 *
 * Fluxo em duas etapas de propósito: `setup` gera o segredo mas NÃO liga o MFA;
 * só `activate`, com um código válido em mãos, liga. Ligar direto no setup
 * tranca para fora quem escaneou o QR errado ou está com o relógio fora de
 * hora — e recuperar isso exige acesso ao banco.
 */
export const mfaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const codigoSchema = z.object({
  codigo: z.string().trim().min(6).max(20),
}).passthrough();

const desativarSchema = z.object({
  password: z.string().min(1).max(500),
}).passthrough();

/** Etapa 1: gera o segredo e devolve o QR. NÃO ativa. */
mfaApp.post('/setup', async (c) => {
  const user = c.get('user');
  const atual = await c.env.DB.prepare('SELECT totp_enabled FROM users WHERE id = ?').bind(user.id).first<any>();
  if (atual?.totp_enabled) {
    return c.json({ error: 'MFA já está ativo. Desative antes de gerar um novo segredo.' }, 409);
  }

  const segredo = gerarSegredoTotp();
  await c.env.DB.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')
    .bind(segredo, user.id).run();

  return c.json({
    ok: true,
    secret: segredo,
    otpauth_url: uriProvisionamento(segredo, user.email),
    proximo_passo: 'Escaneie o QR e confirme um código em /api/v1/auth/mfa/activate para ativar.',
  });
});

/** Etapa 2: confirma um código e ativa. Devolve os códigos de recuperação. */
mfaApp.post('/activate', async (c) => {
  const user = c.get('user');
  const valid = await validateBody(c, codigoSchema);
  if (!valid.success) return valid.response;

  const row = await c.env.DB.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').bind(user.id).first<any>();
  if (!row?.totp_secret) return c.json({ error: 'Nenhum segredo gerado. Chame /setup primeiro.' }, 400);
  if (row.totp_enabled) return c.json({ error: 'MFA já está ativo' }, 409);

  if (!(await verificarCodigoTotp(row.totp_secret, valid.data.codigo))) {
    return c.json({ error: 'Código inválido' }, 401);
  }

  // Códigos de recuperação: perder o celular não pode significar perder o
  // acesso, e "fale com o suporte" é o elo mais fraco de qualquer MFA.
  const codigos = gerarCodigosRecuperacao();
  const hashes = (await Promise.all(codigos.map(cod => sha256Hex(cod)))).join(',');

  await c.env.DB.prepare('UPDATE users SET totp_enabled = 1, totp_recovery_hashes = ? WHERE id = ?')
    .bind(hashes, user.id).run();
  await logAudit(c.env.DB, 'auth.mfa_ativado', user.email, 'Segundo fator TOTP ativado');

  return c.json({
    ok: true,
    recovery_codes: codigos,
    aviso: 'Guarde estes códigos agora. Eles não podem ser exibidos novamente.',
  });
});

/**
 * Remove `mfa_pending` da sessão em curso: até aqui ela só podia falar com
 * /auth/mfa/*. Reescreve as duas chaves que o login grava.
 */
async function promoverSessao(c: any): Promise<void> {
  const id = c.get('sessionId');
  if (!id) return;
  const bruto = (await c.env.SESSIONS.get(`session_${id}`)) || (await c.env.SESSIONS.get(id));
  if (!bruto) return;
  const sessao = JSON.parse(bruto);
  delete sessao.mfa_pending;
  const corpo = JSON.stringify(sessao);
  await c.env.SESSIONS.put(`session_${id}`, corpo, { expirationTtl: SESSION_TTL_SEC });
  await c.env.SESSIONS.put(id, corpo, { expirationTtl: SESSION_TTL_SEC });
}

/**
 * Verifica o segundo fator após o login com senha.
 *
 * Rate limit por usuário: 6 dígitos são 10^6 combinações, e a janela de 30s com
 * tolerância de ±1 deixa 3 códigos válidos por vez. Sem limite, força bruta
 * dentro de uma janela é viável.
 */
mfaApp.post('/verify', async (c) => {
  const user = c.get('user');
  if (!(await rateLimit(c.env.SESSIONS, `mfa:${user.id}`, 10, 300))) {
    return c.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
  }

  const valid = await validateBody(c, codigoSchema);
  if (!valid.success) return valid.response;
  const codigo = valid.data.codigo;

  const row = await c.env.DB.prepare(
    'SELECT totp_secret, totp_enabled, totp_recovery_hashes, totp_last_window FROM users WHERE id = ?'
  ).bind(user.id).first<any>();
  if (!row?.totp_enabled) return c.json({ error: 'MFA não está ativo para este usuário' }, 400);

  const janela = Math.floor(Date.now() / 1000 / 30);
  if (await verificarCodigoTotp(row.totp_secret, codigo)) {
    // Impede reuso do MESMO código dentro da janela de 30s: um código
    // interceptado (ombro, phishing, log) valeria de novo até expirar.
    if (row.totp_last_window !== null && janela <= row.totp_last_window) {
      return c.json({ error: 'Código já utilizado. Aguarde o próximo.' }, 401);
    }
    await c.env.DB.prepare('UPDATE users SET totp_last_window = ? WHERE id = ?').bind(janela, user.id).run();
    await promoverSessao(c);
    return c.json({ ok: true, metodo: 'totp' });
  }

  // Código de recuperação: uso único, some da lista assim que aceito.
  const hashes: string[] = (row.totp_recovery_hashes || '').split(',').filter(Boolean);
  const hashInformado = await sha256Hex(codigo.trim());
  if (hashes.includes(hashInformado)) {
    const restantes = hashes.filter(h => h !== hashInformado);
    await c.env.DB.prepare('UPDATE users SET totp_recovery_hashes = ? WHERE id = ?')
      .bind(restantes.join(','), user.id).run();
    await logAudit(c.env.DB, 'auth.mfa_recuperacao', user.email, `Código de recuperação usado (${restantes.length} restantes)`);
    await promoverSessao(c);
    return c.json({ ok: true, metodo: 'recuperacao', codigos_restantes: restantes.length });
  }

  return c.json({ error: 'Código inválido' }, 401);
});

/** Desativa o MFA. Exige a senha — senão uma sessão roubada desliga o 2FA. */
mfaApp.post('/disable', async (c) => {
  const user = c.get('user');
  const valid = await validateBody(c, desativarSchema);
  if (!valid.success) return valid.response;

  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<any>();
  if (!row || !(await verifyPassword(valid.data.password, row.password_hash))) {
    return c.json({ error: 'Senha incorreta' }, 401);
  }

  await c.env.DB.prepare(
    'UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_recovery_hashes = NULL, totp_last_window = NULL WHERE id = ?'
  ).bind(user.id).run();

  // Desligar o segundo fator rebaixa a segurança da conta: as sessões abertas
  // foram estabelecidas sob a garantia antiga e não devem sobreviver.
  await invalidateUserSessions(c.env.SESSIONS, user.id);
  await logAudit(c.env.DB, 'auth.mfa_desativado', user.email, 'Segundo fator TOTP desativado');

  return c.json({ ok: true });
});

/** Estado do MFA do próprio usuário. Nunca devolve o segredo. */
mfaApp.get('/status', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT totp_enabled, totp_recovery_hashes FROM users WHERE id = ?'
  ).bind(user.id).first<any>();
  return c.json({
    ok: true,
    ativo: !!row?.totp_enabled,
    codigos_recuperacao_restantes: (row?.totp_recovery_hashes || '').split(',').filter(Boolean).length,
  });
});
