import { z } from 'zod';

/**
 * Schemas dos recursos de negócio. O foco é o trust boundary: campos que
 * alimentam cálculo (matriz 5x5), enums de status/severidade e campos
 * obrigatórios que hoje chegariam como undefined e violariam NOT NULL.
 * Campos livres opcionais permanecem opcionais para não quebrar clientes.
 */

// Matriz de risco 5x5: impacto e probabilidade DEVEM ser inteiros 1..5,
// senão risk_level (impact * probability) é calculado sobre lixo.
const score1to5 = z.coerce.number().int().min(1, 'Mínimo 1').max(5, 'Máximo 5');

export const createRiskSchema = z.object({
  asset: z.string().min(1, 'Ativo é obrigatório'),
  threat: z.string().min(1, 'Ameaça é obrigatória'),
  vulnerability: z.string().optional().nullable(),
  asset_id: z.string().optional().nullable(),
  impact: score1to5.optional(),
  probability: score1to5.optional(),
  treatment: z.string().optional().nullable(),
  treatment_plan: z.string().optional().nullable(),
  control_id: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  accepted_by: z.string().optional().nullable(),
  accepted_at: z.string().optional().nullable()
}).passthrough();

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  category: z.string().optional().nullable()
}).passthrough();

export const createCapaSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: z.string().optional().nullable()
}).passthrough();
