// D2 — domínio canônico de evaluation_status. Trava a decisão: 'conforme' (grafia
// divergente que o wizard gravava) NÃO faz parte do enum; o canônico é
// pending|conforming|partial|non_conforming.
import { describe, it, expect } from 'vitest';
import { EVALUATION_STATUSES } from '../src/constants';

describe('EVALUATION_STATUSES (D2)', () => {
  it('é o conjunto canônico e não inclui a grafia divergente', () => {
    expect([...EVALUATION_STATUSES].sort()).toEqual(['conforming', 'non_conforming', 'partial', 'pending']);
    expect(EVALUATION_STATUSES).not.toContain('conforme');
  });
});
