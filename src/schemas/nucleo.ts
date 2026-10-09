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
