import { z } from 'zod';
import { senhaNovaSchema, emailNormalizado } from './auth';

/**
 * Papéis que uma conta pode RECEBER pela API. Lista fechada: `users.role` é TEXT livre, e um papel
 * fora das listas conhecidas (`ciso`, `admin` legado) era aceito e caía em ramos imprevistos.
 * `consultoria_admin` administra uma consultoria (fatia 5); `org_admin` é o do CLIENTE. Quem pode
 * atribuir qual papel é decidido em `routes/users.ts`, não aqui.
 */
export const PAPEIS_DE_CONTA = ['platform_admin', 'consultoria_admin', 'consultor', 'comercial', 'org_admin', 'org_user', 'client'] as const;
const papel = z.enum(PAPEIS_DE_CONTA, 'Papel inválido');

// `.strict()`: campo fora do contrato (como `org_id`) é 400, não silêncio. A organização da conta é
// decidida pelo servidor (a de quem cria, ou a do projeto do cliente), nunca pelo corpo.
export const createUserSchema = z.object({
  email: emailNormalizado(),
  password: senhaNovaSchema,
  name: z.string().min(1, 'Nome é obrigatório'),
  role: papel,
  client_project_id: z.string().nullable().optional()
}).strict();

/**
 * `PUT /api/v1/admin/users/:id` lia o corpo cru — numa rota que altera `role` e
 * `client_project_id`, que são o ESCOPO DE ACESSO da pessoa. Este schema já
 * existia e não estava ligado a nada.
 *
 * `email` entrou aqui porque o handler o grava: sem o campo declarado, o Zod o
 * removeria e a alteração de e-mail pararia de funcionar em silêncio — que é o
 * modo de falha típico de ligar validação depois.
 */
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: emailNormalizado().optional(),
  role: papel.optional(),
  password: senhaNovaSchema.optional(),
  client_project_id: z.string().nullable().optional()
}).strict();
