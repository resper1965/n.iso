import { genId } from '../helpers';

/**
 * Ativos sobre `itens` + `item_seguranca` (migration 0048). A API de ativos devolve a MESMA forma de
 * quando a tabela se chamava `assets` (nomes em inglês, `status` Active/Removido), então tela, MCP e CSV
 * não mudam. Todo nome de coluna que entra em SQL vem de `CAMPOS`, nunca da requisição.
 */
const CAMPOS = {
  name: { tabela: 'itens', coluna: 'nome' },
  description: { tabela: 'itens', coluna: 'descricao' },
  owner: { tabela: 'itens', coluna: 'responsavel_texto' },
  type: { tabela: 'item_seguranca', coluna: 'subtipo' },
  category: { tabela: 'item_seguranca', coluna: 'categoria' },
  classification: { tabela: 'item_seguranca', coluna: 'classificacao' },
  criticality: { tabela: 'item_seguranca', coluna: 'criticidade' },
  location: { tabela: 'item_seguranca', coluna: 'localizacao' },
  confidentiality_rating: { tabela: 'item_seguranca', coluna: 'nota_c' },
  integrity_rating: { tabela: 'item_seguranca', coluna: 'nota_i' },
  availability_rating: { tabela: 'item_seguranca', coluna: 'nota_d' },
} as const;

export type CampoAtivo = keyof typeof CAMPOS;
export const CAMPOS_ATIVO = Object.keys(CAMPOS) as CampoAtivo[];
export type CamposAtivo = Partial<Record<CampoAtivo, string | number | null>>;

export const ATIVO_SELECT = `SELECT i.id, i.project_id, i.nome AS name, s.subtipo AS type, s.categoria AS category,
    s.classificacao AS classification, s.criticidade AS criticality, i.descricao AS description,
    i.responsavel_texto AS owner, s.localizacao AS location,
    CASE i.status WHEN 'removido' THEN 'Removido' ELSE 'Active' END AS status,
    s.nota_c AS confidentiality_rating, s.nota_i AS integrity_rating, s.nota_d AS availability_rating,
    i.created_at, i.updated_at
  FROM itens i LEFT JOIN item_seguranca s ON s.item_id = i.id`;

export async function listarAtivos(db: D1Database, projectId: string): Promise<Record<string, unknown>[]> {
  const r = await db.prepare(`${ATIVO_SELECT} WHERE i.project_id = ? AND i.tipo = 'ativo' AND i.status != 'removido' ORDER BY i.created_at DESC`).bind(projectId).all();
  return r.results as Record<string, unknown>[];
}

export async function lerAtivo(db: D1Database, id: string): Promise<Record<string, unknown> | null> {
  return db.prepare(`${ATIVO_SELECT} WHERE i.id = ? AND i.tipo = 'ativo'`).bind(id).first<Record<string, unknown>>();
}

/** Cria o item e o bloco de segurança juntos (um batch é uma transação no D1). Mesmos padrões de antes. */
export async function criarAtivo(db: D1Database, projectId: string, b: CamposAtivo & { name: string }, id: string = genId()): Promise<string> {
  await db.batch([
    db.prepare(`INSERT INTO itens (id, project_id, nome, descricao, responsavel_texto, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
      .bind(id, projectId, b.name, b.description || '', b.owner || ''),
    db.prepare(`INSERT INTO item_seguranca (item_id, project_id, categoria, subtipo, classificacao, criticidade, localizacao, nota_c, nota_i, nota_d)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, b.category || 'Hardware', b.type ?? null, b.classification || 'Confidential', b.criticality || 'Medium',
        b.location ?? null, b.confidentiality_rating ?? 3, b.integrity_rating ?? 3, b.availability_rating ?? 3),
  ]);
  return id;
}

/**
 * Atualização parcial: só os campos presentes. Devolve quantas linhas de `itens` casaram (0 = não achou).
 * `projectId` nulo = sem corte de projeto (rota de topo, que já passou por `requireResourceAccess`).
 */
export async function atualizarAtivo(db: D1Database, id: string, projectId: string | null, campos: CamposAtivo): Promise<number> {
  const sets: Record<'itens' | 'item_seguranca', { sql: string[]; binds: unknown[] }> = {
    itens: { sql: [], binds: [] },
    item_seguranca: { sql: [], binds: [] },
  };
  for (const k of CAMPOS_ATIVO) {
    if (campos[k] === undefined) continue;
    sets[CAMPOS[k].tabela].sql.push(`${CAMPOS[k].coluna} = ?`);
    sets[CAMPOS[k].tabela].binds.push(campos[k]);
  }
  if (!sets.itens.sql.length && !sets.item_seguranca.sql.length) return 0;
  const corte = projectId === null ? '' : ' AND project_id = ?';
  const alvo = projectId === null ? [id] : [id, projectId];
  const lote = [
    db.prepare(`UPDATE itens SET ${[...sets.itens.sql, "updated_at = datetime('now')"].join(', ')} WHERE id = ? AND tipo = 'ativo'${corte}`)
      .bind(...sets.itens.binds, ...alvo),
  ];
  if (sets.item_seguranca.sql.length) {
    lote.push(db.prepare(`UPDATE item_seguranca SET ${sets.item_seguranca.sql.join(', ')} WHERE item_id = ?${corte}`).bind(...sets.item_seguranca.binds, ...alvo));
  }
  const r = await db.batch(lote);
  return r[0].meta.changes ?? 0;
}

/** Remoção lógica (o histórico do ativo fica). Já removido responde 0, como antes. */
export async function removerAtivo(db: D1Database, id: string, projectId: string): Promise<number> {
  const r = await db.prepare(
    `UPDATE itens SET status = 'removido', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND tipo = 'ativo' AND status != 'removido'`
  ).bind(id, projectId).run();
  return r.meta.changes ?? 0;
}
