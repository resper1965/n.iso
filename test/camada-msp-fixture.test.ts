import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';

describe('fixture da matriz MSP', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); });

  it('monta duas contas MSP e uma direta', async () => {
    const { results } = await env.DB.prepare(`SELECT id, tipo FROM contas ORDER BY id`).all<{ id: string; tipo: string }>();
    expect(results).toEqual([
      { id: 'conta-a', tipo: 'msp' },
      { id: 'conta-b', tipo: 'msp' },
      { id: 'conta-c', tipo: 'direto' },
    ]);
  });

  it('dá ao cliente A1 dois projetos', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) n FROM projects WHERE cliente_id = 'cli-a1'`
    ).first<{ n: number }>();
    expect(row?.n).toBe(2);
  });

  it('concede ao usuário comum apenas um dos dois projetos do cliente dele', async () => {
    const { results } = await env.DB.prepare(
      `SELECT project_id FROM acesso_projeto WHERE user_id = 'u-a1-user'`
    ).all<{ project_id: string }>();
    expect(results.map(r => r.project_id)).toEqual(['proj-a1-27001']);
  });
});
