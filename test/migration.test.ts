import { describe, it, expect } from 'vitest';
import { MigrationService } from '../src/services/migration-service';

describe('MigrationService', () => {
  describe('migrateSoA', () => {
    it('maps 2013 controls to 2022', () => {
      const result = MigrationService.migrateSoA({
        'A.5.1.1': true,
        'A.6.1.1': false,
        'UNKNOWN': true
      });
      
      expect(result.newSoA['A.5.1']).toBe(true);
      expect(result.newSoA['A.5.2']).toBe(false);
      expect(result.newSoA['UNKNOWN']).toBeUndefined();
    });

    it('identifies gaps for new controls', () => {
      const result = MigrationService.migrateSoA({});
      expect(result.gaps).toContain('A.5.7');
      expect(result.gaps).toContain('A.5.23');
      expect(result.newSoA['A.5.7']).toBe(false);
    });
  });

  describe('migrateSoA27701', () => {
    it('maps 2019 controls to 2025', () => {
      const result = MigrationService.migrateSoA27701({
        '7.2.1': true,
        'UNKNOWN': true
      });
      
      expect(result.newSoA['A.1.1']).toBe(true);
      expect(result.newSoA['UNKNOWN']).toBeUndefined();
    });

    it('identifies gaps for new controls', () => {
      const result = MigrationService.migrateSoA27701({});
      expect(result.gaps).toContain('A.1.18');
      expect(result.gaps).toContain('A.2.14');
      expect(result.newSoA['A.1.18']).toBe(false);
    });
  });
});
