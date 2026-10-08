/**
 * Endereço canônico do n.iso. Links de e-mail, callback de SSO, base do SCIM, CORS e os hosts do
 * MCP saem daqui, NUNCA do host da requisição: o IdP do cliente cadastra um callback só, e um host
 * alternativo gerava outro. `APP_URL` (wrangler.jsonc) sobrescreve o padrão.
 */
export const APP_URL_PADRAO = 'https://niso.ness.com.br';

export function appUrl(env?: { APP_URL?: string }): string {
  return (env?.APP_URL || APP_URL_PADRAO).replace(/\/+$/, '');
}

/** Hosts antigos que o Worker ainda recebe só para redirecionar (308) ao `appUrl` (src/index.ts). */
export const HOSTS_LEGADOS = ['n-iso.ness.com.br', 'niso.ness.workers.dev'];
