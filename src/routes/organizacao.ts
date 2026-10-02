import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { ehComercial, podeAdministrarOrg, logAudit, erro500 } from '../helpers';
import { validateBody, configOrgSchema } from '../schemas';
import { lerConfigOrg, exigirOrg, formatarNumeroProposta, mesclarPreco } from '../services/organizacao';
import { LOGO_MAX_BYTES, MIME_LOGO, tipoPelosBytes, type TipoLogo } from '../services/logo-org';
import { lerBytesComTeto } from '../middleware/body-guard';

export const organizacaoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
organizacaoApp.use('*', exigirOrg);

// Configuração carrega custo interno e margem: nem leitura para quem não é do comercial.
organizacaoApp.get('/config', async (c) => {
  try {
    const user = c.get('user');
    if (!ehComercial(user)) return c.json({ error: 'Forbidden: Área comercial restrita ao comercial da ness.' }, 403);
    const cfg = await lerConfigOrg(c.env.DB, c.get('orgId'));
    return c.json({ ...cfg, sugestaoNumero: formatarNumeroProposta(cfg.prefixoProposta, new Date().getFullYear(), cfg.proximoNumero) });
  } catch (e) { return erro500(c, 'Erro ao ler a configuração da organização', e); }
});

// Grava: o platform_admin (qualquer organização, por X-Org-Id) e o consultoria_admin (só a dele).
organizacaoApp.put('/config', async (c) => {
  try {
    const user = c.get('user');
    const orgId = c.get('orgId');
    if (!podeAdministrarOrg(user, orgId)) return c.json({ error: 'Forbidden: só o administrador da organização altera a configuração' }, 403);
    const v = await validateBody(c, configOrgSchema);
    if (!v.success) return v.response;
    const b = v.data;
    // O prefixo é o "nome" da organização no número da proposta: único entre organizações, como no
    // provisionamento (uma consultoria não emite proposta NESS-2026-001).
    if (b.prefixoProposta && await c.env.DB.prepare('SELECT 1 FROM organizations WHERE upper(prefixo_proposta) = ? AND id <> ?')
      .bind(b.prefixoProposta, orgId).first()) {
      return c.json({ error: 'Prefixo de proposta já usado por outra organização' }, 409);
    }
    const atual = await lerConfigOrg(c.env.DB, orgId);
    const novo = {
      nome: b.nome ?? atual.nome,
      cnpj: b.cnpj === undefined ? atual.cnpj : b.cnpj,
      corDestaque: b.corDestaque ?? atual.corDestaque,
      seloNiso: b.seloNiso ?? atual.seloNiso,
      prefixoProposta: b.prefixoProposta ?? atual.prefixoProposta,
      proximoNumero: b.proximoNumero ?? atual.proximoNumero,
      preco: mesclarPreco(atual.preco, b.preco),
      textos: { ...atual.textos, ...(b.textos ?? {}) },
      secoesDesligadas: b.secoesDesligadas ?? atual.secoesDesligadas,
    };
    await c.env.DB.prepare(
      `UPDATE organizations SET name = ?, cnpj = ?, cor_destaque = ?, selo_niso = ?, prefixo_proposta = ?,
       proximo_numero = ?, config_preco = ?, textos = ?, secoes_desligadas = ? WHERE id = ?`
    ).bind(novo.nome, novo.cnpj, novo.corDestaque, novo.seloNiso ? 1 : 0, novo.prefixoProposta, novo.proximoNumero,
      JSON.stringify(novo.preco), JSON.stringify(novo.textos), JSON.stringify(novo.secoesDesligadas), orgId).run();
    await logAudit(c.env.DB, 'org.config_atualizada', user.email ?? 'system',
      `Configuração comercial da organização ${orgId} atualizada: ${Object.keys(b).join(', ') || 'nenhum campo'}`);
    return c.json(await lerConfigOrg(c.env.DB, orgId));
  } catch (e) { return erro500(c, 'Erro ao gravar a configuração da organização', e); }
});

// Logo (tarefa 6). Corpo BINÁRIO bruto, não multipart nem JSON: por isso a rota não está em
// `src/openapi.ts` (lá só entra corpo validado por zod). A validação é manual e pelos bytes, porque
// o `Content-Type` e o nome do arquivo são do cliente: tipo declarado e bytes mágicos têm de bater,
// e o teto é do stream (Content-Length só recusa cedo). Sem DELETE: só substituir.
const LOGO_INVALIDO = { error: 'Logo inválido: envie PNG ou JPEG de até 200 KB' } as const;

organizacaoApp.post('/logo', async (c) => {
  try {
    const user = c.get('user');
    const orgId = c.get('orgId');
    if (!podeAdministrarOrg(user, orgId)) return c.json({ error: 'Forbidden: só o administrador da organização altera o logo' }, 403);
    const declarado = (c.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    const esperado: TipoLogo | undefined = declarado === MIME_LOGO.png ? 'png' : declarado === MIME_LOGO.jpg ? 'jpg' : undefined;
    if (!esperado || Number(c.req.header('Content-Length') || 0) > LOGO_MAX_BYTES) return c.json(LOGO_INVALIDO, 400);
    const bytes = await lerBytesComTeto(c.req.raw, LOGO_MAX_BYTES);
    if (!bytes || tipoPelosBytes(bytes) !== esperado) return c.json(LOGO_INVALIDO, 400);

    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const chave = `logos/${orgId}/${sha}.${esperado}`;
    // o tipo gravado é o DETECTADO, nunca o do cliente
    await c.env.STORAGE.put(chave, bytes, { httpMetadata: { contentType: MIME_LOGO[esperado] } });
    await c.env.DB.prepare('UPDATE organizations SET logo_chave = ? WHERE id = ?').bind(chave, orgId).run();
    await logAudit(c.env.DB, 'org.logo_atualizado', user.email ?? 'system', `Logo da organização ${orgId}: ${chave} (${bytes.byteLength} bytes)`);
    return c.json({ ok: true, chave, tamanho: bytes.byteLength });
  } catch (e) { return erro500(c, 'Erro ao gravar o logo', e); }
});

// Equipe da organização (exigirOrg já recusa cliente e papel desconhecido). A chave vem SÓ da linha
// da organização da sessão: nenhum parâmetro do pedido escolhe o objeto.
organizacaoApp.get('/logo', async (c) => {
  try {
    const orgId = c.get('orgId');
    const r = await c.env.DB.prepare('SELECT logo_chave FROM organizations WHERE id = ?').bind(orgId).first<{ logo_chave: string | null }>();
    const chave = r?.logo_chave;
    const tipo = chave?.match(/\.(png|jpg)$/)?.[1] as TipoLogo | undefined;
    if (!chave || !tipo || !chave.startsWith(`logos/${orgId}/`)) return c.json({ error: 'Organização sem logo' }, 404);
    const obj = await c.env.STORAGE.get(chave);
    if (!obj) return c.json({ error: 'Organização sem logo' }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': MIME_LOGO[tipo], 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline',
      },
    });
  } catch (e) { return erro500(c, 'Erro ao ler o logo', e); }
});
