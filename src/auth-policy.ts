// Separação de papéis para API keys de agente — FUNÇÃO PURA, sem dependências,
// testável isoladamente. Complementa o controle read/write existente em
// middleware/auth.ts com a distinção consultor × auditor (independência 9.2).
//
// Superfície relevante no nível da API key (rotas autenticadas):
//  - Escrita de AUDITOR: POST /api/v1/audits/:auditId/findings (registro de achado).
//    As notas de auditoria (`/auditor/:token/notes`) são portal PÚBLICO por token —
//    não passam por api-key, logo ficam fora deste gating de propósito.
//  - Escrita de CONSULTOR: todo o resto (gerar política, SoA, migração, evidência,
//    ativo, treinamento, responder nota de auditor).
//
// Papéis 'read' | 'write' | 'admin' não são afetados (retrocompatível): o controle
// deles continua sendo o `writeCapable` do middleware.

export function isAuditWrite(method: string, path: string): boolean {
  // Criação de achado: POST /api/v1/audits/:auditId/findings
  if (method === 'POST' && /\/api\/v1\/audits\/[^/]+\/findings\/?$/.test(path)) {
    return true;
  }
  // Edição/remoção de achado: PUT|DELETE /api/v1/audit-findings/:id
  // Sem isto, um consultor poderia reescrever/apagar achados e o auditor ficaria
  // barrado de editar os seus — invertendo a separação de papéis.
  if (
    (method === 'PUT' || method === 'DELETE') &&
    /\/api\/v1\/audit-findings\/[^/]+\/?$/.test(path)
  ) {
    return true;
  }
  return false;
}

/**
 * Retorna a mensagem de erro (403) quando o papel da chave não pode agir sobre a
 * rota, ou null quando é permitido.
 */
export function apiKeyRoleViolation(
  permission: string,
  method: string,
  path: string
): string | null {
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  const auditWrite = isAuditWrite(method, path);

  if (permission === 'consultant') {
    return auditWrite
      ? 'Forbidden: consultor não registra achado de auditoria'
      : null;
  }
  if (permission === 'auditor') {
    if (!isWrite) return null;
    return auditWrite
      ? null
      : 'Forbidden: auditor só registra achado de auditoria (sem escrita de implementação)';
  }
  return null; // read | write | admin: inalterados
}
