import { z } from 'zod';

/**
 * Schemas das escritas de domínio.
 *
 * Regra adotada: campo que o INSERT grava como NOT NULL é obrigatório aqui, e
 * todo texto tem teto de tamanho. Sem isso, campo faltando virava 500 no
 * SQLite ("NOT NULL constraint failed") em vez de 400 — erro de cliente
 * reportado como erro de servidor, que polui log e esconde abuso.
 *
 * Campos opcionais permanecem opcionais: o objetivo é recusar o inválido, não
 * quebrar cliente que já funciona.
 */

/** Texto curto (nome, título, status). Teto evita encher o D1 com um POST. */
const curto = z.string().trim().min(1).max(500);
const curtoOpcional = z.string().trim().max(500).optional().nullable();
/** Texto longo (descrição, justificativa, conteúdo). */
const longo = z.string().max(50_000);
const longoOpcional = z.string().max(50_000).optional().nullable();
const idOpcional = z.string().max(200).optional().nullable();
/**
 * Aceita o que os clientes de fato mandam para um booleano — o formulário envia
 * 0/1 numérico, o MCP envia true/false, e alguns campos chegam como string.
 *
 * A normalização é o ponto: sem ela, `"false"` e `"0"` são strings NÃO-VAZIAS e
 * portanto truthy, então `valor ? 1 : 0` gravava 1 para quem respondeu "não".
 */
const boolLike = z
  .union([z.boolean(), z.number(), z.string()])
  .optional()
  .nullable()
  .transform(v => {
    if (v === undefined || v === null) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    const t = v.trim().toLowerCase();
    return t === 'true' || t === '1' || t === 'sim' || t === 'yes';
  });

// ─── ROPA (LGPD / ISO 27701) ─────────────────────────────────────────────────
// A tabela guarda dado pessoal de titulares dos clientes. Campo obrigatório que
// chega vazio produz registro de tratamento incompleto — e um ROPA incompleto é
// não conformidade em auditoria, não só um bug.
export const ropaSchema = z.object({
  // Só este é obrigatório: as demais colunas são NULLABLE em schema.sql e o
  // formulário do produto (privacy.js) só barra a ausência desta. Exigir as
  // outras devolveria 400 em submissão que sempre funcionou.
  processing_purpose: curto,
  data_categories: curtoOpcional,
  data_subjects: curtoOpcional,
  legal_basis: curtoOpcional,
  retention_period: curtoOpcional,
  recipients: curtoOpcional,
  // INTEGER no banco; o frontend manda 0 ou 1. Exigir string aqui fazia TODA
  // criação de ROPA pela UI falhar com 400 antes de chegar ao INSERT.
  international_transfers: boolLike,
  transfer_safeguards: curtoOpcional,
  consent_details: longoOpcional,
  data_subject_rights_details: longoOpcional,
  dpia_required: boolLike,
  owner: curtoOpcional,
  // 'Approved' fica de fora de propósito (como na DPIA): aprovar exige senha, autoridade na matriz de
  // Governança e segregação, e isso só existe em POST .../approve e nos pedidos de aprovação.
  // Active/Inactive é o ciclo de vida da atividade de tratamento, que convive com o status de aprovação.
  status: z.enum(['Draft', 'Under Review', 'Active', 'Inactive'], {
    error: "status aceita 'Draft', 'Under Review', 'Active' ou 'Inactive'. 'Approved' só pelo fluxo de aprovação (assinatura do Líder SGSI e da Direção), não pela edição.",
  }).optional().nullable(),
}).passthrough();

export const ropaApprovalSchema = z.object({
  role: z.enum(['ciso', 'ceo']),
}).passthrough();

// Aprovação de DPIA: mesmo contrato da de ROPA (F9).
export const dpiaApprovalSchema = ropaApprovalSchema;

// ─── Treinamento ─────────────────────────────────────────────────────────────
export const trainingSchema = z.object({
  employee_name: curto,
  training_name: curto,
  completion_date: curtoOpcional,
  score: z.number().min(0).max(100).optional().nullable(),
  status: curtoOpcional,
  evidence_file: curtoOpcional,
}).passthrough();

export const trainingImportSchema = z.object({
  records: z.array(
    z.object({
      employee_name: curto,
      training_name: curto,
      completion_date: curtoOpcional,
      score: z.number().min(0).max(100).optional().nullable(),
      status: curtoOpcional,
    })
  ).min(1).max(5000), // teto: import é o caminho de maior volume do produto
}).passthrough();

// ─── CRM ─────────────────────────────────────────────────────────────────────
export const leadSchema = z.object({
  company_name: curto,
  contact_name: curtoOpcional,
  contact_email: z.string().email().max(320).or(z.literal('')).optional().nullable(),
  source: curtoOpcional,
  cnpj: z.string().max(20).optional().nullable(),
  // Dados cadastrais vindos da consulta de CNPJ. O INSERT gravava todos sem
  // teto: são identidade de empresa e endereço, exatamente o que este PR diz
  // priorizar.
  razao_social: curtoOpcional,
  nome_fantasia: curtoOpcional,
  natureza_juridica: curtoOpcional,
  porte: curtoOpcional,
  capital_social: z.number().nonnegative().optional().nullable(),
  cnae_fiscal: z.union([z.number(), z.string().max(20)]).optional().nullable(),
  cnae_fiscal_descricao: curtoOpcional,
  data_inicio_atividade: curtoOpcional,
  situacao_cadastral: curtoOpcional,
  logradouro: curtoOpcional,
  numero: curtoOpcional,
  complemento: curtoOpcional,
  bairro: curtoOpcional,
  municipio: curtoOpcional,
  uf: z.string().trim().max(2).optional().nullable(),
  cep: z.string().trim().max(20).optional().nullable(),
  telefone: curtoOpcional,
  // Quadro societário: nomes de sócios, dado pessoal. Teto no tamanho da lista.
  // `z.record` com chave E valor: a forma de um argumento só não deixou de
  // existir no zod 4, e esta assinatura vale nas duas versões. Sem isto, o
  // bump para o zod 4 não compila.
  qsa: z.array(z.record(z.string(), z.unknown())).max(200).optional().nullable(),
}).passthrough();

export const LEAD_STATUS = ['New', 'Assessment', 'Proposal', 'Won', 'Lost'] as const;
export const leadStatusSchema = z.object({ status: z.enum(LEAD_STATUS) }).passthrough();

export const cnpjSchema = z.object({
  // Aceita com ou sem pontuação: o handler normaliza com replace(/\D/g,'')
  // logo em seguida, e o formato 12.345.678/0001-90 é o que o usuário digita.
  // Validar o valor normalizado, não o texto cru.
  cnpj: z.string().trim().refine(v => v.replace(/\D/g, '').length === 14, 'CNPJ deve ter 14 dígitos'),
}).passthrough();

export const proposalSchema = z.object({
  lead_id: curto,
  // Exigido pelo handler; declarar opcional aqui produziria duas mensagens de
  // erro diferentes para a mesma falta.
  assessment_id: curto,
  total_price: z.number().nonnegative(),
  content_html: longoOpcional,
}).passthrough();

export const proposalUpdateSchema = z.object({
  content_html: longoOpcional,
  status: curtoOpcional,
}).passthrough();

// ─── Governança ──────────────────────────────────────────────────────────────
export const stakeholderSchema = z.object({
  name: curto,
  type: curtoOpcional,
  category: curtoOpcional,
  requirements: longoOpcional,
  influence: curtoOpcional,
  communication_method: curtoOpcional,
}).passthrough();

export const governanceMemberSchema = z.object({
  name: curto,
  // Opcional no formulário (monitor.js), nullable no banco, e o handler grava
  // `email || null`. O formulário manda string vazia quando não preenchido —
  // por isso `.or(literal(''))` e não só `.optional()`.
  email: z.string().email().max(320).or(z.literal('')).optional().nullable(),
  // O handler já recusa a ausência destes; deixá-los opcionais no schema faria
  // o schema mentir sobre o contrato real.
  role_category: curto,
  job_title: curto,
  is_primary: boolLike,
}).passthrough();

export const companyProfileSchema = z.object({
  cnpj: z.string().max(20).optional().nullable(),
  employee_count: z.number().int().nonnegative().optional().nullable(),
  scope: longoOpcional,
  sector: curtoOpcional,
  client_name: curtoOpcional,
}).passthrough();

export const contextSchema = z.object({
  internal_strengths: longoOpcional,
  internal_weaknesses: longoOpcional,
  external_opportunities: longoOpcional,
  external_threats: longoOpcional,
  legal_requirements: longoOpcional,
  contractual_requirements: longoOpcional,
  notes: longoOpcional,
}).passthrough();

export const auditFindingSchema = z.object({
  project_id: curto,
  control_id: curtoOpcional,
  finding_type: curto,
  description: longo.min(1),
  evidence_reviewed: longoOpcional,
  auditor_notes: longoOpcional,
}).passthrough();

export const auditFindingUpdateSchema = z.object({
  description: longoOpcional,
  auditor_notes: longoOpcional,
  status: curtoOpcional,
}).passthrough();

// ─── Evidência e conteúdo ────────────────────────────────────────────────────
export const evidenceContentSchema = z.object({
  content: longo,
}).passthrough();

export const evidenceEvaluateSchema = z.object({
  text: longo.optional(),
}).passthrough();

// ─── Assinatura eletrônica ───────────────────────────────────────────────────
// A senha é o segundo fator do ato de assinar; sem ela o handler já recusava,
// mas com 400 vindo do banco em vez de validação explícita.
export const assinaturaSchema = z.object({
  password: z.string().min(1).max(500),
  role: z.enum(['ciso', 'ceo']).optional(),
  project_id: idOpcional,
}).passthrough();

// ─── IA ──────────────────────────────────────────────────────────────────────
export const chatSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
}).passthrough();

export const gerarPoliticaSchema = z.object({
  control_id: idOpcional,
  controlId: idOpcional,
}).passthrough();

export const ingestSchema = z.object({
  title: curto,
  content: longo.min(1),
  source: curtoOpcional,
}).passthrough();

// ─── Auditor externo ─────────────────────────────────────────────────────────
export const auditorNoteSchema = z.object({
  control_id: curtoOpcional,
  note_type: curtoOpcional,
  content: z.string().trim().min(1).max(20_000),
}).passthrough();

export const auditorResponseSchema = z.object({
  response: z.string().trim().min(1).max(20_000),
}).passthrough();

// ─── Certificação ────────────────────────────────────────────────────────────
export const certificationSchema = z.object({
  stage: curtoOpcional,
  status: curtoOpcional,
  target_date: curtoOpcional,
  notes: longoOpcional,
  // Estes o handler grava e o schema não declarava: com `.passthrough()` eles
  // chegavam ao UPDATE sem teto de tamanho nenhum.
  standard: curtoOpcional,
  stage1_date: curtoOpcional,
  stage1_status: curtoOpcional,
  stage2_date: curtoOpcional,
  stage2_status: curtoOpcional,
  certificate_number: curtoOpcional,
  certificate_expiry: curtoOpcional,
  registrar: curtoOpcional,
}).passthrough();

// ─── Projetos ────────────────────────────────────────────────────────────────
export const projectPhaseSchema = z.object({
  status: curtoOpcional,
  notes: longoOpcional,
}).passthrough();

export const interviewSchema = z.object({
  answers: z.array(
    z.object({
      track: curto,
      question: longo.min(1),
      answer: longo,
      interviewee: curtoOpcional,
      gap_detected: boolLike,
    })
  ).min(1).max(1000),
}).passthrough();

export const evidenceMetaSchema = z.object({
  file_name: curtoOpcional,
  evaluation_notes: longoOpcional,
}).passthrough();

export const scopeChangeSchema = z.object({
  change_description: longo.min(1),
  // `scope_changes.reason` é nullable e o handler grava `reason || null`;
  // exigir aqui recusaria requisição que sempre funcionou.
  reason: longoOpcional,
  impact_analysis: longoOpcional,
  requested_by: curtoOpcional,
}).passthrough();

export const auditorTokenSchema = z.object({
  // Token de auditor externo: prazo aberto é acesso perpétuo a evidência.
  days_valid: z.number().int().min(1).max(365).optional(),
}).passthrough();

export const controlUpdateSchema = z.object({
  status: curtoOpcional,
  title: curtoOpcional,
  description: longoOpcional,
  // `owner` é metadado organizacional (responsável pelo controle). Gravável por
  // este endpoint sob o mesmo modelo de permissão; não toca status, aprovações
  // (ciso_/ceo_) nem maturity. Aceita string vazia p/ limpar o responsável.
  owner: curtoOpcional,
}).passthrough();

export const maturitySchema = z.object({
  maturity: z.number().int().min(0).max(5), // CMM 0-5; fora disso é dado corrompido
}).passthrough();

export const statusSchema = z.object({ status: curto }).passthrough();

// ─── Auditoria, ativos e DPIA ────────────────────────────────────────────────
// Estes quatro nasceram para fechar os writes que liam `c.req.json<any>()` e
// gravavam direto. Mesma regra do resto do arquivo: o que o INSERT grava como
// NOT NULL é obrigatório, todo texto tem teto, campo desconhecido passa.

export const auditScheduleSchema = z.object({
  // NOT NULL em `audit_schedule`: sem eles o INSERT vira 500 do SQLite.
  audit_type: curto,
  title: curto,
  scheduled_date: curto,
  auditor_name: curtoOpcional,
  scope: longoOpcional,
  status: curtoOpcional,
  findings_count: z.coerce.number().int().min(0).max(100_000).optional().nullable(),
  notes: longoOpcional,
}).passthrough();

/** Notas de 1..5 do trio C-I-D do ativo; fora disso é dado corrompido. */
const notaCID = z.coerce.number().int().min(1).max(5).optional().nullable();

export const assetSchema = z.object({
  name: curto, // NOT NULL em `assets`
  type: curtoOpcional,
  category: curtoOpcional,
  classification: curtoOpcional,
  criticality: curtoOpcional,
  description: longoOpcional,
  owner: curtoOpcional,
  location: curtoOpcional,
  confidentiality_rating: notaCID,
  integrity_rating: notaCID,
  availability_rating: notaCID,
}).passthrough();

/**
 * Update parcial de ativo: o handler monta o SET só com os campos presentes, e
 * responde 400 quando nenhum veio. Por isso `name` é opcional AQUI — mas
 * continua tendo que ser texto quando vem, que é o que faltava.
 */
export const assetUpdateSchema = assetSchema.partial();

export const dpiaSchema = z.object({
  // Nenhuma coluna de `dpia_assessments` é NOT NULL — então nada é obrigatório.
  // O que este schema acrescenta é tipo e teto: sem eles, um POST enchia o D1.
  ropa_id: idOpcional,
  processing_name: longoOpcional,
  data_category_risk: longoOpcional,
  necessity_proportionality: longoOpcional,
  technical_measures: longoOpcional,
  residual_risk_level: curtoOpcional,
  dpo_recommendations: longoOpcional,
  // 'Approved' fica de fora de propósito: aprovar exige senha, autoridade na matriz de Governança e
  // segregação, e isso só existe em POST .../approve e nos pedidos de aprovação. Assinaturas
  // (dpo_signature, ceo_signature, dpo_approved_*) passam pelo passthrough mas a rota não as grava.
  status: z.enum(['Draft', 'Under Review'], {
    error: "status aceita 'Draft' ou 'Under Review'. Aprovar a DPIA é pelo fluxo de aprovação (assinatura do DPO e da Direção), não pela edição.",
  }).optional().nullable(),
}).passthrough();

// ——— Documentos legais ————————————————————————————————————————————————
// A classificação é enum fechado de propósito: é ela que decide se uma versão
// nova avisa ou barra o acesso, e um valor livre ali viraria bloqueio por
// digitação errada (ou a ausência dele, por engano).
export const legalPublishSchema = z.object({
  kind: curto,
  version: curto,
  classification: z.enum(['comum', 'material']),
  title: curto,
  url: curtoOpcional,
  /** false publica como rascunho: fica fora da conta de pendências. */
  publish: z.boolean().optional(),
}).passthrough();

/** Desfazer de uma operação da trilha por campo: só o id da operação. */
export const trilhaDesfazerSchema = z.object({
  operacao: z.string().trim().min(1).max(100),
}).passthrough();

export const legalAcceptSchema = z.object({
  // Teto baixo porque a tela aceita dois documentos; mil ids num POST é abuso,
  // não uso.
  documentIds: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
}).passthrough();

// ═════════════════════════════════════════════════════════════════════════════
//  PORTAL PÚBLICO DE POLÍTICAS — rotas SEM autenticação
// ═════════════════════════════════════════════════════════════════════════════

/*
 * As três rotas abaixo eram lidas com `c.req.json()` cru e conferidas com
 * `if (!campo)`. Isso aceita QUALQUER tipo desde que não seja vazio, e os
 * handlers chamam `email.trim().toLowerCase()` logo depois — então
 * `{"email": 123}` num endpoint público derrubava a requisição em 500 no
 * `trim is not a function`. Recusar com 400 é o comportamento certo, e é o que
 * a validação faz.
 */

export const otpPedidoSchema = z.object({
  project_id: z.string().min(1, 'Projeto é obrigatório'),
  email: z.string().email('E-mail inválido'),
  name: z.string().optional(),
});

export const otpVerificacaoSchema = z.object({
  project_id: z.string().min(1, 'Projeto é obrigatório'),
  email: z.string().email('E-mail inválido'),
  otp: z.string().min(1, 'Código OTP é obrigatório'),
});

/** Aceite de política. Nome e e-mail caem para os da sessão quando ausentes. */
export const aceiteDePoliticaSchema = z.object({
  policy_type: z.string().min(1, 'Tipo/Nome da Política é obrigatório'),
  user_name: z.string().optional(),
  user_email: z.string().email('E-mail inválido').optional(),
});

// ═════════════════════════════════════════════════════════════════════════════
//  MFA e direitos do titular — eram locais aos arquivos de rota
// ═════════════════════════════════════════════════════════════════════════════

/*
 * Estes três viviam como `const` não exportada dentro de `routes/mfa.ts` e
 * `routes/data-subject.ts`. Vieram para cá quando o `openapi.ts` passou a
 * precisar deles: schema que só existe dentro do handler não entra no contrato
 * publicado, e a rota sumiria da documentação sem que nada acusasse.
 *
 * `.passthrough()` é deliberado nos três — o corpo pode trazer campos extras que
 * o handler ignora — e por isso o JSON Schema gerado sai com
 * `additionalProperties: true`, que é a descrição correta.
 */

/** Código TOTP ou de recuperação. */
export const codigoSchema = z.object({
  codigo: z.string().trim().min(6).max(20),
}).passthrough();

/** Confirmação de senha onde a sessão sozinha não basta (desligar MFA, por ex.). */
export const senhaConfirmacaoSchema = z.object({
  password: z.string().min(1).max(500),
}).passthrough();

/** Pedido de direito do titular (LGPD): quem é, e por quê. */
export const identificadorSchema = z.object({
  identificador: z.string().trim().min(1).max(320),
  justificativa: z.string().trim().min(1).max(2000),
}).passthrough();

// ═════════════════════════════════════════════════════════════════════════════
//  POLÍTICA DE SEGURANÇA POR TENANT (item 4.3)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O `sessao_ttl_seg` tem PISO de 5 minutos: um TTL de poucos segundos, digitado
 * por engano, expulsaria todo mundo do cliente a cada requisição, e o caminho de
 * conserto passa por uma sessão. O teto de 24h é o máximo da plataforma — a
 * política aperta, nunca afrouxa.
 */
export const politicaTenantSchema = z.object({
  mfa_obrigatorio: z.coerce.boolean().optional(),
  sessao_ttl_seg: z.coerce.number().int().min(300, 'TTL mínimo é 300 s').max(86400, 'TTL máximo é 86400 s').nullish(),
  ip_allowlist: z.string().max(2000).nullish(),
}).passthrough();

// Configuração comercial da organização (PUT parcial: tudo opcional). Texto é guardado cru;
// o escape acontece só na saída para HTML.
const valorDiaria = z.number().positive().max(100_000);
export const configOrgSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  cnpj: z.string().trim().regex(/^\d{14}$/, 'CNPJ com 14 dígitos, só números').nullable().optional(),
  corDestaque: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #rrggbb').optional(),
  seloNiso: z.boolean().optional(),
  prefixoProposta: z.string().regex(/^[A-Z0-9]{2,10}$/, 'Prefixo com 2 a 10 letras maiúsculas ou números').optional(),
  proximoNumero: z.number().int().min(1).optional(),
  preco: z.object({
    diaria: z.object({ '1': valorDiaria, '2': valorDiaria, '3': valorDiaria }).partial().optional(),
    porte: z.array(z.object({ maxPessoas: z.number().int().positive().nullable(), fator: z.number().min(0.5).max(5) })).min(1).max(8)
      .refine((fs) => fs.every((f, i) => (i === fs.length - 1 ? f.maxPessoas === null : f.maxPessoas !== null && (i === 0 || f.maxPessoas > fs[i - 1].maxPessoas!))),
        'Porte: o limite de pessoas precisa crescer a cada faixa, e só a última faixa (sem limite) fica em branco').optional(),
    tetoDesconto: z.number().min(0).max(50).optional(),
    custoInterno: z.object({ '1': valorDiaria, '2': valorDiaria, '3': valorDiaria }).partial().optional(),
    overheadPct: z.number().min(0).max(1).optional(),
    tributosPct: z.number().min(0).max(0.6).optional(),
    margemAlvo: z.number().min(0).max(1).optional(),
  }).optional(),
  textos: z.object({
    sobre: z.string().max(4000), comoTrabalhamos: z.string().max(6000), equipe: z.string().max(4000),
    termos: z.string().max(30000), premissas: z.string().max(6000), pagamentoPadrao: z.string().max(500),
  }).partial().optional(),
  secoesDesligadas: z.array(z.enum(['como_trabalhamos', 'responsabilidades'])).max(2).optional(),
}).strict();

// Provisionamento de organização (fatia 5): só o platform_admin. A organização nasce com a
// configuração padrão e SEM termos comerciais (o administrador dela escreve os dele); o termo de uso
// da consultoria é registrado pela versão e pela data do aceite.
export const criarOrgSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, 'Slug com 3 a 40 letras minúsculas, números ou hífen'),
  prefixoProposta: z.string().regex(/^[A-Z0-9]{2,10}$/, 'Prefixo com 2 a 10 letras maiúsculas ou números'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ com 14 dígitos, só números').optional(),
  adminEmail: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  adminNome: z.string().trim().min(1).max(120),
  maxProjetos: z.number().int().min(1).max(10000),
  maxUsuarios: z.number().int().min(1).max(10000),
  termoVersao: z.string().trim().min(1).max(60),
}).strict();

export const atualizarOrgSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  maxProjetos: z.number().int().min(1).max(10000).optional(),
  maxUsuarios: z.number().int().min(1).max(10000).optional(),
  status: z.enum(['Active', 'Suspended']).optional(),
}).strict().refine((o) => Object.keys(o).length > 0, 'Nada a alterar');

/** Transferência de projeto para outra organização (só platform_admin). */
export const transferirProjetoSchema = z.object({
  orgDestinoId: z.string().trim().min(1).max(80),
  motivo: z.string().trim().min(5, 'Motivo com 5 a 500 caracteres').max(500, 'Motivo com 5 a 500 caracteres'),
}).strict();

// ---------------------------------------------------------------------------
// Catálogo de serviços (spec do sistema de propostas, seção 3)
// ---------------------------------------------------------------------------
const listaCurta = z.array(z.string().trim().min(1).max(500)).max(40);
const fase = z.object({
  nome: z.string().trim().min(1).max(120),
  objetivo: z.string().trim().max(1000).default(''),
  atividades: z.string().trim().max(3000).default(''),
  entregaveis: z.string().trim().max(3000).default(''),
  criterioAceite: z.string().trim().max(1000).default(''),
  pct: z.number().positive().max(100),
  semanas: z.number().int().positive().max(104),
}).strict();
const dias = z.number().positive().max(2000);
const diasPorFaixa = z.object({ '1': dias, '2': dias, '3': dias }).strict();
const servicoBase = {
  nome: z.string().trim().min(1).max(160),
  norma: z.string().trim().max(80).default(''),
  descricao: z.string().trim().max(3000).default(''),
  premissas: listaCurta.default([]),
  exclusoes: listaCurta.default([]),
};
export const servicoSchema = z.discriminatedUnion('tipo', [
  z.object({ ...servicoBase, tipo: z.literal('projeto'), diasPorFaixa,
    fases: z.array(fase).min(1).max(15)
      .refine((fs) => Math.abs(fs.reduce((s, f) => s + f.pct, 0) - 100) < 0.01, 'A soma do % das fases precisa ser 100') }).strict(),
  // O zod recusa dois membros com o mesmo literal 'avulso' na união discriminada
  // (e z.union não expõe o discriminador), então o avulso é uma união discriminada
  // aninhada por formaPreco.
  z.discriminatedUnion('formaPreco', [
    z.object({ ...servicoBase, tipo: z.literal('avulso'), formaPreco: z.literal('fixo'), valorFixo: z.number().positive().max(10_000_000),
      entregaveis: listaCurta.min(1), criterioAceite: z.string().trim().min(1).max(1000) }).strict(),
    z.object({ ...servicoBase, tipo: z.literal('avulso'), formaPreco: z.literal('esforco'), diasPorFaixa,
      entregaveis: listaCurta.min(1), criterioAceite: z.string().trim().min(1).max(1000) }).strict(),
  ]),
  z.object({ ...servicoBase, tipo: z.literal('recorrente'), mensalidade: z.number().positive().max(10_000_000),
    prazoMinimoMeses: z.number().int().min(1).max(60), inclusoMes: listaCurta.min(1) }).strict(),
]);
/** O que o cliente da API envia. */
export type ServicoEntrada = z.input<typeof servicoSchema>;
/** O que a API devolve. */
export type Servico = z.infer<typeof servicoSchema> & { id: string; orgId: string; ativo: boolean };

// ---------------------------------------------------------------------------
// Proposta (spec do sistema de propostas, seções 4 e 5)
// ---------------------------------------------------------------------------
/** Cópia de SECOES_EDITAVEIS (documento-proposta.ts); test/propostas.test.ts confere que são iguais. */
export const SECOES_EDITAVEIS_SCHEMA = ['sumario', 'objeto', 'como_trabalhamos', 'responsabilidades', 'sobre', 'premissas', 'termos', 'observacoes'] as const;
const textoLivre = z.string().max(10_000);
const itemProposta = z.object({
  servicoId: z.string().min(1).max(64),
  dias: z.number().positive().max(2000).optional(),
  meses: z.number().int().min(1).max(120).optional(),
  descontoPct: z.number().min(0).max(100).optional(),
  textoCliente: z.string().max(5000).optional(),
}).strict();
const camposProposta = {
  itens: z.array(itemProposta).max(30).optional(),
  contexto: textoLivre.optional(),
  escopo: textoLivre.optional(),
  observacoes: textoLivre.optional(),
  validadeDias: z.number().int().min(1).max(365).optional(),
  pagamento: z.string().trim().min(1).max(500).optional(),
  consultorEmail: z.string().trim().email().max(200).nullable().optional(),
};
export const propostaCriarSchema = z.object({ leadId: z.string().min(1).max(64), ...camposProposta }).strict();
export const propostaEditarSchema = z.object({
  ...camposProposta,
  // null restaura o texto padrão da seção
  secoesEditadas: z.object(Object.fromEntries(SECOES_EDITAVEIS_SCHEMA.map((id) => [id, z.string().max(30_000).nullable().optional()]))).strict().optional(),
}).strict();
// Sem trim: espaço no número é erro, não algo a consertar em silêncio. O formato fino (prefixo da organização) é conferido na rota.
export const propostaGerarSchema = z.object({ numero: z.string().max(40).optional() }).strict();

// Envio e aceite manual (fatia 4). O e-mail do cliente é só o destinatário; nome e cargo vão para a prova do aceite.
export const propostaEnviarSchema = z.object({
  email: z.string().trim().email().max(200),
  mensagem: z.string().trim().max(2000).optional(),
}).strict();
export const propostaAceiteManualSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  cargo: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  comprovante: z.string().trim().min(3).max(1000),
}).strict();

// Rotas públicas do cliente (fatia 4). O token vai no corpo, nunca no caminho nem na query (o log
// de requisição grava o caminho). Sem regex de formato: token malformado cai no mesmo 404 do desconhecido.
const tokenProposta = z.string().min(1).max(200);
export const propostaTokenSchema = z.object({ token: tokenProposta }).strict();
export const propostaAceiteLinkSchema = z.object({
  token: tokenProposta,
  nome: z.string().trim().min(2).max(120),
  cargo: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  poderes: z.literal(true),
}).strict();
export const propostaRecusaSchema = z.object({ token: tokenProposta, motivo: z.string().trim().max(1000).optional() }).strict();
export const propostaAjusteSchema = z.object({ token: tokenProposta, mensagem: z.string().trim().min(1).max(2000) }).strict();

// ─── Pedidos de aprovação/ciência (acesso de stakeholders, fatia 2) ─────────────
// `tipo` acompanha o CHECK da tabela `pedidos` (migration 0041): tipo novo exige migration.
export const pedidoCriarSchema = z.object({
  tipo: z.enum(['dpia']),
  ref_id: z.string().trim().min(1).max(200),
  papel_exigido: z.enum(['ciso', 'ceo', 'ciente']),
  destinatarios: z.array(z.object({
    email: z.string().trim().email().max(320),
    nome: z.string().trim().max(200).optional().nullable(),
  })).min(1).max(50),
});

// Ciência em massa por link (fatia 3, migration 0042): só `ciente`, para quem não tem conta.
// Teto de 200 por lote. `dpia` por conta continua em `pedidoCriarSchema` (a assinatura é só dele).
export const pedidoCienciaLoteSchema = z.object({
  tipo: z.enum(['politica', 'dpia']),
  ref_id: z.string().trim().min(1).max(200),
  destinatarios: z.array(z.object({
    email: z.string().trim().email().max(320),
    nome: z.string().trim().max(200).optional().nullable(),
  }).strict()).min(1).max(200),
}).strict();
// Reenvio: sem `emails`, a todos os pendentes; com, só a esses (ex.: as falhas do envio).
export const pedidoReenvioSchema = z.object({
  emails: z.array(z.string().trim().email().max(320)).min(1).max(200).optional(),
}).strict();
// Rotas públicas do link: o token vem no CORPO, nunca na URL.
const tokenPedido = z.string().min(1).max(200);
export const pedidoTokenSchema = z.object({ token: tokenPedido }).strict();
export const pedidoCienciaLinkSchema = z.object({
  token: tokenPedido,
  codigo: z.string().trim().regex(/^\d{6}$/),
  nome: z.string().trim().min(2).max(200),
}).strict();

export const pedidoDecisaoSchema = z.object({
  senha: z.string().min(1).max(500),
  motivo: z.string().trim().max(2000).optional().nullable(),
});
