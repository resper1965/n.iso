import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { arquivarDia, verificarCadeia, chaveDoDia, diaAtras } from '../src/trilha';

/**
 * Trilha de auditoria arquivada fora do D1 (item 4.4 do plano).
 *
 * Os triggers `audit_logs_no_update`/`no_delete` (migration 0018) já barram
 * UPDATE e DELETE, e estão em produção. O que eles não barram é `DROP TRIGGER`,
 * que é uma linha para quem administra o banco.
 *
 * O que este arquivo prova é o degrau seguinte: uma vez arquivado, alterar um
 * dia antigo é DETECTÁVEL, porque cada dia carrega o digest do anterior e a
 * verificação recalcula o conteúdo — não confere apenas metadado.
 *
 * O binding `TRILHA` não existe no `wrangler.test.jsonc` de propósito: um bucket
 * a mais no ambiente de teste não acrescenta nada, e o pool já entrega R2 real
 * para o `STORAGE`. Os testes passam esse bucket como `TRILHA` num env forjado —
 * é o mesmo objeto R2, sob outro nome.
 */

const comTrilha = () => ({ ...env, TRILHA: (env as any).STORAGE }) as any;

async function limparBucket() {
  const b = (env as any).STORAGE as R2Bucket;
  const { objects } = await b.list({ prefix: 'trilha/' });
  for (const o of objects) await b.delete(o.key);
}

/**
 * `audit_logs` NÃO é limpa pelo `resetData` — os triggers da migration 0018
 * barram DELETE, que é justamente o ponto. Então cada teste usa datas próprias e
 * ids únicos: reaproveitar um dia entre testes acumularia linhas do teste
 * anterior e a contagem mentiria.
 */
async function semear(dia: string, quantas: number, prefixo = 'acao') {
  for (let i = 0; i < quantas; i++) {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, created_at) VALUES (?,?,?,?,?)`
    ).bind(crypto.randomUUID(), `${prefixo}.${i}`, 'quem@x.com', `detalhe ${i}`, `${dia}T10:0${i}:00Z`).run();
  }
}

describe('Trilha arquivada', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await limparBucket();
  });

  it('arquiva o dia como JSONL, com uma linha por registro', async () => {
    await semear('2026-09-01', 3);
    const r = await arquivarDia(comTrilha(), '2026-09-01');

    expect(r.linhas).toBe(3);
    expect(r.ja_existia).toBe(false);
    expect(r.anterior_sha256, 'o primeiro dia não tem elo anterior').toBeNull();

    const obj = await ((env as any).STORAGE as R2Bucket).get(chaveDoDia('2026-09-01'));
    const texto = await obj!.text();
    expect(texto.trimEnd().split('\n')).toHaveLength(3);
    expect(JSON.parse(texto.split('\n')[0]).actor).toBe('quem@x.com');
  });

  it('não arquiva registro de OUTRO dia', async () => {
    await semear('2026-09-11', 2);
    await semear('2026-09-12', 5);
    const r = await arquivarDia(comTrilha(), '2026-09-12');
    expect(r.linhas).toBe(5);
  });

  it('é idempotente — rodar de novo NÃO reescreve o dia', async () => {
    // A idempotência é o que protege a cadeia: regravar um dia é exatamente a
    // operação que ela existe para tornar detectável. Um cron que roda duas
    // vezes, ou um retry, não pode produzir um elo novo.
    await semear('2026-09-21', 2);
    const primeiro = await arquivarDia(comTrilha(), '2026-09-21');

    await semear('2026-09-21', 1, 'chegou-depois');
    const segundo = await arquivarDia(comTrilha(), '2026-09-21');

    expect(segundo.ja_existia).toBe(true);
    expect(segundo.sha256).toBe(primeiro.sha256);
    expect(segundo.linhas, 'o dia foi reescrito com o registro atrasado').toBe(2);
  });

  it('encadeia os dias: cada um carrega o digest do anterior', async () => {
    await semear('2026-09-14', 1);
    await semear('2026-09-15', 1);
    const d1 = await arquivarDia(comTrilha(), '2026-09-14');
    const d2 = await arquivarDia(comTrilha(), '2026-09-15');

    expect(d2.anterior_sha256).toBe(d1.sha256);
    expect(d2.sha256).not.toBe(d1.sha256);

    const v = await verificarCadeia(comTrilha());
    expect(v.dias).toBe(2);
    expect(v.intacta, v.quebras.join(' | ')).toBe(true);
  });

  it('ADULTERAR um dia arquivado quebra a verificação', async () => {
    // É a asserção que carrega o arquivo. Sem ela, tudo acima seria apenas um
    // backup com nome bonito.
    await semear('2026-09-17', 2);
    await semear('2026-09-18', 2);
    await arquivarDia(comTrilha(), '2026-09-17');
    await arquivarDia(comTrilha(), '2026-09-18');
    expect((await verificarCadeia(comTrilha())).intacta).toBe(true);

    // Alguém com acesso ao bucket reescreve o dia 1 para apagar uma ação,
    // mantendo o metadado intacto — que é o que faria quem quer não ser visto.
    const b = (env as any).STORAGE as R2Bucket;
    const alvo = await b.get(chaveDoDia('2026-09-17'));
    const original = await alvo!.text();
    await b.put(chaveDoDia('2026-09-17'), original.split('\n').slice(1).join('\n'), {
      customMetadata: alvo!.customMetadata,
    });

    const v = await verificarCadeia(comTrilha());
    expect(v.intacta, 'a adulteração passou despercebida').toBe(false);
    expect(v.quebras.join(' ')).toContain('2026-09-17');
    expect(v.quebras.join(' ')).toContain('não bate');
  });

  it('REESCREVER um dia com digest recalculado quebra o ELO seguinte', async () => {
    // O atacante mais cuidadoso recalcula o digest do dia que alterou. A cadeia
    // pega assim mesmo: o dia SEGUINTE guarda o digest antigo como seu elo.
    await semear('2026-09-24', 2);
    await semear('2026-09-25', 2);
    await arquivarDia(comTrilha(), '2026-09-24');
    await arquivarDia(comTrilha(), '2026-09-25');

    const b = (env as any).STORAGE as R2Bucket;
    const alvo = await b.get(chaveDoDia('2026-09-24'));
    const corpoNovo = (await alvo!.text()).split('\n').slice(1).join('\n');
    const digestNovo = [...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`GENESIS\n${corpoNovo}`))
    )].map((x) => x.toString(16).padStart(2, '0')).join('');
    await b.put(chaveDoDia('2026-09-24'), corpoNovo, {
      customMetadata: { ...alvo!.customMetadata, sha256: digestNovo },
    });

    const v = await verificarCadeia(comTrilha());
    expect(v.intacta, 'reescrita coerente passou — a cadeia não está encadeando').toBe(false);
    expect(v.quebras.join(' ')).toContain('2026-09-25');
    expect(v.quebras.join(' ')).toContain('elo anterior');
  });

  it('dia sem registro nenhum ainda entra na cadeia', async () => {
    // Pular o dia vazio abriria um buraco em que se poderia inserir um dia
    // forjado depois, sem quebrar elo nenhum.
    const r = await arquivarDia(comTrilha(), '2026-09-03');
    expect(r.linhas).toBe(0);
    expect((await verificarCadeia(comTrilha())).dias).toBe(1);
  });

  it('`diaAtras(1)` é ontem em UTC — o cron arquiva o dia FECHADO', async () => {
    const agora = new Date('2026-09-06T04:10:00Z');
    expect(diaAtras(1, agora)).toBe('2026-09-05');
    // Arquivar o dia corrente produziria um objeto incompleto que a
    // idempotência depois se recusaria a corrigir.
    expect(diaAtras(0, agora)).toBe('2026-09-06');
  });
});
