import { describe, it, expect } from 'vitest';
import { calcScore, getTier, calculatePricing, calcEconomics, getScopeInfo } from '../src/services/pricing';

describe('Pricing Engine', () => {
  describe('Group 1: calcScore', () => {
    it('returns score 0 for empty answers (or default base)', () => {
      expect(calcScore({})).toBe(4);
    });

    it('known answers produce expected scores', () => {
      const answers = {
        iam: 'Sem IAM centralizado', // 4
        backup: 'Sem backup', // 5
        existing_policies: 'Pol1||Pol2||Pol3', // count = 3 => no bonus
        pentest: 'Anual com reteste' // no bonus
      };
      // Total: 4 + 5 = 9
      expect(calcScore(answers)).toBe(9);
    });
  });

  describe('Group 2: getTier', () => {
    it('Score 0-12 = Foundation (tier 1)', () => {
      const tier = getTier(10);
      expect(tier.tier).toBe(1);
      expect(tier.name).toBe('Foundation');
    });

    it('Score 13-24 = Standard (tier 2)', () => {
      const tier = getTier(20);
      expect(tier.tier).toBe(2);
      expect(tier.name).toBe('Standard');
    });

    it('Score 25+ = Enterprise (tier 3)', () => {
      const tier = getTier(30);
      expect(tier.tier).toBe(3);
      expect(tier.name).toBe('Enterprise');
    });
  });

  describe('Group 3: calculatePricing', () => {
    it('Returns a PricingResult with tier, score, phases, economics', () => {
      const answers = {
        iam: 'SSO + MFA obrigatório', // 0
        existing_policies: 'Pol1||Pol2||Pol3||Pol4',
        pentest: 'Anual com reteste',
        headcount: '10'
      };
      const result = calculatePricing(answers);
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('fases');
      expect(result).toHaveProperty('eco');
      expect(result.tier.tier).toBe(1);
    });

    it('Complex enterprise answers = higher tier', () => {
      const answers = {
        iam: 'Sem IAM centralizado', // 4
        backup: 'Sem backup', // 5
        logging: 'Sem monitoramento', // 5
        sdlc: 'Sem processo formal', // 4
        ropa: 'Inexistente', // 4
        headcount: '1000'
      };
      const result = calculatePricing(answers);
      expect(result.tier.tier).toBeGreaterThanOrEqual(3);
    });

    it('All economics fields are present and numeric', () => {
      const result = calculatePricing({});
      expect(typeof result.eco.custoDireto).toBe('number');
      expect(typeof result.eco.overhead).toBe('number');
      expect(typeof result.eco.custoTotal).toBe('number');
      expect(typeof result.eco.valorTributos).toBe('number');
      expect(typeof result.eco.totalTributosPct).toBe('number');
      expect(typeof result.eco.receitaLiquida).toBe('number');
      expect(typeof result.eco.margemOp).toBe('number');
      expect(typeof result.eco.margemPct).toBe('number');
      expect(typeof result.eco.taxaBlendada).toBe('number');
      expect(typeof result.eco.viavel).toBe('boolean');
    });
  });

  describe('Group 4: calcEconomics', () => {
    it('viability check: margin > 0 is viable', () => {
      const eco = calcEconomics(100000, 2, 20);
      expect(typeof eco.viavel).toBe('boolean');
    });

    it('tax calculation is correct', () => {
      const eco = calcEconomics(100000, 2, 20);
      // default tributos: 0.05 + 0.0165 + 0.076 + 0.04 + 0.0225 = 0.205
      expect(eco.totalTributosPct).toBeCloseTo(0.205);
      expect(eco.valorTributos).toBeCloseTo(20500);
    });

    it('overhead is applied correctly', () => {
      const eco = calcEconomics(100000, 2, 20);
      // custoDireto = 20 * 700 = 14000
      // overhead = 14000 * 0.22 = 3080
      expect(eco.overhead).toBeCloseTo(3080);
    });
  });

  describe('Group 5: getScopeInfo', () => {
    it('Different headcounts produce correct multipliers', () => {
      expect(getScopeInfo(undefined, 10).fator).toBe(1.0);
      expect(getScopeInfo(undefined, '100').fator).toBe(1.3);
      expect(getScopeInfo(undefined, '101-250').fator).toBe(1.6);
      expect(getScopeInfo(undefined, '500+').fator).toBe(2.0);
    });

    it('Unknown scope returns default', () => {
      expect(getScopeInfo(undefined, 'unknown').fator).toBe(1.0);
      expect(getScopeInfo().fator).toBe(1.0);
    });
  });
});
