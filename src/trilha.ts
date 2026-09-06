import { log } from './observability';
import type { Bindings } from './index';

/**
 * Arquivamento da trilha de auditoria FORA do D1 (item 4.4 do
 * `enterprise-grade-plan.md`).
 *
 * O que já existia, e o que faltava.
 *
 * A migration `0018_data_hardening.sql` cria `audit_logs_no_update` e
 * `audit_logs_no_delete`, e os dois estão em produção (conferido em
 * `sqlite_master`). Eles barram `UPDATE` e `DELETE` no nível do banco — ou seja,
 * a trilha já é append-only contra erro de aplicação e contra comando avulso.
 *
 * O que eles NÃO barram é quem administra o banco: `DROP TRIGGER` é uma linha, e
 * depois dela a trilha vira uma tabela comum. Para uma trilha valer contra
 * ADULTERAÇÃO DELIBERADA por quem tem esse acesso, ela precisa existir em outro
 * lugar, com outro controle de acesso.
 *
 * COMO ISTO FUNCIONA. Uma vez por dia o cron arquiva o dia anterior num objeto
 * JSONL no R2 (bucket `niso-trilha`, separado do de evidências), e cada objeto
 * carrega o SHA-256 do ANTERIOR. Os dias formam uma cadeia: alterar um dia
 * antigo quebra o encadeamento de todos os posteriores, e a verificação
 * percorre a cadeia inteira sem consultar o D1.
 *
 * O QUE ISTO PROVA, E O QUE NÃO PROVA — e a diferença importa num produto de
 * GRC, onde a frase "trilha imutável" acaba num relatório:
 *
 *   - PROVA que a trilha de um dia já arquivado não foi alterada depois, para
 *     quem tem acesso apenas ao D1. Quebrar a cadeia sem ser notado exige
 *     reescrever TODOS os dias seguintes no R2.
 *   - NÃO prova nada contra quem tem acesso de escrita ao bucket E ao D1 ao
 *     mesmo tempo. Fechar isso exige um destino que o produto não possa
 *     reescrever — bucket com retenção/object-lock, ou terceiro depositário.
 *     É o degrau seguinte, e está declarado no `docs/runbook-incidente.md` em
 *     vez de subentendido.
 *   - NÃO cobre o dia CORRENTE: o que ainda não foi arquivado só existe no D1.
 */

/** Prefixo dos objetos no bucket da trilha. */
const PREFIXO = 'trilha';

/** Objeto que guarda o digest do último dia arquivado — o elo da cadeia. */
const PONTEIRO = `${PREFIXO}/ultimo.json`;

export type ResultadoArquivamento = {
  dia: string;
  linhas: number;
  sha256: string;
  anterior_sha256: string | null;
  /** Já estava arquivado; nada foi reescrito. */
  ja_existia: boolean;
};

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

/** `2026-09-05` → `trilha/2026/09/2026-09-05.jsonl` */
export function chaveDoDia(dia: string): string {
  const [ano, mes] = dia.split('-');
  return `${PREFIXO}/${ano}/${mes}/${dia}.jsonl`;
}

/** Data (UTC) de N dias atrás, em `YYYY-MM-DD`. */
export function diaAtras(n: number, agora = new Date()): string {
  const d = new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Arquiva um dia. Idempotente: se o objeto já existe, NÃO reescreve.
 *
 * A idempotência é a parte que protege a cadeia. Um cron que roda duas vezes,
 * ou um retry, não pode regravar um dia — regravar é exatamente a operação que
 * a cadeia existe para tornar detectável.
 */
export async function arquivarDia(env: Bindings, dia: string): Promise<ResultadoArquivamento> {
  const bucket = (env as any).TRILHA as R2Bucket | undefined;
  if (!bucket) throw new Error('Binding TRILHA (R2) ausente — a trilha não pode ser arquivada.');

  const chave = chaveDoDia(dia);
  const existente = await bucket.head(chave);
  if (existente) {
    return {
      dia,
      linhas: Number(existente.customMetadata?.linhas ?? 0),
      sha256: existente.customMetadata?.sha256 ?? '',
      anterior_sha256: existente.customMetadata?.anterior ?? null,
      ja_existia: true,
    };
  }

  const { results } = await env.DB.prepare(
    `SELECT id, action, actor, details, justification, ip_address, project_id, created_at
     FROM audit_logs
     WHERE date(created_at) = ?
     ORDER BY created_at, id`
  ).bind(dia).all();

  const linhas = (results ?? []) as Record<string, unknown>[];

  const ponteiro = await bucket.get(PONTEIRO);
  const anterior = ponteiro ? ((await ponteiro.json()) as { sha256: string }).sha256 : null;

  // JSONL: uma entrada por linha. Formato de append por natureza, legível por
  // `grep` e por `jq -s`, e que não exige carregar o dia inteiro em memória para
  // conferir. O digest cobre o CORPO mais o elo anterior — sem incluir o elo,
  // reordenar dias passaria despercebido.
  const corpo = linhas.map((l) => JSON.stringify(l)).join('\n') + (linhas.length ? '\n' : '');
  const digest = await sha256(`${anterior ?? 'GENESIS'}\n${corpo}`);

  await bucket.put(chave, corpo, {
    httpMetadata: { contentType: 'application/x-ndjson' },
    customMetadata: {
      dia,
      linhas: String(linhas.length),
      sha256: digest,
      anterior: anterior ?? 'GENESIS',
    },
  });

  await bucket.put(
    PONTEIRO,
    JSON.stringify({ dia, sha256: digest, atualizado_em: new Date().toISOString() }),
    { httpMetadata: { contentType: 'application/json' } }
  );

  log('info', { msg: 'trilha_arquivada', dia, linhas: linhas.length, sha256: digest });

  return { dia, linhas: linhas.length, sha256: digest, anterior_sha256: anterior, ja_existia: false };
}

export type Verificacao = {
  dias: number;
  intacta: boolean;
  /** Dias em que a cadeia não fecha, com o motivo. Vazio quando intacta. */
  quebras: string[];
};

/**
 * Percorre a cadeia e reconfere cada elo — recalculando o digest do conteúdo,
 * não apenas comparando metadados.
 *
 * Comparar só o `customMetadata` seria teatro: quem reescreve o objeto reescreve
 * o metadado junto. O que prende o dia é o digest do CORPO encadeado ao anterior.
 */
export async function verificarCadeia(env: Bindings): Promise<Verificacao> {
  const bucket = (env as any).TRILHA as R2Bucket | undefined;
  if (!bucket) throw new Error('Binding TRILHA (R2) ausente.');

  const objetos: { key: string; dia: string }[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await bucket.list({ prefix: `${PREFIXO}/`, cursor, include: ['customMetadata'] });
    for (const o of pagina.objects) {
      if (!o.key.endsWith('.jsonl')) continue;
      objetos.push({ key: o.key, dia: o.customMetadata?.dia ?? o.key });
    }
    cursor = pagina.truncated ? pagina.cursor : undefined;
  } while (cursor);

  objetos.sort((a, b) => a.dia.localeCompare(b.dia));

  const quebras: string[] = [];
  let esperadoAnterior: string | null = null;

  for (const { key, dia } of objetos) {
    const obj = await bucket.get(key);
    if (!obj) {
      quebras.push(`${dia}: objeto sumiu entre o list e o get`);
      continue;
    }
    const corpo = await obj.text();
    const anteriorGravado = obj.customMetadata?.anterior ?? 'GENESIS';
    const digestGravado = obj.customMetadata?.sha256 ?? '';

    if (esperadoAnterior !== null && anteriorGravado !== esperadoAnterior) {
      quebras.push(`${dia}: elo anterior é ${anteriorGravado.slice(0, 12)}…, esperado ${esperadoAnterior.slice(0, 12)}…`);
    }

    const recalculado = await sha256(`${anteriorGravado}\n${corpo}`);
    if (recalculado !== digestGravado) {
      quebras.push(`${dia}: conteúdo não bate com o sha256 gravado (adulteração ou gravação parcial)`);
    }

    esperadoAnterior = digestGravado;
  }

  return { dias: objetos.length, intacta: quebras.length === 0, quebras };
}
