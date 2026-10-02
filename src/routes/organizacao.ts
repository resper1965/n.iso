import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { ehComercial, logAudit, erro500 } from '../helpers';
import { validateBody, configOrgSchema } from '../schemas';
import { lerConfigOrg, exigirOrg, formatarNumeroProposta, mesclarPreco } from '../services/organizacao';

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

// O administrador de cada consultoria entra na fatia 5; até lá, só platform_admin grava.
organizacaoApp.put('/config', async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'platform_admin') return c.json({ error: 'Forbidden: só o administrador da plataforma altera a configuração' }, 403);
    const v = await validateBody(c, configOrgSchema);
    if (!v.success) return v.response;
    const b = v.data;
    const orgId = c.get('orgId');
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
