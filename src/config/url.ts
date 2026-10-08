/**
 * Endereço canônico do n.iso. Links de e-mail, callback de SSO, base do SCIM, CORS e os hosts do
 * MCP saem daqui, NUNCA do host da requisição: o IdP do cliente cadastra um callback só, e um host
 * alternativo gerava outro. `APP_URL` (wrangler.jsonc) sobrescreve o padrão.
 */
export const APP_URL_PADRAO = 'https://niso.ness.com.br';

export function appUrl(env?: { APP_URL?: string }): string {
  const url = env?.APP_URL || APP_URL_PADRAO;
  // Sem regex: `/\/+$/` é quadrática com muitas barras seguidas de outro caractere (js/polynomial-redos).
  let fim = url.length;
  while (fim > 0 && url.charCodeAt(fim - 1) === 47) fim--;
  return url.slice(0, fim);
}

/** Hosts antigos que o Worker ainda recebe só para redirecionar (308) ao `appUrl` (src/index.ts). */
export const HOSTS_LEGADOS = ['n-iso.ness.com.br', 'niso.ness.workers.dev'];
