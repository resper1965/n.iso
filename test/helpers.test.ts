import { describe, it, expect } from 'vitest';
import { genId, escapeHtml, requireResourceAccess } from '../src/helpers';

describe('helpers', () => {
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
  });
});
