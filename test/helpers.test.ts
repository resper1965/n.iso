import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { genId, escapeHtml, requireResourceAccess, genNumericCode, constantTimeEqual } from '../src/helpers';
import { applySchema } from './helpers/d1';

describe('helpers', () => {
  describe('genNumericCode', () => {
    it('returns a 6-digit numeric string by default', () => {
      const code = genNumericCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('respects the requested length and pads with leading zeros', () => {
      expect(genNumericCode(4)).toMatch(/^\d{4}$/);
      expect(genNumericCode(8)).toMatch(/^\d{8}$/);
    });

    it('produces varied values across calls', () => {
      const codes = new Set(Array.from({ length: 50 }, () => genNumericCode()));
      expect(codes.size).toBeGreaterThan(1);
    });

    it('throws for invalid widths (0, fractional, >9)', () => {
      expect(() => genNumericCode(0)).toThrow();
      expect(() => genNumericCode(1.5)).toThrow();
      expect(() => genNumericCode(10)).toThrow(); // 10**10 estoura Uint32 -> loop infinito sem o guard
    });
  });

  describe('constantTimeEqual', () => {
    it('is true for identical strings', () => {
      expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
    });

    it('is false for different content or length', () => {
      expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
      expect(constantTimeEqual('abc', 'abcd')).toBe(false);
      expect(constantTimeEqual('', 'x')).toBe(false);
    });
  });

  describe('genId', () => {
    it('returns a non-empty string', () => {
      const id = genId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('returns unique values', () => {
      const id1 = genId();
      const id2 = genId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('escapeHtml', () => {
    it('escapes special characters', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
      expect(escapeHtml("'test'")).toBe('&#39;test&#39;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('returns empty string for falsy input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as any)).toBe('');
    });
  });

  describe('requireResourceAccess', () => {
    it('throws on invalid table', async () => {
      await expect(requireResourceAccess({} as any, 'invalid_table', 'id', {})).rejects.toThrow('Invalid table');
    });

    it('resolves for platform_admin without needing db access at all', async () => {
      // `platform_admin` é o único papel global: a checagem nem chega a
      // consultar o banco, então `{} as any` no lugar de `D1Database` não
      // quebra — se quebrasse, provaria justamente que o bypass parou de ser
      // o primeiro `if`.
      await expect(requireResourceAccess({} as any, 'vendors', 'id', { role: 'platform_admin' })).resolves.toBe(true);
    });

    // A camada MSP tornou "consultor" (staff) escopado por CONTA: ele só
    // alcança o recurso se `conta_id` bater com a conta DONA do projeto do
    // recurso, via `clientes.conta_id`. O teste antigo passava `{}` como user
    // e `{}` como db — isso não provava isolamento nenhum, só que a função não
    // quebrava. Reescrito contra D1 real para provar as duas metades:
    // consultor da conta certa entra, consultor de OUTRA conta não.
    it('resolves for staff whose account owns the project behind the resource', async () => {
      await applySchema();
      await env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-h', 'msp', 'Conta H', 'Active')`).run();
      await env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-h', 'conta-h', 'Cliente', 'Active')`).run();
      await env.DB.prepare(
        `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id) VALUES ('proj-h','Cliente','ISO 27001','controller','Active','cli-h')`
      ).run();
      await env.DB.prepare(
        `INSERT INTO risks (id, project_id, asset, threat, impact, probability) VALUES ('rsk-h','proj-h','Ativo','Ameaça',3,3)`
      ).run();

      await expect(
        requireResourceAccess(env.DB, 'risks', 'rsk-h', { role: 'consultor', conta_id: 'conta-h' })
      ).resolves.toBe(true);
    });

    it('rejects staff of a DIFFERENT account — the isolation the old test never exercised', async () => {
      await applySchema();
      await env.DB.prepare(`INSERT INTO contas (id, tipo, nome, status) VALUES ('conta-h2', 'msp', 'Conta H2', 'Active')`).run();
      await env.DB.prepare(`INSERT INTO clientes (id, conta_id, nome, status) VALUES ('cli-h2', 'conta-h2', 'Cliente', 'Active')`).run();
      await env.DB.prepare(
        `INSERT INTO projects (id, client_name, standards, org_role, status, cliente_id) VALUES ('proj-h2','Cliente','ISO 27001','controller','Active','cli-h2')`
      ).run();
      await env.DB.prepare(
        `INSERT INTO risks (id, project_id, asset, threat, impact, probability) VALUES ('rsk-h2','proj-h2','Ativo','Ameaça',3,3)`
      ).run();

      await expect(
        requireResourceAccess(env.DB, 'risks', 'rsk-h2', { role: 'consultor', conta_id: 'conta-de-outra-consultoria' })
      ).rejects.toThrow('Forbidden');
    });

    // ponytail: the source-scanning meta-test (readdirSync/readFileSync over ../src) was
    // removed because tests run in the workerd pool (vitest.config.mts), which has no
    // node:fs. It belongs in a node-pool test config — tracked as a Fase 5 follow-up.
  });
});
