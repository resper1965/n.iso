import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
  name: z.string().min(1, 'Nome é obrigatório'),
  role: z.string().min(1, 'Papel é obrigatório'),
  client_project_id: z.string().nullable().optional()
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  password: z.string().optional(),
  client_project_id: z.string().nullable().optional()
});
