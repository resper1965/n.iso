import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { ehComercial, podeAdministrarOrg, genId, logAudit, erro500 } from '../helpers';
import { validateBody, servicoSchema } from '../schemas';
import type { Servico } from '../schemas';
import { exigirOrg } from '../services/organizacao';
import { catalogoInicialNess } from '../services/catalogo-inicial';

export const servicosApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const NEGADO = { error: 'Forbidden: Área comercial restrita ao comercial da ness.' };
const json = (v: unknown) => (v == null ? null : JSON.stringify(v));
const lista = (v: unknown) => (v == null ? undefined : JSON.parse(v as string));

type Entrada = ReturnType<typeof servicoSchema.parse>;

export function paraColunas(s: Entrada): Record<string, unknown> {
  const x = s as any;
  return {
    nome: s.nome, norma: s.norma, descricao: s.descricao, tipo: s.tipo,
    forma_preco: x.formaPreco ?? null, valor_fixo: x.valorFixo ?? null,
    mensalidade: x.mensalidade ?? null, prazo_minimo_meses: x.prazoMinimoMeses ?? null,
    dias_por_faixa: json(x.diasPorFaixa), fases: json(x.fases), entregaveis: json(x.entregaveis),
    criterio_aceite: x.criterioAceite ?? '', incluso_mes: json(x.inclusoMes),
    premissas: json(s.premissas), exclusoes: json(s.exclusoes),
  };
}

export function deLinha(r: any): Servico {
  const base = {
    id: r.id, orgId: r.org_id, ativo: r.ativo === 1,
    nome: r.nome, norma: r.norma, descricao: r.descricao, tipo: r.tipo,
    premissas: lista(r.premissas) ?? [], exclusoes: lista(r.exclusoes) ?? [],
  };
  if (r.tipo === 'projeto') return { ...base, diasPorFaixa: lista(r.dias_por_faixa), fases: lista(r.fases) } as Servico;
  if (r.tipo === 'recorrente') {
    return { ...base, mensalidade: r.mensalidade, prazoMinimoMeses: r.prazo_minimo_meses, inclusoMes: lista(r.incluso_mes) } as Servico;
  }
  const avulso = { ...base, formaPreco: r.forma_preco, entregaveis: lista(r.entregaveis), criterioAceite: r.criterio_aceite };
  return (r.forma_preco === 'fixo' ? { ...avulso, valorFixo: r.valor_fixo } : { ...avulso, diasPorFaixa: lista(r.dias_por_faixa) }) as Servico;
}

function stmtInserir(db: D1Database, orgId: string, s: Entrada, ativo: boolean): { id: string; stmt: D1PreparedStatement } {
  const id = genId();
  const cols = { id, org_id: orgId, ...paraColunas(s), ativo: ativo ? 1 : 0 };
  const nomes = Object.keys(cols);
  const stmt = db.prepare(`INSERT INTO servicos (${nomes.join(', ')}) VALUES (${nomes.map(() => '?').join(', ')})`).bind(...Object.values(cols));
  return { id, stmt };
}
const inserir = async (db: D1Database, orgId: string, s: Entrada, ativo: boolean): Promise<string> => {
  const { id, stmt } = stmtInserir(db, orgId, s, ativo);
  await stmt.run();
  return id;
};

const achar = (db: D1Database, orgId: string, id: string) =>
  db.prepare('SELECT * FROM servicos WHERE id = ? AND org_id = ?').bind(id, orgId).first<any>();

// Catálogo carrega preço e custo: nem leitura para quem não é do comercial.
servicosApp.use('*', async (c, next) => {
  if (!ehComercial(c.get('user'))) return c.json(NEGADO, 403);
  await next();
});
servicosApp.use('*', exigirOrg);

servicosApp.get('/', async (c) => {
  try {
    const so = c.req.query('ativos') === '1' ? ' AND ativo = 1' : '';
    const { results } = await c.env.DB.prepare(`SELECT * FROM servicos WHERE org_id = ?${so} ORDER BY created_at, nome`)
      .bind(c.get('orgId')).all<any>();
    return c.json(results.map(deLinha));
  } catch (e) { return erro500(c, 'Erro ao listar o catálogo', e); }
});

servicosApp.post('/semear-padrao', async (c) => {
  try {
    const user = c.get('user');
    const orgId = c.get('orgId');
    if (!podeAdministrarOrg(user, orgId)) return c.json({ error: 'Forbidden: só o administrador da organização semeia o catálogo' }, 403);
    const ja = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM servicos WHERE org_id = ?').bind(orgId).first<{ n: number }>();
    if (ja && ja.n > 0) return c.json({ error: 'A organização já tem serviços no catálogo' }, 409);
    // Os INSERTs vão num batch (tudo ou nada). ponytail: o COUNT acima e o batch não são atômicos entre si;
    // duas semeaduras simultâneas duplicariam. Só o administrador da organização chega aqui; fechar com INSERT ... WHERE NOT EXISTS se virar problema.
    await c.env.DB.batch(catalogoInicialNess().map(({ ativo, ...s }) => stmtInserir(c.env.DB, orgId, servicoSchema.parse(s), ativo !== false).stmt));
    await logAudit(c.env.DB, 'servico.semeado', user.email ?? 'system', `Catálogo inicial semeado na organização ${orgId}`);
    const { results } = await c.env.DB.prepare('SELECT * FROM servicos WHERE org_id = ? ORDER BY created_at, nome').bind(orgId).all<any>();
    return c.json(results.map(deLinha), 201);
  } catch (e) { return erro500(c, 'Erro ao semear o catálogo', e); }
});

servicosApp.get('/:id', async (c) => {
  try {
    const r = await achar(c.env.DB, c.get('orgId'), c.req.param('id'));
    return r ? c.json(deLinha(r)) : c.json({ error: 'Serviço não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Erro ao ler o serviço', e); }
});

servicosApp.post('/', async (c) => {
  try {
    const user = c.get('user');
    const v = await validateBody(c, servicoSchema);
    if (!v.success) return v.response;
    const orgId = c.get('orgId');
    const id = await inserir(c.env.DB, orgId, v.data, true);
    await logAudit(c.env.DB, 'servico.criado', user?.email ?? 'system', `Serviço ${id} (${v.data.nome}) criado na organização ${orgId}`);
    return c.json(deLinha(await achar(c.env.DB, orgId, id)), 201);
  } catch (e) { return erro500(c, 'Erro ao criar o serviço', e); }
});

servicosApp.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const orgId = c.get('orgId');
    const id = c.req.param('id');
    if (!(await achar(c.env.DB, orgId, id))) return c.json({ error: 'Serviço não encontrado' }, 404);
    const v = await validateBody(c, servicoSchema);
    if (!v.success) return v.response;
    const cols = paraColunas(v.data);
    const nomes = Object.keys(cols);
    await c.env.DB.prepare(`UPDATE servicos SET ${nomes.map((n) => `${n} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?`)
      .bind(...Object.values(cols), id, orgId).run();
    await logAudit(c.env.DB, 'servico.atualizado', user?.email ?? 'system', `Serviço ${id} (${v.data.nome}) atualizado`);
    return c.json(deLinha(await achar(c.env.DB, orgId, id)));
  } catch (e) { return erro500(c, 'Erro ao atualizar o serviço', e); }
});

for (const [acao, ativo, evento] of [['arquivar', 0, 'servico.arquivado'], ['reativar', 1, 'servico.reativado']] as const) {
  servicosApp.post(`/:id/${acao}`, async (c) => {
    try {
      const user = c.get('user');
      const orgId = c.get('orgId');
      const id = c.req.param('id');
      if (!(await achar(c.env.DB, orgId, id))) return c.json({ error: 'Serviço não encontrado' }, 404);
      await c.env.DB.prepare('UPDATE servicos SET ativo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ?')
        .bind(ativo, id, orgId).run();
      await logAudit(c.env.DB, evento, user?.email ?? 'system', `Serviço ${id} ${acao === 'arquivar' ? 'arquivado' : 'reativado'}`);
      return c.json(deLinha(await achar(c.env.DB, orgId, id)));
    } catch (e) { return erro500(c, `Erro ao ${acao} o serviço`, e); }
  });
}
