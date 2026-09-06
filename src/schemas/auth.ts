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

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

export const setupSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: senhaNovaSchema,
  name: z.string().min(1, 'Nome é obrigatório'),
  setupKey: z.string().optional()
});

export const resetRequestSchema = z.object({
  email: z.string().email('E-mail inválido')
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
  email: z.string().email('E-mail inválido'),
});

/**
 * Configuração de SSO de um tenant.
 *
 * `issuer` exige https e sem query/fragmento: o documento de descoberta é
 * montado a partir dele, e um issuer com query produziria uma URL que o IdP não
 * reconhece — falha confusa em vez de erro claro na hora de configurar.
 */
export const ssoConfigSchema = z.object({
  issuer: z.string().url().refine(
    (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.search && !x.hash; } catch { return false; } },
    'issuer precisa ser uma URL https sem query nem fragmento'
  ),
  client_id: z.string().min(1, 'client_id é obrigatório'),
  client_secret: z.string().min(1, 'client_secret é obrigatório'),
  dominios: z.string().min(3, 'informe ao menos um domínio de e-mail'),
  papel_padrao: z.string().min(1).default('org_user'),
  ativo: z.coerce.boolean().default(false),
});
