import { aprovacoesDoProjeto, type Aprovacao } from './documentos';
import { ehLegitimoInteresse } from './lia';

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
  aprovacao: Aprovacao;
  /** LIA exigida quando a base é legítimo interesse; DPIA pendente quando o registro a pede e não há nenhuma ligada (fatia 5). */
  lia: { exigida: boolean; existe: boolean; status: string | null };
  dpias: { id: string; nome: string | null; status: string | null }[];
  dpia_pendente: boolean;
  base_legal: { id: string; referencia: string; titulo: string } | null;
  itens: { id: string; nome: string; tipo: string }[];
  departamentos: { id: string; nome: string }[];
  partes: { vinculo_id: string; parte_id: string; nome: string; tipo: string; papel: string }[];
  transferencias: { id: string; pais: string; destinatario_parte_id: string | null; destinatario: string | null; mecanismo: string | null; observacao: string | null }[];
};

/** Tudo o que o registro usa, numa leitura só. null = registro não é do projeto. */
export async function lerLigacoes(db: D1Database, projectId: string, ropaId: string): Promise<Ligacoes | null> {
  const base = await db.prepare(
    `SELECT r.base_legal_id AS id, q.referencia AS referencia, q.titulo AS titulo, r.legal_basis AS legal_basis, r.dpia_required AS dpia_required FROM ropa_records r
       LEFT JOIN requisitos q ON q.id = r.base_legal_id WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<{ id: string | null; referencia: string | null; titulo: string | null; legal_basis: string | null; dpia_required: number | null }>();
  if (!base) return null;
  const [itens, deptos, partes, transf, dpias, lia] = await db.batch([
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
    db.prepare(`SELECT id, COALESCE(processing_name, system_name) AS nome, status FROM dpia_assessments WHERE ropa_id = ? AND project_id = ? ORDER BY created_at, rowid`).bind(ropaId, projectId),
    db.prepare(`SELECT status FROM lia_assessments WHERE ropa_id = ? AND project_id = ?`).bind(ropaId, projectId),
  ]);
  const liaLinha = (lia.results as { status: string }[])[0];
  const dpiasLidas = dpias.results as Ligacoes['dpias'];
  return {
    aprovacao: (await aprovacoesDoProjeto(db, projectId, ropaId, 'tratamento')).get(ropaId) ?? { ciso: null, ceo: null },
    lia: { exigida: ehLegitimoInteresse(base.titulo, base.legal_basis), existe: !!liaLinha, status: liaLinha?.status ?? null },
    dpias: dpiasLidas,
    dpia_pendente: !!base.dpia_required && dpiasLidas.length === 0,
    base_legal: base.id && base.referencia ? { id: base.id, referencia: base.referencia, titulo: base.titulo ?? '' } : null,
    itens: itens.results as Ligacoes['itens'],
    departamentos: deptos.results as Ligacoes['departamentos'],
    partes: partes.results as Ligacoes['partes'],
    transferencias: transf.results as Ligacoes['transferencias'],
  };
}

// ─── Diagrama (fatia 4.2) ────────────────────────────────────────────────────────────────────────────

/**
 * Rótulo seguro para Mermaid: sem aspas, colchetes, chaves, barras, crases, `#` (entidade), `<`/`>` (HTML) nem quebra
 * de linha, e com teto de tamanho. O nome vem do cadastro; o diagrama nunca pode ser o caminho para HTML ou sintaxe injetada.
 */
export function rotuloMermaid(texto: string | null | undefined, max = 80): string {
  const limpo = String(texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/["'`#<>{}\[\]|\\;]/g, '').replace(/\s+/g, ' ').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo || '—';
}

const ROTULO_PAPEL: Record<string, string> = {
  operador: 'operador', cocontrolador: 'cocontrolador', suboperador: 'suboperador', terceiro: 'destinatário', responsavel: 'responsável',
};

/** Mermaid derivado das ligações (spec seção 5): nunca guardado, sempre refeito do cadastro. */
export function montarDiagrama(registro: { finalidade: string; titulares: string | null }, lig: Ligacoes): string {
  const linhas = ['flowchart LR'];
  let n = 0;
  const no = (rotulo: string) => { const id = `n${n++}`; linhas.push(`  ${id}["${rotuloMermaid(rotulo)}"]`); return id; };
  const t = no(registro.finalidade);
  if (registro.titulares) { const s = no(`Titulares: ${registro.titulares}`); linhas.push(`  ${s} --> ${t}`); }
  for (const d of lig.departamentos) linhas.push(`  ${no(`Depto: ${d.nome}`)} --> ${t}`);
  for (const i of lig.itens) linhas.push(`  ${t} --> ${no(`${i.nome} (${i.tipo})`)}`);
  for (const p of lig.partes) linhas.push(`  ${t} --- ${no(`${p.nome} (${ROTULO_PAPEL[p.papel] ?? p.papel})`)}`);
  for (const x of lig.transferencias) {
    const destino = no(x.destinatario ?? 'Destinatário não informado');
    linhas.push(`  ${t} -->|"${rotuloMermaid(`${x.pais}${x.mecanismo ? ` · ${x.mecanismo}` : ''}`, 60)}"| ${destino}`);
  }
  return linhas.join('\n');
}

/** O diagrama do registro, ou null se ele não é do projeto. */
export async function diagramaDoTratamento(db: D1Database, projectId: string, ropaId: string): Promise<string | null> {
  const reg = await db.prepare('SELECT processing_purpose, data_subjects FROM ropa_records WHERE id = ? AND project_id = ?')
    .bind(ropaId, projectId).first<{ processing_purpose: string; data_subjects: string | null }>();
  if (!reg) return null;
  const lig = await lerLigacoes(db, projectId, ropaId);
  return lig ? montarDiagrama({ finalidade: reg.processing_purpose, titulares: reg.data_subjects }, lig) : null;
}
