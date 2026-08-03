import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, sha256Hex, verifyPassword, invalidateUserSessions, SESSION_TTL_SEC } from '../helpers';
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

const senhaSchema = z.object({
  password: z.string().min(1).max(500),
}).passthrough();

/** Confere a senha da conta. Usado onde a sessão sozinha não é garantia bastante. */
async function senhaConfere(c: any, userId: string, senha: string): Promise<boolean> {
  const row: any = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first();
  return !!row && (await verifyPassword(senha, row.password_hash));
}

/**
 * Etapa 1: gera o segredo e devolve o QR. NÃO ativa.
 *
 * Exige a senha: sem isso, quem rouba uma sessão de conta ainda sem MFA vincula
 * o próprio autenticador e passa a ser o dono do segundo fator — o legítimo
 * perde o acesso quando as sessões dele expiram. Vincular fator é decisão de
 * mesma gravidade que desligá-lo, e ali a senha já era exigida.
 */
mfaApp.post('/setup', async (c) => {
  const user = c.get('user');
  const valid = await validateBody(c, senhaSchema);
  if (!valid.success) return valid.response;
  if (!(await senhaConfere(c, user.id, valid.data.password))) {
    return c.json({ error: 'Senha incorreta' }, 401);
  }

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
  // Mesmo limite do /verify: aqui também se adivinha um código de 6 dígitos, e
  // quem sequestrou uma sessão antes da ativação pode martelar até casar — o
  // resultado seria MFA ligado com códigos de recuperação que só o atacante viu.
  if (!(await limiteTentativas(c, user.id))) {
    return c.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
  }

  const valid = await validateBody(c, codigoSchema);
  if (!valid.success) return valid.response;

  const row = await c.env.DB.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').bind(user.id).first<any>();
  if (!row?.totp_secret) return c.json({ error: 'Nenhum segredo gerado. Chame /setup primeiro.' }, 400);
  if (row.totp_enabled) return c.json({ error: 'MFA já está ativo' }, 409);

  if ((await verificarCodigoTotp(row.totp_secret, valid.data.codigo)) === null) {
    return c.json({ error: 'Código inválido' }, 401);
  }

  // Códigos de recuperação: perder o celular não pode significar perder o
  // acesso, e "fale com o suporte" é o elo mais fraco de qualquer MFA.
  const codigos = gerarCodigosRecuperacao();
  const hashes = (await Promise.all(codigos.map(cod => sha256Hex(cod)))).join(',');

  await c.env.DB.prepare('UPDATE users SET totp_enabled = 1, totp_recovery_hashes = ?, totp_fail_count = 0 WHERE id = ?')
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

/** Tentativas permitidas por balde de 5 minutos. */
const MAX_TENTATIVAS = 10;
const BALDE_SEG = 300;

/**
 * Contador de tentativas atômico, em D1.
 *
 * O `rateLimit` do helpers lê do KV e depois grava — duas operações, num store
 * eventualmente consistente. Sob adivinhação concorrente, N requisições leem o
 * mesmo contador e gravam o mesmo incremento: o limite de 10 vira 10 por
 * rajada, não 10 no total. Para uma senha de 6 dígitos com 3 códigos válidos
 * por janela, essa diferença é a que decide se força bruta funciona.
 *
 * Aqui o incremento é um único UPDATE — o banco serializa, nenhum incremento se
 * perde. O `batch` mantém leitura e escrita na mesma transação; mesmo que não
 * mantivesse, ler um contador maior que o real falha fechado.
 */
async function limiteTentativas(c: any, userId: string): Promise<boolean> {
  const balde = Math.floor(Date.now() / 1000 / BALDE_SEG);
  const [, leitura] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users
          SET totp_fail_count = CASE WHEN totp_fail_window = ? THEN COALESCE(totp_fail_count, 0) + 1 ELSE 1 END,
              totp_fail_window = ?
        WHERE id = ?`
    ).bind(balde, balde, userId),
    c.env.DB.prepare('SELECT totp_fail_count FROM users WHERE id = ?').bind(userId),
  ]);
  const n = Number((leitura as any)?.results?.[0]?.totp_fail_count ?? 0);
  return n <= MAX_TENTATIVAS;
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
  if (!(await limiteTentativas(c, user.id))) {
    return c.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
  }

  const valid = await validateBody(c, codigoSchema);
  if (!valid.success) return valid.response;
  const codigo = valid.data.codigo;

  const row = await c.env.DB.prepare(
    'SELECT totp_secret, totp_enabled, totp_recovery_hashes, totp_last_window FROM users WHERE id = ?'
  ).bind(user.id).first<any>();
  if (!row?.totp_enabled) return c.json({ error: 'MFA não está ativo para este usuário' }, 400);

  const janela = await verificarCodigoTotp(row.totp_secret, codigo);
  if (janela !== null) {
    // Impede reuso do MESMO código dentro da janela de 30s: um código
    // interceptado (ombro, phishing, log) valeria de novo até expirar.
    // Grava a janela QUE CASOU, não a atual do servidor — com tolerância de ±1
    // as duas divergem, e a diferença é exatamente o buraco do replay.
    if (row.totp_last_window !== null && janela <= row.totp_last_window) {
      return c.json({ error: 'Código já utilizado. Aguarde o próximo.' }, 401);
    }
    // Escrita condicional, não `WHERE id = ?` puro: entre o teste acima e este
    // UPDATE cabem duas requisições com o MESMO código, e as duas passariam.
    // A condição `totp_last_window < janela` faz o banco decidir quem chegou
    // primeiro; a segunda altera 0 linhas e é recusada como reuso.
    // Zera também o contador de tentativas — quem provou posse do fator não
    // deve carregar as falhas de digitação anteriores.
    const avanco = await c.env.DB.prepare(
      `UPDATE users SET totp_last_window = ?, totp_fail_count = 0
        WHERE id = ? AND (totp_last_window IS NULL OR totp_last_window < ?)`
    ).bind(janela, user.id, janela).run();
    if (avanco.meta?.changes !== 1) {
      return c.json({ error: 'Código já utilizado. Aguarde o próximo.' }, 401);
    }
    await promoverSessao(c);
    return c.json({ ok: true, metodo: 'totp' });
  }

  // Código de recuperação: uso único, some da lista assim que aceito.
  const hashes: string[] = (row.totp_recovery_hashes || '').split(',').filter(Boolean);
  const hashInformado = await sha256Hex(codigo.trim());
  if (hashes.includes(hashInformado)) {
    const restantes = hashes.filter(h => h !== hashInformado);
    // Escrita condicional ao valor lido: duas requisições concorrentes com o
    // MESMO código leriam a mesma lista, ambas passariam no `includes` e ambas
    // gravariam a mesma lista restante — as duas sessões promovidas por um
    // código anunciado como de uso único. Só quem alterou a linha (changes===1)
    // consumiu o código de fato; a outra volta para o fim e recebe 401.
    const res = await c.env.DB.prepare(
      'UPDATE users SET totp_recovery_hashes = ?, totp_fail_count = 0 WHERE id = ? AND totp_recovery_hashes = ?'
    ).bind(restantes.join(','), user.id, row.totp_recovery_hashes).run();

    if (res.meta?.changes === 1) {
      await logAudit(c.env.DB, 'auth.mfa_recuperacao', user.email, `Código de recuperação usado (${restantes.length} restantes)`);
      await promoverSessao(c);
      return c.json({ ok: true, metodo: 'recuperacao', codigos_restantes: restantes.length });
    }
    return c.json({ error: 'Código inválido' }, 401);
  }

  return c.json({ error: 'Código inválido' }, 401);
});

/**
 * Desativa o MFA. Exige a senha — senão uma sessão roubada desliga o 2FA.
 *
 * Nota: o authMiddleware NÃO deixa uma sessão `mfa_pending` chegar até aqui.
 * Quem tem só a senha consegue a sessão pendente; se essa sessão alcançasse
 * `/disable`, a mesma senha desligaria o segundo fator e o login seguiria sem
 * ele — o fator inteiro seria contornável com o que ele deveria complementar.
 */
mfaApp.post('/disable', async (c) => {
  const user = c.get('user');
  // O /auth/login limita por IP; aqui não passava por lá. Uma sessão roubada
  // que não traz a senha teria neste endpoint um oráculo de senha sem
  // throttling nenhum — e acertar a senha aqui desliga o segundo fator.
  if (!(await limiteTentativas(c, user.id))) {
    return c.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
  }

  const valid = await validateBody(c, senhaSchema);
  if (!valid.success) return valid.response;

  if (!(await senhaConfere(c, user.id, valid.data.password))) {
    return c.json({ error: 'Senha incorreta' }, 401);
  }

  await c.env.DB.prepare(
    'UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_recovery_hashes = NULL, totp_last_window = NULL, totp_fail_count = 0, totp_fail_window = NULL WHERE id = ?'
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
