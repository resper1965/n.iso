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

// ─── Ligações do tratamento (fatia 4.1) ───────────────────────────────────────
const idCurto = z.string().trim().min(1).max(100);
export const tratamentoItensSchema = z.object({ itens: z.array(idCurto).max(200) }).strict();
export const tratamentoDepartamentosSchema = z.object({ departamentos: z.array(idCurto).max(200) }).strict();
export const tratamentoTransferenciaSchema = z.object({
  pais: z.string().trim().min(1).max(100),
  destinatario_parte_id: idCurto.nullish(),
  mecanismo: z.string().trim().max(300).nullish(),
  observacao: z.string().trim().max(2000).nullish(),
}).strict();

/** LIA (fatia 5): tudo opcional (rascunho parcial); o serviço exige o conjunto para concluir. `.strict()`: campo desconhecido é 400. */
const textoLia = z.string().trim().max(5000).nullable();
export const liaSalvarSchema = z.object({
  finalidade_legitima: textoLia.optional(), necessidade: textoLia.optional(), balanceamento: textoLia.optional(), salvaguardas: textoLia.optional(),
  conclusao: z.enum(['prevalece', 'nao_prevalece']).nullable().optional(),
  status: z.enum(['rascunho', 'concluida']).optional(),
}).strict();

/** Importação do RoPA por planilha (fatia 4.4): o CSV inteiro como texto; as linhas são validadas uma a uma no serviço. */
export const ropaImportarSchema = z.object({ csv: z.string().min(1).max(300_000) }).strict();

// ─── Terceiros tipificados (fatia 6) ──────────────────────────────────────────
export const terceiroTipoSchema = z.object({ terceiro_tipo: z.enum(['grande_provedor', 'medio', 'pequeno', 'critico']).nullable() }).strict();

/** A evidência vira link na tela: só http(s), nunca `javascript:` nem `data:`. */
const urlWeb = z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, 'Use um link http ou https');
export const avaliacaoTerceiroSchema = z.object({
  resultado: z.enum(['aprovado', 'com_ressalvas', 'reprovado']),
  valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD'),
  evidencia_url: urlWeb.nullish(),
  observacao: z.string().trim().max(2000).nullish(),
}).strict();

export const terceiroDocumentoSchema = z.object({
  documento_id: z.string().trim().min(1).max(100),
  papel: z.enum(['dpa', 'contrato', 'outro']).default('dpa'),
}).strict();

// ─── Titular, incidente e consentimento (fatia 7) ─────────────────────────────
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD');
const instante = z.string().regex(/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/, 'Use AAAA-MM-DD ou data e hora ISO');
const textoCurto = z.string().trim().min(1).max(500);
const textoLongo = z.string().trim().max(5000);
const idParte = z.string().trim().min(1).max(100);

export const parametroLegalSchema = z.object({
  valor: z.number().int().min(1).max(100000),
  unidade: z.enum(['horas', 'dias_corridos', 'dias_uteis']),
  fonte: z.string().trim().min(1).max(1000),
  revisado_em: dia,
  revisado_por: z.string().trim().min(1).max(200),
}).strict();

export const titularPedidoCriarSchema = z.object({
  tipo: z.enum(['confirmacao', 'acesso', 'correcao', 'anonimizacao_bloqueio_eliminacao', 'portabilidade', 'informacao_compartilhamento', 'revogacao_consentimento', 'oposicao', 'outro']),
  canal: z.enum(['email', 'telefone', 'formulario', 'presencial', 'outro']).optional(),
  titular_nome: z.string().trim().max(200).nullish(),
  titular_contato: z.string().trim().max(300).nullish(),
  descricao: textoLongo.nullish(),
  recebido_em: dia.optional(),
  responsavel_parte_id: idParte.nullish(),
}).strict();

export const titularPedidoAtualizarSchema = z.object({
  status: z.enum(['recebido', 'em_andamento', 'respondido', 'negado', 'arquivado']).optional(),
  resposta_texto: textoLongo.nullable().optional(),
  responsavel_parte_id: idParte.nullable().optional(),
  prazo_em: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use AAAA-MM-DD').nullable().optional(),
  descricao: textoLongo.nullable().optional(),
}).strict();

export const incidenteCriarSchema = z.object({
  titulo: textoCurto,
  descricao: textoLongo.nullish(),
  ocorrido_em: instante.nullish(),
  ciencia_em: instante,
  responsavel_parte_id: idParte.nullish(),
}).strict();

export const incidenteRiscoSchema = z.object({
  risco_titular: z.enum(['sem_risco', 'baixo', 'relevante']),
  avaliacao_texto: textoLongo.nullish(),
}).strict();

export const incidenteComunicacaoSchema = z.object({
  destino: z.enum(['anpd', 'titular']),
  em: instante.optional(),
}).strict();

export const consentimentoCriarSchema = z.object({
  ropa_id: idParte,
  titular_ref: textoCurto,
  finalidade: textoCurto,
  versao_aviso: textoCurto,
  obtido_em: dia,
  canal: z.string().trim().max(100).nullish(),
}).strict();
