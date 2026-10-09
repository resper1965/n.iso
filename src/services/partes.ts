import { logAudit } from '../helpers';

/** Nome comparável: sem caixa e sem espaço repetido. Não tira acento (a spec pede nome exato). */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Lotes de 50: ponytail, teto de statements por batch do D1; sobe se um projeto passar de milhares de linhas. */
async function emLotes(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const saida: D1Result[] = [];
  for (let i = 0; i < stmts.length; i += 50) saida.push(...(await db.batch(stmts.slice(i, i + 50))));
  return saida;
}

const mudancas = (rs: D1Result[]) => rs.reduce((s, r) => s + (r.meta.changes ?? 0), 0);

export type ResumoImportacao = { criadas: number; reaproveitadas: number; vinculos: number };

/**
 * Traz as pessoas que o projeto já tem para `partes`: governança (menos os `consultor`, que são da ness.),
 * fornecedores e partes interessadas. Repetível: reaproveita a parte do mesmo tipo e nome, e o vínculo é
 * `INSERT OR IGNORE` sobre a UNIQUE.
 */
export async function importarPartes(db: D1Database, projectId: string, ator: string): Promise<ResumoImportacao> {
  const [gov, ven, stk, existentes] = await Promise.all([
    db.prepare(`SELECT name, email, role_category FROM project_governance WHERE project_id = ? AND role_category != 'consultor' ORDER BY rowid`)
      .bind(projectId).all<{ name: string; email: string | null; role_category: string }>(),
    db.prepare('SELECT name FROM vendors WHERE project_id = ? ORDER BY rowid').bind(projectId).all<{ name: string }>(),
    db.prepare('SELECT name FROM stakeholders WHERE project_id = ? ORDER BY rowid').bind(projectId).all<{ name: string }>(),
    db.prepare('SELECT id, nome, tipo FROM partes WHERE project_id = ?').bind(projectId).all<{ id: string; nome: string; tipo: string }>(),
  ]);

  const ids = new Map<string, string>();
  for (const p of existentes.results) if (!ids.has(`${p.tipo}|${norm(p.nome)}`)) ids.set(`${p.tipo}|${norm(p.nome)}`, p.id);

  const partes: D1PreparedStatement[] = [];
  const vinculos: D1PreparedStatement[] = [];
  let criadas = 0;
  let reaproveitadas = 0;

  const garantir = (tipo: 'pessoa' | 'organizacao', nome: string, email: string | null): string => {
    const chave = `${tipo}|${norm(nome)}`;
    const achou = ids.get(chave);
    if (achou) { reaproveitadas++; return achou; }
    const id = crypto.randomUUID();
    ids.set(chave, id);
    criadas++;
    partes.push(db.prepare('INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, ?, ?, ?)')
      .bind(id, projectId, tipo, nome.trim(), email ? email.trim().toLowerCase() : null));
    return id;
  };
  const vincular = (parteId: string, papel: string) => vinculos.push(
    db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, 'projeto', ?)`)
      .bind(crypto.randomUUID(), projectId, parteId, papel, projectId));

  for (const g of gov.results) vincular(garantir('pessoa', g.name, g.email), g.role_category === 'dpo' ? 'encarregado' : 'responsavel');
  for (const v of ven.results) vincular(garantir('organizacao', v.name, null), 'terceiro');
  for (const s of stk.results) vincular(garantir('organizacao', s.name, null), 'parte_interessada');

  await emLotes(db, partes); // as partes primeiro: o vínculo tem FK para elas
  const novos = mudancas(await emLotes(db, vinculos));
  await logAudit(db, 'partes.importadas', ator, `Importação de partes: ${criadas} criadas, ${reaproveitadas} reaproveitadas, ${novos} vínculos`, '', '', projectId);
  return { criadas, reaproveitadas, vinculos: novos };
}

/** Tabela e colunas que entram em SQL vêm só daqui, nunca da requisição. */
const FONTES = [
  { tabela: 'risks', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'compliance_controls', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'ropa_records', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'corrective_actions', coluna: 'assigned_to', parte: 'assigned_to_parte_id' },
  { tabela: 'checklist_progress', coluna: 'assigned_to', parte: 'assigned_to_parte_id' },
] as const;

export type Pendencia = { tabela: string; coluna: string; texto: string; n: number };
export type RelatorioConciliacao = { casados: Record<string, number>; sem_correspondencia: Pendencia[]; ambiguos: Pendencia[] };

/**
 * Liga o responsável em texto à parte de mesmo nome (exato, sem caixa e sem espaço repetido), por projeto.
 * Nome que bate com mais de uma parte é ambíguo e não é ligado. Só considera linha ainda sem parte; o texto
 * nunca é alterado. O dono do ativo vira vínculo `responsavel` do item. Repetível.
 */
export async function conciliarResponsaveis(db: D1Database, projectId: string, ator: string): Promise<RelatorioConciliacao> {
  const partes = await db.prepare('SELECT id, nome FROM partes WHERE project_id = ?').bind(projectId).all<{ id: string; nome: string }>();
  const porNome = new Map<string, string[]>();
  for (const p of partes.results) porNome.set(norm(p.nome), [...(porNome.get(norm(p.nome)) ?? []), p.id]);

  const casados: Record<string, number> = {};
  const sem = new Map<string, Pendencia>();
  const amb = new Map<string, Pendencia>();
  const anotar = (mapa: Map<string, Pendencia>, tabela: string, coluna: string, texto: string) => {
    const k = `${tabela}|${norm(texto)}`;
    const atual = mapa.get(k);
    if (atual) atual.n++; else mapa.set(k, { tabela, coluna, texto: texto.trim(), n: 1 });
  };
  /** A parte única de um nome, ou null (e anota por quê). */
  const resolver = (tabela: string, coluna: string, texto: string): string | null => {
    const achadas = porNome.get(norm(texto));
    if (!achadas) { anotar(sem, tabela, coluna, texto); return null; }
    if (achadas.length > 1) { anotar(amb, tabela, coluna, texto); return null; }
    return achadas[0];
  };

  for (const f of FONTES) {
    const linhas = await db.prepare(
      `SELECT id, ${f.coluna} AS texto FROM ${f.tabela} WHERE project_id = ? AND ${f.parte} IS NULL AND trim(COALESCE(${f.coluna}, '')) != ''`
    ).bind(projectId).all<{ id: string; texto: string }>();
    const stmts: D1PreparedStatement[] = [];
    for (const l of linhas.results) {
      const parte = resolver(f.tabela, f.coluna, l.texto);
      if (parte) stmts.push(db.prepare(`UPDATE ${f.tabela} SET ${f.parte} = ? WHERE id = ? AND project_id = ? AND ${f.parte} IS NULL`).bind(parte, l.id, projectId));
    }
    casados[f.tabela] = mudancas(await emLotes(db, stmts));
  }

  const itens = await db.prepare(
    `SELECT id, responsavel_texto AS texto FROM itens WHERE project_id = ? AND tipo = 'ativo' AND status = 'ativo' AND trim(COALESCE(responsavel_texto, '')) != ''`
  ).bind(projectId).all<{ id: string; texto: string }>();
  const vinculos: D1PreparedStatement[] = [];
  for (const i of itens.results) {
    const parte = resolver('itens', 'responsavel_texto', i.texto);
    if (parte) vinculos.push(db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'responsavel', 'item', ?)`)
      .bind(crypto.randomUUID(), projectId, parte, i.id));
  }
  casados.itens = mudancas(await emLotes(db, vinculos));

  const ordenar = (m: Map<string, Pendencia>) => [...m.values()].sort((a, b) => a.tabela.localeCompare(b.tabela) || a.texto.localeCompare(b.texto));
  const relatorio = { casados, sem_correspondencia: ordenar(sem), ambiguos: ordenar(amb) };
  await logAudit(db, 'partes.conciliadas', ator,
    `Conciliação de responsáveis: ${Object.values(casados).reduce((a, b) => a + b, 0)} ligados, ${relatorio.sem_correspondencia.length} sem correspondência, ${relatorio.ambiguos.length} ambíguos`, '', '', projectId);
  return relatorio;
}
