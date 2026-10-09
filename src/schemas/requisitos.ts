import { z } from 'zod';

const id = z.string().trim().min(1).max(200);

/** Título do requisito (paráfrase curta própria; nunca o texto da norma). */
export const requisitoAtualizarSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
}).strict();

export const TIPOS_MAPEAMENTO = ['equivalente', 'parcial', 'relacionado'] as const;
export const ESTADOS_MAPEAMENTO = ['proposto', 'validado_juridico'] as const;

/**
 * Mapeamento entre requisitos. `validado_juridico` exige quem validou (texto) e quando (AAAA-MM-DD): a validação
 * é um ato do jurídico registrado à mão, nunca preenchido com o e-mail de quem digitou.
 */
export const mapeamentoSchema = z.object({
  de_id: id,
  para_id: id,
  tipo: z.enum(TIPOS_MAPEAMENTO),
  estado: z.enum(ESTADOS_MAPEAMENTO).default('proposto'),
  validado_por: z.string().trim().min(1).max(200).nullish(),
  validado_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD').nullish(),
  nota: z.string().trim().max(2000).nullish(),
}).strict().superRefine((v, ctx) => {
  if (v.de_id === v.para_id) ctx.addIssue({ code: 'custom', path: ['para_id'], message: 'Um requisito não se mapeia a si mesmo' });
  if (v.estado === 'validado_juridico' && (!v.validado_por || !v.validado_em)) {
    ctx.addIssue({ code: 'custom', path: ['validado_por'], message: 'Validação jurídica exige quem validou e quando' });
  }
});
export type Mapeamento = z.infer<typeof mapeamentoSchema>;

export const documentoRequisitosSchema = z.object({
  requisitos: z.array(id).max(100),
}).strict();

/** Validade da evidência (fatia 8): data AAAA-MM-DD, ou null para tirar a validade. */
export const evidenciaValidadeSchema = z.object({
  valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD').nullable(),
}).strict();
