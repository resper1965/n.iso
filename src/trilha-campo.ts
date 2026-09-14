// Trilha de auditoria por CAMPO: `campo: antes → depois`, com autor, quando e
// o id da operação que agrupa o lote.
//
// A tabela (`audit_logs`) é append-only por trigger do banco, e continua sendo:
// desfazer NÃO apaga linha. O pacote de design descreve o desfazer como janela
// PRÉ-COMMIT, em que a entrada só entraria no log depois de a janela fechar.
// Num Worker não há como segurar uma escrita por N segundos e garantir que ela
// aconteça: quem fecha a aba leva a entrada junto, e trilha de SGSI perdida é
// pior do que trilha com um par de linhas a mais. Então a operação é gravada na
// hora e o desfazer vira um registro próprio, ligado pelo `operation_id`; a
// LEITURA é que esconde o par (ver `colapsaDesfeitas`). O banco guarda os dois
// fatos, que é o que o auditor exporta; a tela mostra o que aconteceu de
// líquido, que é o que o consultor precisa ler.

import { genId } from './helpers';

/** Prefixo do `action` que marca uma operação desfeita. */
export const ACAO_DESFEITA = 'trilha.undone';

export interface AlteracaoDeCampo {
  /** Nome do campo em PT-BR, como o usuário o vê — nunca a chave interna. */
  campo: string;
  antes: string | number | null | undefined;
  depois: string | number | null | undefined;
}

export interface RegistroTrilha {
  id: string;
  acao: string;
  autor: string;
  quando: string;
  campo: string | null;
  antes: string | null;
  depois: string | null;
  operacao: string | null;
  /** Quantos campos a MESMA operação alterou: é o marcador de lote. */
  itensNaOperacao: number;
}

export function novaOperacao(): string {
  return genId();
}

/** `null` de CMMI vira `—`, nunca a palavra "null" na tela do auditor. */
export function valorParaTrilha(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

/** Só entra na trilha o campo que de fato mudou. */
export function apenasMudancas(alteracoes: AlteracaoDeCampo[]): AlteracaoDeCampo[] {
  return alteracoes.filter(a => valorParaTrilha(a.antes) !== valorParaTrilha(a.depois));
}

/**
 * Uma linha por campo alterado, todas com o mesmo `operation_id`.
 * Devolve o id da operação, ou null quando nada mudou — operação sem mudança
 * não é fato, e poluir a trilha com ela esconde as que importam.
 */
export async function registrarAlteracoes(
  db: D1Database,
  params: {
    acao: string;
    autor: string;
    entidade: string;
    entidadeId: string;
    projectId?: string | null;
    alteracoes: AlteracaoDeCampo[];
    operacao?: string;
    ip?: string;
  }
): Promise<string | null> {
  const mudancas = apenasMudancas(params.alteracoes);
  if (!mudancas.length) return null;

  const operacao = params.operacao ?? novaOperacao();
  for (const m of mudancas) {
    await db.prepare(
      `INSERT INTO audit_logs
         (id, action, actor, details, justification, ip_address, project_id,
          entity_type, entity_id, field, old_value, new_value, operation_id, created_at)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      genId(), params.acao, params.autor,
      `${m.campo}: ${valorParaTrilha(m.antes)} → ${valorParaTrilha(m.depois)}`,
      params.ip ?? '', params.projectId ?? null,
      params.entidade, params.entidadeId, m.campo,
      valorParaTrilha(m.antes), valorParaTrilha(m.depois), operacao
    ).run();
  }
  return operacao;
}

/** Marca uma operação como desfeita. Não apaga nada — a tabela é append-only. */
export async function registrarDesfazer(
  db: D1Database,
  params: { autor: string; operacao: string; projectId?: string | null; entidade: string; entidadeId: string }
): Promise<void> {
  await db.prepare(
    `INSERT INTO audit_logs
       (id, action, actor, details, justification, ip_address, project_id,
        entity_type, entity_id, operation_id, created_at)
     VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?, datetime('now'))`
  ).bind(
    genId(), ACAO_DESFEITA, params.autor,
    `Operação ${params.operacao} desfeita`,
    params.projectId ?? null, params.entidade, params.entidadeId, params.operacao
  ).run();
}

/**
 * Esconde da LEITURA as operações desfeitas e o próprio registro de desfazer:
 * um lote marcado e revertido dez segundos depois não é história, é ruído — e
 * ruído no histórico esconde as alterações que valem. As linhas continuam no
 * banco para quem exporta a trilha crua.
 */
export function colapsaDesfeitas<T extends { acao: string; operacao: string | null }>(linhas: T[]): T[] {
  const desfeitas = new Set(
    linhas.filter(l => l.acao === ACAO_DESFEITA && l.operacao).map(l => l.operacao as string)
  );
  return linhas.filter(l => l.acao !== ACAO_DESFEITA && !(l.operacao && desfeitas.has(l.operacao)));
}

/** Trilha de uma entidade, mais recente primeiro, sem o que foi desfeito. */
export async function lerTrilha(
  db: D1Database,
  entidade: string,
  entidadeId: string,
  limite = 100
): Promise<RegistroTrilha[]> {
  const { results } = await db.prepare(
    `SELECT id, action, actor, created_at, field, old_value, new_value, operation_id
       FROM audit_logs
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?`
  ).bind(entidade, entidadeId, limite).all();

  const linhas = (results || []).map((r: any) => ({
    id: r.id,
    acao: r.action,
    autor: r.actor,
    quando: r.created_at,
    campo: r.field ?? null,
    antes: r.old_value ?? null,
    depois: r.new_value ?? null,
    operacao: r.operation_id ?? null,
    itensNaOperacao: 1,
  }));

  const visiveis = colapsaDesfeitas(linhas);
  // Marcador de lote: quantas linhas a mesma operação produziu.
  const porOperacao = new Map<string, number>();
  for (const l of visiveis) {
    if (l.operacao) porOperacao.set(l.operacao, (porOperacao.get(l.operacao) ?? 0) + 1);
  }
  return visiveis.map(l => ({
    ...l,
    itensNaOperacao: l.operacao ? (porOperacao.get(l.operacao) ?? 1) : 1,
  }));
}
