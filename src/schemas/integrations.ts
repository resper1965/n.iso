import { z } from 'zod';

export const createWebhookSchema = z.object({
  url: z.string().url('URL inválida'),
  events: z.string().min(1, 'Eventos são obrigatórios'),
  secret: z.string().optional()
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  // Apenas papéis conhecidos: o middleware de auth decide escrita por este valor.
  permissions: z.enum(['read', 'write', 'admin']).optional(),
  expires_at: z.string().optional().nullable()
});
