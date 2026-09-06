import type { Bindings } from './index';

/**
 * Política de segurança POR TENANT (item 4.3 do `enterprise-grade-plan.md`).
 *
 * O produto tinha uma postura única para todos: MFA opcional para qualquer um,
 * sessão da mesma duração para qualquer um, sem restrição de origem. Cliente com
 * exigência própria — banco, saúde, setor público — não tinha como apertar sem
 * que a plataforma inteira apertasse junto.
 *
 * TRÊS DECISÕES QUE MOLDAM ISTO, e cada uma existe para evitar um jeito
 * específico de trancar gente para fora:
 *
 * 1. **Ausência de linha é ausência de restrição.** Tenant sem política fica
 *    exatamente como está hoje. Um default apertado numa migration trancaria
 *    clientes no deploy seguinte, e "todo mundo perdeu acesso" é pior que
 *    qualquer coisa que a política venha a prevenir.
 *
 * 2. **A política só alcança quem é ESCOPADO ao projeto.** A busca é por
 *    `user.client_project_id`; conta de staff não tem projeto, então nenhuma
 *    política a alcança. Isso não é folga: é o que garante que uma allowlist de
 *    IP mal preenchida ainda possa ser corrigida por alguém.
 *
 * 3. **MFA obrigatório não bloqueia o caminho de CONFIGURAR o MFA.** Sem essa
 *    exceção, ligar a exigência trancaria todo mundo para fora antes de qualquer
 *    um conseguir cadastrar o fator — a exigência se autoinviabilizaria.
 */

export type PoliticaTenant = {
  project_id: string;
  mfa_obrigatorio: number;
  sessao_ttl_seg: number | null;
  ip_allowlist: string | null;
};

/** Rotas que a política de MFA nunca bloqueia: são o caminho de sair da situação. */
const CAMINHO_DE_SAIDA = /^\/api\/v1\/auth\/(mfa\/(setup|activate|verify|status|disable)|me|logout|change-password|reset-password-first)$/;

export async function politicaDoProjeto(
  env: Bindings,
  projectId: string | null | undefined
): Promise<PoliticaTenant | null> {
  if (!projectId) return null;
  try {
    return await env.DB.prepare(
      'SELECT project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist FROM project_security_policy WHERE project_id = ?'
    ).bind(projectId).first<PoliticaTenant>();
  } catch {
    // Tabela ainda não existe (migration pendente). Ausência de política é
    // ausência de restrição — o mesmo que uma linha faltando.
    return null;
  }
}

/**
 * `203.0.113.7` casa com `203.0.113.7` e com `203.0.113.0/24`.
 *
 * Só IPv4. Entrada em IPv6 ou malformada NÃO casa — e como a allowlist é uma
 * lista de PERMISSÕES, não casar significa negar. Uma allowlist que aceitasse o
 * que não entende seria uma allowlist decorativa.
 */
export function ipPermitido(ip: string | null, allowlist: string | null): boolean {
  const entradas = (allowlist ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  if (!entradas.length) return true; // sem lista, sem restrição
  if (!ip) return false;

  const paraNumero = (endereco: string): number | null => {
    const partes = endereco.split('.');
    if (partes.length !== 4) return null;
    let n = 0;
    for (const p of partes) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const v = Number(p);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n >>> 0;
  };

  const alvo = paraNumero(ip);
  if (alvo === null) return false;

  for (const entrada of entradas) {
    if (entrada === ip) return true;
    const [base, bits] = entrada.split('/');
    if (bits === undefined) continue;
    const prefixo = Number(bits);
    if (!Number.isInteger(prefixo) || prefixo < 0 || prefixo > 32) continue;
    const baseNum = paraNumero(base);
    if (baseNum === null) continue;
    // `>>> 0` e o caso `prefixo === 0` à parte: em JS, `x << 32` é `x << 0`, o
    // que faria /0 virar máscara cheia — o oposto de "aceita tudo".
    const mascara = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
    if ((alvo & mascara) === (baseNum & mascara)) return true;
  }
  return false;
}

export type Recusa = { erro: string; status: 401 | 403; extra?: Record<string, unknown> };

/**
 * Aplica a política à requisição. Devolve `null` quando pode seguir.
 *
 * `totpAtivo` vem do banco, e não da sessão: a sessão é gravada no login e não
 * reflete um MFA cadastrado depois. Ler do banco é o que permite alguém sair da
 * exigência sem deslogar.
 */
export function avaliarPolitica(entrada: {
  politica: PoliticaTenant | null;
  caminho: string;
  ip: string | null;
  totpAtivo: boolean;
  iat: number | undefined;
  agora?: number;
}): Recusa | null {
  const { politica, caminho, ip, totpAtivo, iat } = entrada;
  if (!politica) return null;

  // Origem primeiro: é a restrição mais forte, e não faz sentido dizer a quem
  // está fora da rede permitida qual é o próximo obstáculo.
  if (!ipPermitido(ip, politica.ip_allowlist)) {
    return { erro: 'Forbidden: origem não permitida pela política de segurança deste cliente', status: 403 };
  }

  if (politica.sessao_ttl_seg && iat) {
    const idadeSeg = ((entrada.agora ?? Date.now()) - iat) / 1000;
    if (idadeSeg > politica.sessao_ttl_seg) {
      return { erro: 'Unauthorized: sessão expirada pela política deste cliente', status: 401 };
    }
  }

  if (politica.mfa_obrigatorio === 1 && !totpAtivo && !CAMINHO_DE_SAIDA.test(caminho)) {
    return {
      erro: 'Unauthorized: este cliente exige segundo fator. Configure em /api/v1/auth/mfa/setup',
      status: 401,
      extra: { mfa_setup_required: true },
    };
  }

  return null;
}
