import { log } from './observability';
import { arquivarDia, diaAtras } from './trilha';
import type { Bindings } from './index';

/**
 * Manutenção periódica do banco — o que o produto acumula e nunca limpava.
 *
 * Antes desta rotina não havia execução periódica nenhuma no sistema: nenhum
 * handler `scheduled`, nenhum cron. Duas tabelas cresciam para sempre, cada uma
 * por um motivo diferente, e as duas são varridas aqui.
 *
 * O que NÃO mora aqui: o backup do D1. Um Worker não consegue exportar o banco
 * (não existe API de export no binding D1) — quem faz isso é o `wrangler d1
 * export`, então o backup diário é um workflow agendado do GitHub Actions
 * (`.github/workflows/db-backup.yml`), não este cron. O plano tratava as duas
 * coisas como um item só; são mecanismos diferentes.
 */

/**
 * Maior janela de rate limit em uso hoje (`routes/auth.ts`: 300 s).
 *
 * A purga precisa deste número porque a linha de `rate_limits` é REAPROVEITADA:
 * não há TTL, e apagar uma linha de janela ABERTA zeraria o contador de quem
 * está sendo limitado naquele instante — exatamente o oposto do que a tabela
 * existe para fazer. O teto abaixo é ~2000× esta janela, então nenhuma linha
 * viva é alcançada. Se alguém usar `rateLimitD1` com janela maior que esta,
 * atualize as duas constantes juntas.
 */
const MAIOR_JANELA_SEG = 300;

/** Linha de rate limit parada há mais de 7 dias não tem contador vivo a proteger. */
const PURGA_RATE_LIMIT_SEG = 7 * 24 * 60 * 60;

/**
 * Carência antes de apagar token de auditor vencido.
 *
 * Token vencido já não autentica nada — a consulta filtra por `expires_at >
 * datetime('now')`. Some-se por RETENÇÃO, não por segurança: é credencial de
 * acesso externo a dado de cliente, e guardar credencial morta para sempre é o
 * que a onda 6 do plano quer eliminar.
 *
 * A carência existe porque este é um produto de GRC: se alguém investigar um
 * acesso de auditor do mês passado, a linha ainda precisa estar lá. Noventa dias
 * cobre o ciclo de uma auditoria; a criação e a revogação seguem registradas em
 * `audit_logs`, que esta rotina não toca.
 */
const CARENCIA_TOKEN_AUDITOR_DIAS = 90;

/**
 * POLÍTICA DE RETENÇÃO (item 4.5 do `enterprise-grade-plan.md`).
 *
 * A tabela abaixo é a política EXECUTADA — não um documento que descreve
 * intenção. `docs/retencao.md` explica cada prazo; aqui ficam os números que o
 * cron de fato aplica, para os dois não poderem divergir.
 *
 * O critério de entrada nesta lista é estreito de propósito: só dado
 * OPERACIONAL ou DERIVADO. Registro de GRC — evidência, risco, controle, ROPA,
 * auditoria, CAPA — **nunca** entra. Esses são a razão de o produto existir, o
 * prazo deles é decisão do cliente (e frequentemente de norma: certificação
 * exige histórico de ciclos anteriores), e apagá-los por rotina de plataforma
 * seria destruir o trabalho pelo qual o cliente paga.
 *
 * `audit_logs` também não entra, por dois motivos que se somam: os triggers da
 * migration 0018 barram DELETE no nível do banco, e a trilha é o último lugar
 * onde apagar por conveniência faz sentido. O crescimento dela é contido pelo
 * arquivamento em R2 (`src/trilha.ts`), não por purga.
 */
const RETENCAO: { tabela: string; dias: number; coluna: string; motivo: string }[] = [
  {
    tabela: 'notifications',
    dias: 180,
    coluna: 'created_at',
    motivo: 'aviso de interface; perde utilidade em dias, e guardar por anos é acúmulo sem uso',
  },
  {
    tabela: 'ai_chat_history',
    dias: 180,
    coluna: 'created_at',
    motivo: 'pode conter texto que o consultor colou do cliente — minimização (LGPD art. 6º, III)',
  },
];

export type ResultadoManutencao = {
  rate_limits_removidos: number;
  tokens_auditor_removidos: number;
  /** Dia da trilha arquivado nesta execução, ou null se não houve. */
  trilha_arquivada: string | null;
  /** Linhas removidas por política de retenção, por tabela. */
  retencao: Record<string, number>;
  falhas: string[];
};

/**
 * Executa as tarefas de manutenção. Cada uma é independente: uma falha não
 * impede as outras, e o que falhou vai no resultado em vez de derrubar o cron
 * inteiro — perder a purga de hoje é aceitável, perder o registro do porquê não.
 */
export async function manutencaoDiaria(env: Bindings): Promise<ResultadoManutencao> {
  const resultado: ResultadoManutencao = {
    rate_limits_removidos: 0,
    tokens_auditor_removidos: 0,
    trilha_arquivada: null,
    retencao: {},
    falhas: [],
  };

  const agoraSeg = Math.floor(Date.now() / 1000);

  try {
    const corte = agoraSeg - PURGA_RATE_LIMIT_SEG;
    // `window_start + MAIOR_JANELA_SEG < corte`: a janela desta linha fechou há
    // pelo menos 7 dias. Escrito assim, e não como `window_start < corte`, para
    // a margem ficar explícita no SQL em vez de embutida na constante.
    const r = await env.DB.prepare(
      'DELETE FROM rate_limits WHERE window_start + ? < ?'
    ).bind(MAIOR_JANELA_SEG, corte).run();
    resultado.rate_limits_removidos = r.meta?.changes ?? 0;
  } catch (e: any) {
    resultado.falhas.push(`rate_limits: ${e?.message ?? e}`);
  }

  try {
    const r = await env.DB.prepare(
      `DELETE FROM auditor_tokens WHERE expires_at < datetime('now', ?)`
    ).bind(`-${CARENCIA_TOKEN_AUDITOR_DIAS} days`).run();
    resultado.tokens_auditor_removidos = r.meta?.changes ?? 0;
  } catch (e: any) {
    resultado.falhas.push(`auditor_tokens: ${e?.message ?? e}`);
  }

  for (const r of RETENCAO) {
    try {
      // Nome de tabela e coluna vêm da constante acima, nunca do chamador; o
      // prazo vai por bind. Interpolar identificador é inevitável (SQLite não
      // aceita bind para isso) e seguro por essa procedência.
      const res = await env.DB.prepare(
        `DELETE FROM "${r.tabela}" WHERE "${r.coluna}" < datetime('now', ?)`
      ).bind(`-${r.dias} days`).run();
      resultado.retencao[r.tabela] = res.meta?.changes ?? 0;
    } catch (e: any) {
      resultado.falhas.push(`retencao ${r.tabela}: ${e?.message ?? e}`);
    }
  }

  /*
   * Arquiva a trilha de ONTEM, não a de hoje: o dia corrente ainda recebe
   * registro, e arquivá-lo produziria um objeto incompleto que a idempotência
   * depois se recusaria a corrigir — a cadeia guardaria um dia truncado para
   * sempre. Um dia inteiro de atraso é o preço de o arquivo ser definitivo.
   */
  try {
    if ((env as any).TRILHA) {
      const r = await arquivarDia(env, diaAtras(1));
      resultado.trilha_arquivada = r.ja_existia ? null : r.dia;
    }
  } catch (e: any) {
    resultado.falhas.push(`trilha: ${e?.message ?? e}`);
  }

  log(resultado.falhas.length ? 'error' : 'info', {
    msg: 'manutencao_diaria',
    ...resultado,
  });

  return resultado;
}
