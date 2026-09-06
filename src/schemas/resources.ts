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


// ═════════════════════════════════════════════════════════════════════════════
//  ATUALIZAÇÃO DOS MÓDULOS — o PUT que devolvia 500 com corpo parcial
// ═════════════════════════════════════════════════════════════════════════════

/*
 * Os PUT `/:id` dos módulos montam o UPDATE coluna a coluna e passam
 * `body.campo` direto para o `.bind()`. Campo ausente vira `undefined`, e o D1
 * lança em `bind(undefined)` — ou seja, **corpo parcial devolvia 500**, não 400.
 * Não é hipótese: aconteceu com `PUT /api/v1/capa/:id` durante a escrita dos
 * testes da onda 1.
 *
 * A correção tem duas metades, e as duas importam:
 *
 *   1. O campo que o SQL exige é `.min(1)` no schema — some o 500, entra o 400
 *      dizendo QUAL campo falta.
 *   2. O campo opcional passa por `opcional()`, que converte `undefined` em
 *      `null`. Sem isso, omitir um opcional continuaria estourando no bind: o
 *      schema aceitaria, e o D1 recusaria.
 *
 * `.passthrough()` em todos: o corpo pode trazer campo que o handler ignora, e
 * recusar isso quebraria clientes que já mandam mais do que o necessário.
 */

/** `undefined` → `null`, para o valor chegar ao `.bind()` sem estourar. */
const opcional = z.string().nullish().transform((v) => v ?? null);
const numeroOpcional = z.coerce.number().nullish().transform((v) => v ?? null);

export const audiUpdateSchema = z.object({
  audit_type: z.string().min(1, 'audit_type é obrigatório'),
  title: z.string().min(1, 'Título é obrigatório'),
  scheduled_date: opcional,
  auditor_name: opcional,
  scope: opcional,
  status: z.string().min(1, 'Status é obrigatório'),
  findings_count: numeroOpcional,
  notes: opcional,
}).passthrough();

export const capaUpdateSchema = z.object({
  audit_id: opcional,
  risk_id: opcional,
  control_id: opcional,
  title: z.string().min(1, 'Título é obrigatório'),
  description: opcional,
  severity: opcional,
  assigned_to: opcional,
  due_date: opcional,
  status: z.string().min(1, 'Status é obrigatório'),
  resolution: opcional,
}).passthrough();

export const trainingUpdateSchema = z.object({
  employee_name: z.string().min(1, 'Nome do colaborador é obrigatório'),
  training_name: z.string().min(1, 'Nome do treinamento é obrigatório'),
  completion_date: opcional,
  score: numeroOpcional,
  status: opcional,
  evidence_file: opcional,
}).passthrough();

export const vendorUpdateSchema = z.object({
  name: z.string().min(1, 'Nome do fornecedor é obrigatório'),
}).passthrough();

export const riskUpdateSchema = z.object({
  asset: z.string().min(1, 'Ativo é obrigatório'),
  threat: z.string().min(1, 'Ameaça é obrigatória'),
}).passthrough();
