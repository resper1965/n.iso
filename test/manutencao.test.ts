import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { manutencaoDiaria } from '../src/manutencao';

/**
 * Cron de manutenção (`src/manutencao.ts`).
 *
 * A asserção que carrega este arquivo não é "apagou as linhas velhas" — é
 * **não apagou as vivas**. `rate_limits` não tem TTL e a linha é reaproveitada:
 * apagar a linha de uma janela ABERTA zera o contador de quem está sendo
 * limitado naquele instante, o que transforma uma rotina de limpeza em bypass
 * de rate limit. É o modo de falha caro aqui, e o barato (deixar lixo) é
 * justamente o que a rotina existe para tolerar.
 */

const SEG = (d: number) => Math.floor(Date.now() / 1000) - d * 24 * 60 * 60;

describe('manutenção diária', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
  });

  describe('purga de rate_limits', () => {
    it('NÃO apaga janela aberta — apagar zeraria o contador de quem está limitado', async () => {
      const agora = Math.floor(Date.now() / 1000);
      await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)')
        .bind('login:acct:alvo@x.com', 9, agora).run();

      const r = await manutencaoDiaria(env as any);
      expect(r.rate_limits_removidos).toBe(0);

      const linha = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?')
        .bind('login:acct:alvo@x.com').first<any>();
      expect(linha, 'a purga apagou uma janela aberta').not.toBeNull();
      expect(linha.count, 'o contador foi zerado — isto é bypass de rate limit').toBe(9);
    });

    it('NÃO apaga janela fechada recentemente (margem antes do corte)', async () => {
      // Fechada há ~1 dia: já não conta para nada, mas está dentro da margem.
      // O teste existe para o corte não virar "apaga tudo que não está aberto".
      await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)')
        .bind('recente', 3, SEG(1)).run();

      const r = await manutencaoDiaria(env as any);
      expect(r.rate_limits_removidos).toBe(0);
      expect(await env.DB.prepare('SELECT key FROM rate_limits WHERE key = ?').bind('recente').first()).not.toBeNull();
    });

    it('apaga o que está parado há mais de 7 dias', async () => {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)').bind('velho-1', 4, SEG(30)),
        env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)').bind('velho-2', 1, SEG(8)),
      ]);

      const r = await manutencaoDiaria(env as any);
      expect(r.rate_limits_removidos).toBe(2);
      const { results } = await env.DB.prepare('SELECT key FROM rate_limits').all();
      expect(results).toHaveLength(0);
    });
  });

  describe('purga de tokens de auditor vencidos', () => {
    beforeEach(async () => {
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active').run();
    });

    it('mantém token válido e token vencido DENTRO da carência', async () => {
      // A carência é de propósito: num produto de GRC, investigar um acesso de
      // auditor do mês passado exige que a linha ainda exista.
      await env.DB.batch([
        env.DB.prepare('INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?,?)')
          .bind('at-vivo', 'proj-a', 'tok-vivo', '2099-01-01T00:00:00Z'),
        env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?, datetime('now','-10 days'))`)
          .bind('at-recente', 'proj-a', 'tok-recente'),
      ]);

      const r = await manutencaoDiaria(env as any);
      expect(r.tokens_auditor_removidos).toBe(0);
      const { results } = await env.DB.prepare('SELECT id FROM auditor_tokens ORDER BY id').all();
      expect((results as any[]).map(x => x.id)).toEqual(['at-recente', 'at-vivo']);
    });

    it('apaga token vencido há mais de 90 dias — credencial morta não se guarda para sempre', async () => {
      await env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?, datetime('now','-200 days'))`)
        .bind('at-antigo', 'proj-a', 'tok-antigo').run();

      const r = await manutencaoDiaria(env as any);
      expect(r.tokens_auditor_removidos).toBe(1);
      expect(await env.DB.prepare('SELECT id FROM auditor_tokens WHERE id = ?').bind('at-antigo').first()).toBeNull();
    });
  });

  describe('tolerância a falha', () => {
    it('uma tarefa que estoura não impede as outras, e a falha vai no resultado', async () => {
      // Sem a tabela, a purga de rate_limits estoura; a de tokens tem de rodar
      // assim mesmo. Perder a limpeza de hoje é aceitável; perder o registro do
      // porquê, não.
      await env.DB.prepare('DROP TABLE rate_limits').run();
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active').run();
      await env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?, datetime('now','-200 days'))`)
        .bind('at-x', 'proj-b', 'tok-x').run();

      const r = await manutencaoDiaria(env as any);

      expect(r.falhas.length, 'a falha não foi registrada').toBe(1);
      expect(r.falhas[0]).toContain('rate_limits');
      expect(r.tokens_auditor_removidos, 'a segunda tarefa não rodou após a falha da primeira').toBe(1);
    });
  });
});
