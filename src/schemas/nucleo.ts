import { z } from 'zod';

export const MODULOS = ['iso', 'privacy'] as const;
export type Modulo = (typeof MODULOS)[number];

/** `organizations.modulos_contratados` é JSON gravado pela rota validada; JSON ruim cai no padrão. */
export function parseModulos(bruto: string | null | undefined): Modulo[] {
  try {
    const v: unknown = JSON.parse(bruto ?? '[]');
    const ok = Array.isArray(v) ? MODULOS.filter((m) => v.includes(m)) : [];
    return ok.length ? ok : ['iso'];
  } catch {
    return ['iso'];
  }
}

export const moduloHabilitarSchema = z.object({ habilitado: z.boolean() });
export const orgModulosSchema = z.object({ modulos: z.array(z.enum(MODULOS)).min(1).max(MODULOS.length) });

export const PAPEIS_VINCULO = ['encarregado', 'dono_processo', 'dono_sistema', 'operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel', 'parte_interessada'] as const;
export const ALVOS_VINCULO = ['projeto', 'item', 'departamento', 'tratamento', 'parte'] as const;
export type PapelVinculo = (typeof PAPEIS_VINCULO)[number];
export type AlvoVinculo = (typeof ALVOS_VINCULO)[number];

/** Que papel faz sentido em que alvo. Decisão do plano da fatia 1.1: a spec fixa os dois conjuntos, não o cruzamento. */
export const MATRIZ_PAPEL_ALVO: Record<AlvoVinculo, readonly PapelVinculo[]> = {
  projeto: ['encarregado', 'terceiro', 'operador', 'cocontrolador', 'parte_interessada', 'responsavel'],
  departamento: ['responsavel'],
  parte: ['suboperador'],
  item: ['dono_sistema', 'dono_processo', 'responsavel', 'operador'],
  tratamento: ['operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel'],
};

const nome = z.string().trim().min(1).max(200);
const email = z.string().trim().email().max(320);

export const departamentoCriarSchema = z.object({ nome });
export const departamentoAtualizarSchema = z.object({ nome: nome.optional(), status: z.enum(['ativo', 'inativo']).optional() });
export const parteCriarSchema = z.object({ tipo: z.enum(['pessoa', 'organizacao']).default('pessoa'), nome, email: email.optional().nullable() });
export const parteAtualizarSchema = z.object({ nome: nome.optional(), email: email.optional().nullable(), status: z.enum(['ativa', 'inativa']).optional() });
export const vinculoCriarSchema = z.object({ papel: z.enum(PAPEIS_VINCULO), alvo_tipo: z.enum(ALVOS_VINCULO), alvo_id: z.string().trim().min(1).max(100) });
