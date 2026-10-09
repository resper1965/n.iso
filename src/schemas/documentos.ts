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

/**
 * Edição de metadados do documento (nunca o texto, que é versão). `.strict()`: campo desconhecido é 400.
 * `status`: só `obsoleto` (aposentar) ou `vigente` (reativar, se houver versão vigente).
 */
export const documentoAtualizarSchema = z.object({
  titulo: titulo.optional(),
  tipo: z.enum(TIPOS_DOCUMENTO).optional(),
  pai_id: z.string().trim().min(1).max(100).nullable().optional(),
  dono_parte_id: z.string().trim().min(1).max(100).nullable().optional(),
  revisar_a_cada_meses: z.number().int().min(1).max(120).nullable().optional(),
  status: z.enum(['vigente', 'obsoleto']).optional(),
}).strict();

/** AAAA-MM-DD e uma data que existe (2027-02-30 não). Se está no passado, quem sabe do relógio é o serviço. */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD')
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'Data inexistente');
const escopo = z.string().trim().min(1).max(2000);
const motivo = z.string().trim().min(1).max(4000);

/** Exceção a documento (fatia 3.5): a quem vale, por quê e até quando. `.strict()`: campo desconhecido é 400. */
export const excecaoCriarSchema = z.object({ escopo, motivo, vence_em: dia }).strict();
export const excecaoAtualizarSchema = z.object({ escopo: escopo.optional(), motivo: motivo.optional(), vence_em: dia.optional() }).strict();
