import { decryptSecret } from './secret-crypto';
import { log } from './observability';
import type { Bindings } from './index';

/**
 * SSO por OIDC, por tenant (item 4.1 do `enterprise-grade-plan.md`).
 *
 * O motivo é operacional antes de ser de conveniência: enquanto a senha vive
 * neste banco, desligar alguém no IdP do cliente NÃO tira o acesso aqui. É a
 * pergunta que toda revisão de fornecedor faz, e a resposta honesta hoje seria
 * "alguém precisa lembrar de remover a conta".
 *
 * ESTE ARQUIVO É CÓDIGO DE AUTENTICAÇÃO. As decisões abaixo não são preferência:
 *
 * - **Só RS256/RS384/RS512.** `alg: none` é a vulnerabilidade clássica de JWT, e
 *   aceitar HS256 é pior do que parece: a chave HMAC seria o `client_secret`,
 *   que o IdP também conhece — qualquer um que o tenha forjaria um token para
 *   qualquer usuário. A lista é de PERMISSÕES, não de proibições, porque
 *   proibir por lista negra erra toda vez que surge um algoritmo novo.
 * - **`issuer` do documento de descoberta tem de bater com o configurado.** Sem
 *   isso, um documento forjado redireciona a autenticação inteira para outro
 *   emissor.
 * - **`aud` tem de ser o nosso `client_id`.** Token legítimo emitido para OUTRO
 *   aplicativo do mesmo IdP não vale aqui.
 * - **`nonce` é conferido contra o que guardamos no `state`.** É o que liga o
 *   token à requisição que o pediu.
 * - **`state` é de uso único.** Apagado do KV ao ser consumido — replay de
 *   callback não pode virar sessão nova.
 * - **PKCE (S256) mesmo com client_secret.** Custa pouco e fecha a interceptação
 *   do `code` no canal de retorno.
 * - **`email_verified` é exigido.** Sem isso, um IdP que permita cadastrar
 *   e-mail alheio sem confirmar vira um caminho de assumir a conta de outra
 *   pessoa deste tenant.
 * - **O papel nunca vem do IdP.** Vem do `papel_padrao` do tenant, e a gravação
 *   recusa papel de staff. Provisionamento automático não pode criar acesso de
 *   plataforma.
 */

/** Algoritmos aceitos na assinatura do `id_token`. Allow-list, não deny-list. */
const ALGS_ACEITOS = new Set(['RS256', 'RS384', 'RS512']);

/** Tolerância de relógio entre nós e o IdP. */
const SKEW_SEG = 120;

/** Vida do `state` no KV: o usuário tem esse tempo para concluir o login. */
const TTL_STATE_SEG = 600;

/** Cache do documento de descoberta e do JWKS. */
const TTL_DESCOBERTA_SEG = 3600;

export type ConfigSso = {
  project_id: string;
  issuer: string;
  client_id: string;
  client_secret: string;
  dominios: string;
  papel_padrao: string;
  ativo: number;
};

export type Descoberta = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function desb64url(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aleatorio(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Config de SSO ATIVA para um domínio de e-mail. */
export async function configPorDominio(env: Bindings, email: string): Promise<ConfigSso | null> {
  const dominio = (email.split('@')[1] ?? '').toLowerCase().trim();
  if (!dominio) return null;
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM project_sso WHERE ativo = 1'
    ).all<ConfigSso>();
    for (const c of results ?? []) {
      const lista = c.dominios.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
      if (lista.includes(dominio)) return c;
    }
    return null;
  } catch {
    // Migration ainda não aplicada: nenhum tenant usa SSO.
    return null;
  }
}

/**
 * Busca (e cacheia) o documento de descoberta.
 *
 * `verificarHost` é injetado para o teste não depender de DNS — em produção é o
 * `resolveHostIsPublic`, que fecha DNS rebinding. Um `issuer` é configurado por
 * humano, mas configuração errada apontando para IP interno não pode virar SSRF.
 */
export async function descobrir(
  env: Bindings,
  issuer: string,
  fetchImpl: typeof fetch = fetch,
  verificarHost?: (host: string) => Promise<boolean>
): Promise<Descoberta> {
  const chaveCache = `sso_descoberta:${issuer}`;
  const cacheado = await env.SESSIONS.get(chaveCache);
  if (cacheado) return JSON.parse(cacheado) as Descoberta;

  const url = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`);
  if (url.protocol !== 'https:') throw new Error('O issuer precisa ser https.');
  if (verificarHost && !(await verificarHost(url.hostname))) {
    throw new Error(`Host do issuer não resolve para endereço público: ${url.hostname}`);
  }

  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`Descoberta OIDC falhou: ${res.status}`);
  const doc = (await res.json()) as Partial<Descoberta>;

  // A checagem que impede documento forjado apontar para outro emissor.
  if (doc.issuer !== issuer) {
    throw new Error(`Documento de descoberta declara issuer "${doc.issuer}", esperado "${issuer}".`);
  }
  for (const campo of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (!doc[campo]) throw new Error(`Documento de descoberta sem ${campo}.`);
  }

  const d = doc as Descoberta;
  await env.SESSIONS.put(chaveCache, JSON.stringify(d), { expirationTtl: TTL_DESCOBERTA_SEG });
  return d;
}

export type PedidoAutorizacao = { url: string; state: string };

/** Monta a URL de autorização e guarda o que o callback precisa conferir. */
export async function iniciarLogin(
  env: Bindings,
  cfg: ConfigSso,
  d: Descoberta,
  redirectUri: string
): Promise<PedidoAutorizacao> {
  const state = aleatorio();
  const nonce = aleatorio();
  const verifier = aleatorio(48);
  const challenge = b64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  );

  await env.SESSIONS.put(
    `sso_state:${state}`,
    JSON.stringify({ project_id: cfg.project_id, nonce, verifier, redirectUri }),
    { expirationTtl: TTL_STATE_SEG }
  );

  const u = new URL(d.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', cfg.client_id);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');

  return { url: u.toString(), state };
}

export type EstadoGuardado = { project_id: string; nonce: string; verifier: string; redirectUri: string };

/**
 * Lê e APAGA o `state`. Uso único: replay de callback não vira sessão nova.
 */
export async function consumirState(env: Bindings, state: string): Promise<EstadoGuardado | null> {
  const chave = `sso_state:${state}`;
  const bruto = await env.SESSIONS.get(chave);
  if (!bruto) return null;
  await env.SESSIONS.delete(chave);
  return JSON.parse(bruto) as EstadoGuardado;
}

export type Claims = {
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

/**
 * Valida a assinatura e as claims do `id_token`.
 *
 * A ordem importa: assinatura ANTES de qualquer claim. Ler `iss` de um token não
 * verificado para decidir como verificá-lo é o erro que transforma a validação
 * em teatro.
 */
export async function validarIdToken(
  idToken: string,
  opcoes: { jwks: { keys: any[] }; issuer: string; clientId: string; nonce: string; agora?: number }
): Promise<Claims> {
  const partes = idToken.split('.');
  if (partes.length !== 3) throw new Error('id_token malformado.');

  const cabecalho = JSON.parse(new TextDecoder().decode(desb64url(partes[0]))) as { alg?: string; kid?: string };
  if (!cabecalho.alg || !ALGS_ACEITOS.has(cabecalho.alg)) {
    throw new Error(`Algoritmo não aceito no id_token: ${cabecalho.alg}`);
  }

  const jwk = opcoes.jwks.keys.find((k) => (cabecalho.kid ? k.kid === cabecalho.kid : true) && k.kty === 'RSA');
  if (!jwk) throw new Error('Chave do IdP não encontrada no JWKS para o kid do token.');

  const hash = { RS256: 'SHA-256', RS384: 'SHA-384', RS512: 'SHA-512' }[cabecalho.alg]!;
  const chave = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: cabecalho.alg, ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash },
    false,
    ['verify']
  );

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    chave,
    desb64url(partes[2]),
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
  );
  if (!ok) throw new Error('Assinatura do id_token inválida.');

  const claims = JSON.parse(new TextDecoder().decode(desb64url(partes[1]))) as Claims;
  const agora = Math.floor((opcoes.agora ?? Date.now()) / 1000);

  if (claims.iss !== opcoes.issuer) throw new Error(`iss inesperado: ${claims.iss}`);

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opcoes.clientId)) throw new Error('aud não corresponde ao client_id deste tenant.');

  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SEG < agora) throw new Error('id_token expirado.');
  if (typeof claims.iat === 'number' && claims.iat - SKEW_SEG > agora) throw new Error('id_token emitido no futuro.');

  if (claims.nonce !== opcoes.nonce) throw new Error('nonce não corresponde ao pedido de login.');

  if (!claims.email) throw new Error('id_token sem e-mail — não dá para ligar a uma conta.');
  if (claims.email_verified !== true) {
    throw new Error('E-mail não verificado no IdP. Aceitar isso permitiria assumir a conta de outra pessoa do tenant.');
  }

  return claims;
}

/** Troca o `code` por tokens, com PKCE. */
export async function trocarCodigo(
  d: Descoberta,
  cfg: { client_id: string; client_secret: string },
  code: string,
  verifier: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ id_token: string }> {
  const corpo = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    code_verifier: verifier,
  });
  const res = await fetchImpl(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  if (!res.ok) throw new Error(`Troca de código falhou: ${res.status}`);
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error('Resposta do IdP sem id_token.');
  return { id_token: json.id_token };
}

/** Papéis que o provisionamento automático NUNCA atribui. */
const PAPEIS_PROIBIDOS_NO_SSO = new Set(['consultor', 'consultant', 'platform_admin', 'admin']);

export function papelValidoParaSso(papel: string): boolean {
  return !PAPEIS_PROIBIDOS_NO_SSO.has(papel);
}

export type Provisionado = { id: string; email: string; role: string; client_project_id: string; criado: boolean };

/**
 * Encontra ou cria a conta (JIT).
 *
 * O papel vem do tenant, nunca do IdP. Se o cliente controla as claims que o
 * próprio IdP emite — e controla —, aceitar `role` de lá seria deixar o cliente
 * escolher o próprio nível de acesso na plataforma.
 *
 * Conta EXISTENTE não é reescopada: se o e-mail já pertence a outro projeto,
 * o login é recusado em vez de mover a pessoa de tenant. Mover conta entre
 * clientes por efeito colateral de login seria a pior forma de vazamento.
 */
export async function provisionar(
  env: Bindings,
  cfg: ConfigSso,
  claims: Claims
): Promise<Provisionado> {
  const email = claims.email!.toLowerCase().trim();

  const existente = await env.DB.prepare(
    'SELECT id, email, role, client_project_id FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; role: string; client_project_id: string | null }>();

  if (existente) {
    if (existente.client_project_id && existente.client_project_id !== cfg.project_id) {
      throw new Error('Esta conta pertence a outro cliente. Login por SSO recusado.');
    }
    if (!existente.client_project_id) {
      // Conta de staff (sem projeto) não entra por SSO de tenant: seria elevar
      // um login de cliente a acesso de plataforma.
      throw new Error('Esta conta não é de cliente. Login por SSO recusado.');
    }
    return { ...existente, client_project_id: existente.client_project_id, criado: false };
  }

  if (!papelValidoParaSso(cfg.papel_padrao)) {
    throw new Error(`papel_padrao inválido para SSO: ${cfg.papel_padrao}`);
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  // `password_hash` é NOT NULL. Grava-se um marcador que não é hash de senha
  // nenhuma — a conta existe, mas não tem senha para verificar, e o caminho de
  // login por senha falha por não bater com formato de hash algum.
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`
  ).bind(id, email, 'sso:sem-senha-local', claims.name ?? email.split('@')[0], cfg.papel_padrao, cfg.project_id).run();

  log('info', { msg: 'sso_provisionamento', projeto: cfg.project_id, papel: cfg.papel_padrao });

  return { id, email, role: cfg.papel_padrao, client_project_id: cfg.project_id, criado: true };
}

/** Decifra o `client_secret` guardado. */
export async function segredoDoCliente(env: Bindings, cfg: ConfigSso): Promise<string> {
  const chave = (env as any).TOKEN_ENC_KEY as string | undefined;
  if (!chave) throw new Error('TOKEN_ENC_KEY ausente — não é possível decifrar o client_secret do IdP.');
  return decryptSecret(cfg.client_secret, chave);
}
