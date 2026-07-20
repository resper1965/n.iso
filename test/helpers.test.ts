import { describe, it, expect } from 'vitest';
import { genId, escapeHtml, requireResourceAccess } from '../src/helpers';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

    it('all tables used in requireResourceAccess call sites exist in ALLOWED_TABLES', async () => {
      const srcDir = join(__dirname, '../src');
      const filesToScan: string[] = [];

      function scanDir(dir: string) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            filesToScan.push(fullPath);
          }
        }
      }
      scanDir(srcDir);

      const foundTables = new Set<string>();
      const regex = /requireResourceAccess\s*\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;

      for (const filePath of filesToScan) {
        const content = readFileSync(filePath, 'utf8');
        let match;
        while ((match = regex.exec(content)) !== null) {
          foundTables.add(match[1]);
        }
      }

      // Each table used in requireResourceAccess must not throw "Invalid table"
      for (const table of foundTables) {
        const testCheck = requireResourceAccess({} as any, table, 'id', { role: 'consultor' });
        await expect(testCheck).resolves.toBe(true);
      }
    });
  });
});
