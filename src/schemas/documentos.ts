import { z } from 'zod';

const titulo = z.string().trim().min(1).max(300);
// 2 MB: o mesmo teto da edição de política atual (POST /controls/:id/policy).
const texto = z.string().min(1).max(2_000_000);

export const TIPOS_DOCUMENTO = ['politica', 'norma', 'procedimento'] as const;

export const documentoCriarSchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO).default('politica'),
  titulo,
  texto,
  pai_id: z.string().trim().min(1).max(100).nullish(),
  dono_parte_id: z.string().trim().min(1).max(100).nullish(),
  revisar_a_cada_meses: z.number().int().min(1).max(120).nullish(),
});
export type DocumentoCriar = z.infer<typeof documentoCriarSchema>;

export const versaoSalvarSchema = z.object({ texto, origem: z.enum(['humano', 'agente', 'gerador']).default('humano') });
