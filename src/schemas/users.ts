import { z } from 'zod';
import { senhaNovaSchema } from './auth';

export const createUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: senhaNovaSchema,
  name: z.string().min(1, 'Nome é obrigatório'),
  role: z.string().min(1, 'Papel é obrigatório'),
  client_project_id: z.string().nullable().optional()
});

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
  email: z.string().email('E-mail inválido').optional(),
  role: z.string().min(1).optional(),
  password: senhaNovaSchema.optional(),
  client_project_id: z.string().nullable().optional()
});
