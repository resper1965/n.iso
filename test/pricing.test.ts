import { describe, it, expect } from 'vitest';
import { calculatePricing, Answers } from '../src/services/pricing';

describe('Pricing Service', () => {
  it('should calculate pricing for a standard small organization', () => {
    const answers: Answers = {
      empresa: 'Test Corp',
      headcount: 10,
      escopo: 'small',
      infraestrutura: 'cloud',
      arquitetura: 'monolith',
    };
    const result = calculatePricing(answers);
    expect(result.tier.name).toBeDefined();
    expect(result.precoFinal).toBeGreaterThan(0);
    expect(result.fases.length).toBeGreaterThan(0);
  });

  it('should increase price with headcount', () => {
    const smallAnswers: Answers = { headcount: 10, escopo: 'small' };
    const largeAnswers: Answers = { headcount: 500, escopo: 'large' };
    
    const smallResult = calculatePricing(smallAnswers);
    const largeResult = calculatePricing(largeAnswers);
    
    expect(largeResult.precoFinal).toBeGreaterThan(smallResult.precoFinal);
  });
});
