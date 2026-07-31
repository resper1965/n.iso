import { describe, it, expect } from 'vitest';
import { genId, escapeHtml, requireResourceAccess, genNumericCode, constantTimeEqual } from '../src/helpers';

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

    it('resolves for allowed tables if user is consultor', async () => {
      await expect(requireResourceAccess({} as any, 'risks', 'id', { role: 'consultor' })).resolves.toBe(true);
      await expect(requireResourceAccess({} as any, 'vendors', 'id', { role: 'platform_admin' })).resolves.toBe(true);
    });

    // ponytail: the source-scanning meta-test (readdirSync/readFileSync over ../src) was
    // removed because tests run in the workerd pool (vitest.config.mts), which has no
    // node:fs. It belongs in a node-pool test config — tracked as a Fase 5 follow-up.
  });
});
