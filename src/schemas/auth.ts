import { z } from 'zod';

/**
 * Política de senha — para senha NOVA, nunca para login.
 *
 * O sistema não tinha nenhuma: `/change-password`, `/reset-password`,
 * `/reset-password-first` e a criação de usuário aceitavam qualquer string,
 * inclusive um caractere. Num produto de GRC isso é constrangedor — é
 * exatamente o controle que os relatórios gerados aqui recomendam ao cliente.
 *
 * Oito caracteres é o piso do NIST SP 800-63B, que também desaconselha exigir
 * classes de caractere. Não há limite superior baixo de propósito: o hash é
 * PBKDF2 e frase longa é o que se quer incentivar.
 *
 * `loginSchema` NÃO usa isto: recusar no login uma senha curta já cadastrada
 * tornaria a conta inacessível sem trocar nada de segurança — quem sabe a senha
 * continua sabendo. O aperto vale na hora de definir.
 */
export const senhaNovaSchema = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .max(200, 'Senha longa demais');

/**
 * E-mail é identidade de login: grava-se e busca-se sempre em minúsculas e sem
 * espaço. Sem isto, `CEO@x.com` virava conta distinta de `ceo@x.com` (a linha da
 * matriz de Governança) e o login comparava sensível a caixa.
 */
export const emailNormalizado = () => z.string().trim().toLowerCase().email('E-mail inválido');

export const loginSchema = z.object({
  email: emailNormalizado(),
  password: z.string().min(1, 'Senha é obrigatória'),
  // Token do desafio anti-abuso. Só é exigido a partir da 2ª tentativa
  // (ver auth-policy.ts); por isso é opcional no schema.
  challengeToken: z.string().max(4096).optional()
});

export const setupSchema = z.object({
  email: emailNormalizado(),
  password: senhaNovaSchema,
  name: z.string().min(1, 'Nome é obrigatório'),
  setupKey: z.string().optional()
});

export const resetRequestSchema = z.object({
  email: emailNormalizado()
});

export const resetConfirmSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  newPassword: senhaNovaSchema
});

/** Primeiro acesso: a sessão já identifica quem é; só a senha nova vem no corpo. */
export const primeiroAcessoSchema = z.object({
  newPassword: senhaNovaSchema
});

export const mudarSenhaSchema = z.object({
  oldPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: senhaNovaSchema
});

/** Só o e-mail: a tela de login pergunta por onde este endereço entra. */
export const ssoInicioSchema = z.object({
  email: emailNormalizado(),
});

/**
 * Configuração de SSO de um tenant.
 *
 * `issuer` exige https e sem query/fragmento: o documento de descoberta é
 * montado a partir dele, e um issuer com query produziria uma URL que o IdP não
 * reconhece — falha confusa em vez de erro claro na hora de configurar.
 */
/** Papéis que o SSO de tenant pode atribuir: só de cliente. */
export const PAPEIS_SSO = ['org_admin', 'org_user', 'client'] as const;

export const ssoConfigSchema = z.object({
  issuer: z.string().url().refine(
    (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.search && !x.hash; } catch { return false; } },
    'issuer precisa ser uma URL https sem query nem fragmento'
  ),
  client_id: z.string().min(1, 'client_id é obrigatório'),
  client_secret: z.string().min(1, 'client_secret é obrigatório'),
  dominios: z.string().min(3, 'informe ao menos um domínio de e-mail'),
  // LISTA DE PERMISSÃO: o SSO de um tenant só cria conta de CLIENTE. Era `z.string()` livre, e
  // um `consultoria_admin` configurava `papel_padrao: 'consultoria_admin'` no projeto dele e o
  // login federado criava administrador de consultoria (na org_ness, pelo default da coluna).
  papel_padrao: z.enum(PAPEIS_SSO, 'papel_padrao precisa ser org_admin, org_user ou client').default('org_user'),
  ativo: z.coerce.boolean().default(false),
});
