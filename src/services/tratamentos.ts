/**
 * Núcleo do n.privacy, fatia 4.1: ligações do registro do RoPA (`ropa_records`, que é o tratamento).
 * Item e departamento são N:N (conjunto trocado de uma vez); a transferência é linha própria; as partes do tratamento
 * ficam em `parte_vinculos` com `alvo_tipo = 'tratamento'`. Tudo é conferido contra o projeto do registro.
 */

const LIGACOES = {
  itens: { ligacao: 'tratamento_itens', coluna: 'item_id', alvo: 'itens' },
  departamentos: { ligacao: 'tratamento_departamentos', coluna: 'departamento_id', alvo: 'departamentos' },
} as const;
export type TipoLigacao = keyof typeof LIGACOES;

const registroDoProjeto = (db: D1Database, projectId: string, ropaId: string) =>
  db.prepare('SELECT id FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first();

/**
 * Troca o conjunto de itens (ou departamentos) do registro. null = registro não é do projeto;
 * `invalidos` = ids que não existem ou são de outro projeto.
 */
export async function definirLigacao(db: D1Database, projectId: string, ropaId: string, tipo: TipoLigacao, ids: string[]) {
  if (!(await registroDoProjeto(db, projectId, ropaId))) return null;
  const { ligacao, coluna, alvo } = LIGACOES[tipo]; // nomes vêm da constante acima, nunca da requisição
  const unicos = [...new Set(ids)];
  const { results } = await db.prepare(`SELECT id FROM ${alvo} WHERE project_id = ?1 AND id IN (SELECT value FROM json_each(?2))`)
    .bind(projectId, JSON.stringify(unicos)).all<{ id: string }>();
  const validos = new Set(results.map((r) => r.id));
  const invalidos = unicos.filter((x) => !validos.has(x));
  if (invalidos.length) return { ok: false as const, invalidos };
  await db.batch([
    db.prepare(`DELETE FROM ${ligacao} WHERE ropa_id = ? AND project_id = ?`).bind(ropaId, projectId),
    db.prepare(`INSERT INTO ${ligacao} (ropa_id, ${coluna}, project_id) SELECT ?1, value, ?2 FROM json_each(?3)`).bind(ropaId, projectId, JSON.stringify(unicos)),
  ]);
  return { ok: true as const, total: unicos.length };
}

export type NovaTransferencia = { pais: string; destinatario_parte_id?: string | null; mecanismo?: string | null; observacao?: string | null };

export async function criarTransferencia(db: D1Database, projectId: string, ropaId: string, d: NovaTransferencia) {
  if (!(await registroDoProjeto(db, projectId, ropaId))) return { ok: false as const, status: 404 as const, error: 'Registro do RoPA não encontrado' };
  if (d.destinatario_parte_id) {
    const parte = await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(d.destinatario_parte_id, projectId).first();
    if (!parte) return { ok: false as const, status: 400 as const, error: 'Destinatário inexistente ou de outro projeto' };
  }
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO tratamento_transferencias (id, project_id, ropa_id, pais, destinatario_parte_id, mecanismo, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, projectId, ropaId, d.pais, d.destinatario_parte_id ?? null, d.mecanismo ?? null, d.observacao ?? null).run();
  return { ok: true as const, id };
}

export async function removerTransferencia(db: D1Database, projectId: string, ropaId: string, id: string) {
  const r = await db.prepare('DELETE FROM tratamento_transferencias WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).run();
  return (r.meta.changes ?? 0) > 0;
}

export type Ligacoes = {
  base_legal: { id: string; referencia: string; titulo: string } | null;
  itens: { id: string; nome: string; tipo: string }[];
  departamentos: { id: string; nome: string }[];
  partes: { vinculo_id: string; parte_id: string; nome: string; tipo: string; papel: string }[];
  transferencias: { id: string; pais: string; destinatario_parte_id: string | null; destinatario: string | null; mecanismo: string | null; observacao: string | null }[];
};

/** Tudo o que o registro usa, numa leitura só. null = registro não é do projeto. */
export async function lerLigacoes(db: D1Database, projectId: string, ropaId: string): Promise<Ligacoes | null> {
  const base = await db.prepare(
    `SELECT r.base_legal_id AS id, q.referencia AS referencia, q.titulo AS titulo FROM ropa_records r
       LEFT JOIN requisitos q ON q.id = r.base_legal_id WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<{ id: string | null; referencia: string | null; titulo: string | null }>();
  if (!base) return null;
  const [itens, deptos, partes, transf] = await db.batch([
    db.prepare(`SELECT i.id, i.nome, i.tipo FROM tratamento_itens t JOIN itens i ON i.id = t.item_id WHERE t.ropa_id = ? AND t.project_id = ? ORDER BY i.nome`).bind(ropaId, projectId),
    db.prepare(`SELECT d.id, d.nome FROM tratamento_departamentos t JOIN departamentos d ON d.id = t.departamento_id WHERE t.ropa_id = ? AND t.project_id = ? ORDER BY d.nome`).bind(ropaId, projectId),
    db.prepare(
      `SELECT v.id AS vinculo_id, p.id AS parte_id, p.nome AS nome, p.tipo AS tipo, v.papel AS papel FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
        WHERE v.alvo_tipo = 'tratamento' AND v.alvo_id = ? AND v.project_id = ? ORDER BY v.papel, p.nome`
    ).bind(ropaId, projectId),
    db.prepare(
      `SELECT t.id, t.pais, t.destinatario_parte_id, p.nome AS destinatario, t.mecanismo, t.observacao FROM tratamento_transferencias t
         LEFT JOIN partes p ON p.id = t.destinatario_parte_id WHERE t.ropa_id = ? AND t.project_id = ? ORDER BY t.created_at, t.rowid`
    ).bind(ropaId, projectId),
  ]);
  return {
    base_legal: base.id && base.referencia ? { id: base.id, referencia: base.referencia, titulo: base.titulo ?? '' } : null,
    itens: itens.results as Ligacoes['itens'],
    departamentos: deptos.results as Ligacoes['departamentos'],
    partes: partes.results as Ligacoes['partes'],
    transferencias: transf.results as Ligacoes['transferencias'],
  };
}
