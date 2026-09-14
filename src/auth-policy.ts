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

// ——— Política de tentativas de login (caminho de conta local) ——————————
// Tudo abaixo é FUNÇÃO PURA: a contagem mora no KV (routes/auth.ts), a decisão
// mora aqui, para poder ser testada sem rede nem banco.

/** A partir de quantas falhas o desafio anti-abuso passa a ser exigido. */
export const FALHAS_ATE_DESAFIO = 1;
/** Em qual falha a conta é bloqueada temporariamente. */
export const FALHAS_ATE_BLOQUEIO = 5;
/** Duração do bloqueio temporário. */
export const BLOQUEIO_SEG = 15 * 60;
/** Janela em que as falhas se acumulam. */
export const JANELA_FALHAS_SEG = 15 * 60;

export interface DecisaoLogin {
  /** Conta+IP em bloqueio temporário: nem tenta conferir a senha. */
  bloqueado: boolean;
  /** O desafio anti-abuso precisa ser resolvido nesta tentativa. */
  exigeDesafio: boolean;
  /** Quantas tentativas restam antes do bloqueio. Nunca negativo. */
  tentativasRestantes: number;
}

/**
 * Decide o que vale para UMA tentativa, dadas as falhas já acumuladas.
 *
 * `desafioVerificavel` é falso quando não há segredo configurado para conferir
 * o desafio. Nesse caso ele NÃO é exigido nem anunciado: pedir na tela um
 * desafio que o servidor não sabe validar é teatro — atrapalha quem é legítimo
 * e não custa nada a quem automatiza. O bloqueio continua valendo, e é ele que
 * de fato segura a força bruta.
 */
export function decisaoLogin(falhas: number, desafioVerificavel: boolean): DecisaoLogin {
  const acumuladas = Math.max(0, Math.floor(falhas) || 0);
  return {
    bloqueado: acumuladas >= FALHAS_ATE_BLOQUEIO,
    exigeDesafio: desafioVerificavel && acumuladas >= FALHAS_ATE_DESAFIO,
    tentativasRestantes: Math.max(0, FALHAS_ATE_BLOQUEIO - acumuladas),
  };
}

/**
 * Mensagem de credencial inválida. NUNCA diz qual campo errou: distinguir
 * "e-mail não existe" de "senha errada" entrega ao atacante a lista de contas
 * válidas do tenant. Por isso a contagem também é por (e-mail digitado + IP),
 * exista a conta ou não — senão o próprio número de tentativas denunciaria.
 */
export function mensagemCredencialInvalida(tentativasRestantes: number): string {
  const n = Math.max(0, tentativasRestantes);
  const restam = n === 1
    ? 'Resta 1 tentativa antes do bloqueio temporário.'
    : `Restam ${n} tentativas antes do bloqueio temporário.`;
  return `E-mail ou senha incorretos. ${restam}`;
}

/** Mensagem do bloqueio. Também não revela se a conta existe. */
export function mensagemBloqueio(): string {
  return `Muitas tentativas incorretas. Tente novamente em ${BLOQUEIO_SEG / 60} minutos.`;
}

// ——— Expiração por inatividade ————————————————————————————————————————
// Parâmetros decididos no pacote de design: 30 min para papel de Cliente, 8 h
// para consultor — com a revalidação diária garantida pelo teto absoluto de 24 h
// da própria sessão (SESSION_TTL_SEC), que a renovação por atividade não estica.

export const INATIVIDADE_CLIENTE_SEG = 30 * 60;
export const INATIVIDADE_CONSULTOR_SEG = 8 * 60 * 60;

/** Papéis do lado do cliente; o resto é gente que opera a plataforma. */
const PAPEIS_CLIENTE = new Set(['client', 'org_user', 'org_admin', 'client_admin']);

export function limiteInatividadeSeg(role: string | undefined): number {
  return PAPEIS_CLIENTE.has(role ?? '') ? INATIVIDADE_CLIENTE_SEG : INATIVIDADE_CONSULTOR_SEG;
}

/**
 * Sessão sem marca de último acesso cai no `iat`; sem os dois, expira — sessão
 * cuja idade não dá para provar não é sessão que se renova sozinha.
 */
export function expirouPorInatividade(
  agoraMs: number,
  ultimoAcessoMs: number | undefined,
  role: string | undefined
): boolean {
  if (!ultimoAcessoMs || !Number.isFinite(ultimoAcessoMs)) return true;
  return (agoraMs - ultimoAcessoMs) > limiteInatividadeSeg(role) * 1000;
}
