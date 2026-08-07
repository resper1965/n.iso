import { describe, it, expect } from 'vitest';
import { apiKeyRoleViolation, isAuditWrite } from '../src/auth-policy';

const FINDINGS = '/api/v1/audits/AUD-1/findings';
const FINDING_ITEM = '/api/v1/audit-findings/F-1';
const GEN_POLICY = '/api/v1/projects/PROJ-1/generate-policy';

describe('isAuditWrite', () => {
  it('POST em /audits/:id/findings é escrita de auditoria', () => {
    expect(isAuditWrite('POST', FINDINGS)).toBe(true);
    expect(isAuditWrite('POST', FINDINGS + '/')).toBe(true);
  });
  it('GET no mesmo path não é escrita', () => {
    expect(isAuditWrite('GET', FINDINGS)).toBe(false);
  });
  it('gerar política não é escrita de auditoria', () => {
    expect(isAuditWrite('POST', GEN_POLICY)).toBe(false);
  });
  it('PUT e DELETE de achado (/audit-findings/:id) também são escrita de auditoria', () => {
    expect(isAuditWrite('PUT', FINDING_ITEM)).toBe(true);
    expect(isAuditWrite('DELETE', FINDING_ITEM)).toBe(true);
    expect(isAuditWrite('GET', FINDING_ITEM)).toBe(false);
  });
});

describe('apiKeyRoleViolation — separação consultor × auditor', () => {
  it('consultor gera política (permitido)', () => {
    expect(apiKeyRoleViolation('consultant', 'POST', GEN_POLICY)).toBeNull();
  });
  it('consultor NÃO registra achado', () => {
    expect(apiKeyRoleViolation('consultant', 'POST', FINDINGS)).toContain('consultor');
  });
  it('consultor NÃO edita nem apaga achado', () => {
    expect(apiKeyRoleViolation('consultant', 'PUT', FINDING_ITEM)).toContain('consultor');
    expect(apiKeyRoleViolation('consultant', 'DELETE', FINDING_ITEM)).toContain('consultor');
  });
  it('auditor PODE editar/apagar achado', () => {
    expect(apiKeyRoleViolation('auditor', 'PUT', FINDING_ITEM)).toBeNull();
    expect(apiKeyRoleViolation('auditor', 'DELETE', FINDING_ITEM)).toBeNull();
  });
  it('auditor lê tudo', () => {
    expect(apiKeyRoleViolation('auditor', 'GET', GEN_POLICY)).toBeNull();
  });
  it('auditor registra achado (permitido)', () => {
    expect(apiKeyRoleViolation('auditor', 'POST', FINDINGS)).toBeNull();
  });
  it('auditor NÃO gera política', () => {
    expect(apiKeyRoleViolation('auditor', 'POST', GEN_POLICY)).toContain('auditor');
  });
  it("papéis 'write'/'admin'/'read' não sofrem restrição de papel", () => {
    expect(apiKeyRoleViolation('write', 'POST', FINDINGS)).toBeNull();
    expect(apiKeyRoleViolation('admin', 'POST', GEN_POLICY)).toBeNull();
    expect(apiKeyRoleViolation('read', 'POST', FINDINGS)).toBeNull();
  });
});
