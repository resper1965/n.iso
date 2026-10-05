import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/** Preço é só do comercial: o consultor lê o levantamento, mas sem nenhuma coluna `pricing_*`. */
const pegar = (caminho: string, headers: Record<string, string>) =>
  app.fetch(new Request('http://localhost' + caminho, { headers }), workerEnv() as any);
const chavesPreco = (o: any) => Object.keys(o).filter((k) => k.startsWith('pricing_'));

describe('assessments: consultor não recebe preço', () => {
  let consultor: Record<string, string>, comercial: Record<string, string>, admin: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(
      `INSERT INTO assessments (id, client_name, pricing_override, pricing_desconto, pricing_notas)
       VALUES ('as-1','Cliente X',50000,10,'margem baixa')`
    ).run();
    consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    comercial = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial' });
    admin = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  });

  for (const [rotulo, caminho, extrai] of [
    ['lista', '/api/v1/assessments', (b: any) => b.find((a: any) => a.id === 'as-1')],
    ['detalhe', '/api/v1/assessments/as-1', (b: any) => b],
  ] as const) {
    it(`${rotulo}: consultor sem chave pricing_*`, async () => {
      const r = await pegar(caminho, consultor);
      expect(r.status).toBe(200);
      const linha = extrai(await r.json());
      expect(linha.client_name).toBe('Cliente X');
      expect(chavesPreco(linha)).toEqual([]);
    }, 30_000);

    it(`${rotulo}: comercial e platform_admin recebem o preço`, async () => {
      for (const h of [comercial, admin]) {
        const linha = extrai(await (await pegar(caminho, h)).json());
        expect(linha.pricing_override).toBe(50000);
        expect(linha.pricing_desconto).toBe(10);
        expect(linha.pricing_notas).toBe('margem baixa');
      }
    }, 30_000);
  }
});
