/**
 * Endereço canônico do n.iso. Links de e-mail, callback de SSO, base do SCIM, CORS e os hosts do
 * MCP saem daqui, NUNCA do host da requisição: o IdP do cliente cadastra um callback só, e um host
 * alternativo gerava outro. Staging sobrescreve por `env.APP_URL` (wrangler.jsonc).
 */
export const APP_URL_PADRAO = 'https://niso.ness.com.br';

export function appUrl(env?: { APP_URL?: string }): string {
  return (env?.APP_URL || APP_URL_PADRAO).replace(/\/+$/, '');
}
