import { ISO_27001_2022, ISO_27001_2022_STANDARD } from '../data/iso27001-2022';
import { ISO_27701_2025_CONTROLLER, ISO_27701_2025_PROCESSOR, ISO_27701_2025_STANDARD } from '../data/iso27701-2025';

/**
 * Catálogo de requisitos (fatia 2 do núcleo do n.privacy, spec 4.5). Global: sem project_id.
 * Depois do seed o BANCO é a fonte da verdade: título e mapeamento são dado editável pelo platform_admin,
 * e o seed é INSERT OR IGNORE, então nunca sobrescreve o que foi editado.
 */

type Fonte = { id: string; nome: string; versao: string | null; vigente_desde: string | null };
type Linha = { id: string; fonte_id: string; referencia: string; titulo: string; papel: string | null };

const F_27001 = 'iso27001:2022';
const F_27701 = 'iso27701:2025';

// Metadado de identificação das normas (nome e ano). Nada de texto normativo nem parágrafo de lei.
export const FONTES: readonly Fonte[] = [
  { id: F_27001, nome: 'ISO/IEC 27001:2022', versao: '2022', vigente_desde: null },
  { id: F_27701, nome: 'ISO/IEC 27701:2025', versao: '2025', vigente_desde: null },
  { id: 'lgpd', nome: 'Lei Geral de Proteção de Dados (Lei 13.709/2018)', versao: '2018', vigente_desde: null },
  { id: 'gdpr', nome: 'Regulamento Geral sobre a Proteção de Dados (UE 2016/679)', versao: '2016', vigente_desde: null },
];

const FONTE_DA_NORMA: Record<string, string> = {
  [ISO_27001_2022_STANDARD]: F_27001,
  [ISO_27701_2025_STANDARD]: F_27701,
};

/** Fonte do catálogo que corresponde ao `compliance_controls.standard`; null para as normas fora do catálogo. */
export function fonteDaNorma(standard: string): string | null {
  return FONTE_DA_NORMA[standard] ?? null;
}

const idDe = (fonte: string, referencia: string) => `${fonte}:${referencia}`;

function linhasIso(): Linha[] {
  return [
    ...ISO_27001_2022.map((c) => ({ id: idDe(F_27001, c.code), fonte_id: F_27001, referencia: c.code, titulo: c.title, papel: null })),
    ...ISO_27701_2025_CONTROLLER.map((c) => ({ id: idDe(F_27701, c.code), fonte_id: F_27701, referencia: c.code, titulo: c.title, papel: 'controlador' })),
    ...ISO_27701_2025_PROCESSOR.map((c) => ({ id: idDe(F_27701, c.code), fonte_id: F_27701, referencia: c.code, titulo: c.title, papel: 'operador' })),
  ];
}

/** INSERT OR IGNORE de um lote de requisitos (JSON), para entrar num batch. */
export function stmtRequisitos(db: D1Database, linhas: readonly Linha[]): D1PreparedStatement {
  return db.prepare(
    `INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo, papel)
     SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.fonte_id'), json_extract(j.value, '$.referencia'),
            json_extract(j.value, '$.titulo'), json_extract(j.value, '$.papel')
       FROM json_each(?1) j`
  ).bind(JSON.stringify(linhas));
}

/** Semeia fontes e requisitos ISO que ainda não existem. Devolve quantos foram criados. */
export async function semearCatalogo(db: D1Database): Promise<{ fontes: number; requisitos: number }> {
  const r = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO requisito_fontes (id, nome, versao, vigente_desde)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.nome'), json_extract(j.value, '$.versao'), json_extract(j.value, '$.vigente_desde')
         FROM json_each(?1) j`
    ).bind(JSON.stringify(FONTES)),
    stmtRequisitos(db, linhasIso()),
  ]);
  return { fontes: r[0].meta.changes ?? 0, requisitos: r[1].meta.changes ?? 0 };
}

/**
 * Liga cada controle ao requisito da sua norma (norma + primeiro token do título, que é o código: o mesmo
 * critério do `stmtControles`). Só toca controle ainda sem `requisito_id`. Devolve quantos foram ligados.
 */
export async function ligarControles(db: D1Database, projectId?: string): Promise<number> {
  let total = 0;
  for (const [standard, fonte] of Object.entries(FONTE_DA_NORMA)) {
    const r = await db.prepare(
      `UPDATE compliance_controls SET requisito_id = (
         SELECT r.id FROM requisitos r WHERE r.fonte_id = ?1 AND r.referencia = substr(compliance_controls.title, 1, instr(compliance_controls.title || ' ', ' ') - 1))
       WHERE standard = ?2 AND requisito_id IS NULL AND (?3 IS NULL OR project_id = ?3)
         AND EXISTS (SELECT 1 FROM requisitos r WHERE r.fonte_id = ?1 AND r.referencia = substr(compliance_controls.title, 1, instr(compliance_controls.title || ' ', ' ') - 1))`
    ).bind(fonte, standard, projectId ?? null).run();
    total += r.meta.changes ?? 0;
  }
  return total;
}

// ─── Leitura, visibilidade e lacunas ─────────────────────────────────────────────────────────────────

/** Papéis que enxergam o mapeamento ainda `proposto`; qualquer outro só vê o `validado_juridico` (spec 4.5). */
const VE_PROPOSTO = new Set(['platform_admin', 'consultor', 'consultant', 'consultoria_admin']);
export const veMapeamentoProposto = (role: string | undefined) => VE_PROPOSTO.has(role ?? '');

export type Requisito = { id: string; fonte_id: string; referencia: string; titulo: string; pai_id: string | null; papel: string | null };
export type MapeamentoLido = { de_id: string; para_id: string; tipo: string; estado: string; validado_por: string | null; validado_em: string | null; nota: string | null };

export async function listarFontes(db: D1Database) {
  const { results } = await db.prepare(
    `SELECT f.id, f.nome, f.versao, f.vigente_desde, (SELECT count(*) FROM requisitos r WHERE r.fonte_id = f.id) AS requisitos
       FROM requisito_fontes f ORDER BY f.rowid`
  ).all<{ id: string; nome: string; versao: string | null; vigente_desde: string | null; requisitos: number }>();
  return results;
}

export async function listarRequisitos(db: D1Database, fonte?: string): Promise<Requisito[]> {
  const { results } = await db.prepare(
    `SELECT id, fonte_id, referencia, titulo, pai_id, papel FROM requisitos WHERE (?1 IS NULL OR fonte_id = ?1) ORDER BY fonte_id, rowid`
  ).bind(fonte ?? null).all<Requisito>();
  return results;
}

/** O requisito com os mapeamentos nos dois sentidos; quem não vê `proposto` recebe só os validados. */
export async function lerRequisito(db: D1Database, id: string, veProposto: boolean) {
  const r = await db.prepare('SELECT id, fonte_id, referencia, titulo, pai_id, papel FROM requisitos WHERE id = ?').bind(id).first<Requisito>();
  if (!r) return null;
  const { results } = await db.prepare(
    `SELECT de_id, para_id, tipo, estado, validado_por, validado_em, nota FROM requisito_mapeamentos
      WHERE (de_id = ?1 OR para_id = ?1) AND (?2 = 1 OR estado = 'validado_juridico') ORDER BY created_at, rowid`
  ).bind(id, veProposto ? 1 : 0).all<MapeamentoLido>();
  return { ...r, mapeamentos: results };
}

export async function requisitosDoDocumento(db: D1Database, projectId: string, documentoId: string) {
  const { results } = await db.prepare(
    `SELECT r.id, r.fonte_id, r.referencia, r.titulo FROM documento_requisitos dr JOIN requisitos r ON r.id = dr.requisito_id
      WHERE dr.project_id = ?1 AND dr.documento_id = ?2 ORDER BY r.fonte_id, r.rowid`
  ).bind(projectId, documentoId).all<{ id: string; fonte_id: string; referencia: string; titulo: string }>();
  return results;
}

/** Troca o conjunto de requisitos do documento. null = documento não é do projeto; `desconhecidos` = ids que não existem. */
export async function definirRequisitosDoDocumento(db: D1Database, projectId: string, documentoId: string, ids: string[]) {
  const doc = await db.prepare('SELECT id FROM documentos WHERE id = ? AND project_id = ?').bind(documentoId, projectId).first();
  if (!doc) return null;
  const unicos = [...new Set(ids)];
  const { results } = await db.prepare('SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(unicos)).all<{ id: string }>();
  const existentes = new Set(results.map((x) => x.id));
  const desconhecidos = unicos.filter((x) => !existentes.has(x));
  if (desconhecidos.length) return { ok: false as const, desconhecidos };
  await db.batch([
    db.prepare('DELETE FROM documento_requisitos WHERE documento_id = ? AND project_id = ?').bind(documentoId, projectId),
    db.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) SELECT ?1, value, ?2 FROM json_each(?3)`)
      .bind(documentoId, projectId, JSON.stringify(unicos)),
  ]);
  return { ok: true as const, total: unicos.length };
}

/** Requisitos a que a evidência do projeto serve. */
export async function requisitosDaEvidencia(db: D1Database, projectId: string, evidenciaId: string) {
  const { results } = await db.prepare(
    `SELECT r.id, r.fonte_id, r.referencia, r.titulo FROM evidencia_requisitos er JOIN requisitos r ON r.id = er.requisito_id
      WHERE er.project_id = ?1 AND er.evidencia_id = ?2 ORDER BY r.fonte_id, r.rowid`
  ).bind(projectId, evidenciaId).all<{ id: string; fonte_id: string; referencia: string; titulo: string }>();
  return results;
}

/** Troca o conjunto de requisitos da evidência. null = evidência não é do projeto; `desconhecidos` = ids que não existem no catálogo. */
export async function definirRequisitosDaEvidencia(db: D1Database, projectId: string, evidenciaId: string, ids: string[]) {
  if (!(await db.prepare('SELECT 1 FROM evidence WHERE id = ? AND project_id = ?').bind(evidenciaId, projectId).first())) return null;
  const unicos = [...new Set(ids)];
  const { results } = await db.prepare('SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(unicos)).all<{ id: string }>();
  const existentes = new Set(results.map((x) => x.id));
  const desconhecidos = unicos.filter((x) => !existentes.has(x));
  if (desconhecidos.length) return { ok: false as const, desconhecidos };
  await db.batch([
    db.prepare('DELETE FROM evidencia_requisitos WHERE evidencia_id = ? AND project_id = ?').bind(evidenciaId, projectId),
    db.prepare(`INSERT INTO evidencia_requisitos (evidencia_id, requisito_id, project_id) SELECT ?1, value, ?2 FROM json_each(?3)`).bind(evidenciaId, projectId, JSON.stringify(unicos)),
  ]);
  return { ok: true as const, total: unicos.length };
}

export type OrigemCobertura =
  | { tipo: 'documento'; id: string; titulo: string }
  | { tipo: 'evidencia'; id: string; titulo: string; status: string }
  | { tipo: 'controle'; id: string; titulo: string; status: string; mapeamento: 'equivalente' | 'parcial' };
export type Lacuna = { requisito_id: string; referencia: string; titulo: string; pai_id: string | null; situacao: 'coberto' | 'parcial' | 'lacuna'; origens: OrigemCobertura[] };

/**
 * Cobertura de uma fonte no projeto (spec 4.9, escopo da fatia 2). Um requisito está **coberto** se há documento
 * VIGENTE ligado a ele, ou controle do projeto (nem `Missing` nem `Not Applicable`) ligado por mapeamento
 * `validado_juridico` do tipo `equivalente`; **parcial** se só há mapeamento `parcial`; senão é **lacuna**.
 * Mapeamento `relacionado` e `proposto` nunca cobrem. Evidência (fatia 8) ligada ao requisito cobre se `conforming` e dentro da validade
 * (ou sem validade); `partial` dá cobertura parcial; vencida, pendente ou `non_conforming` não conta.
 */
export async function lacunasDaFonte(db: D1Database, projectId: string, fonte: string): Promise<Lacuna[]> {
  const [reqs, docs, ctrls, evids] = await db.batch([
    db.prepare('SELECT id, referencia, titulo, pai_id FROM requisitos WHERE fonte_id = ? ORDER BY rowid').bind(fonte),
    db.prepare(
      `SELECT dr.requisito_id AS requisito_id, d.id AS id, d.titulo AS titulo
         FROM documento_requisitos dr JOIN documentos d ON d.id = dr.documento_id
        WHERE dr.project_id = ?1 AND d.status = 'vigente' AND dr.requisito_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`
    ).bind(projectId, fonte),
    db.prepare(
      `SELECT m.para_id AS requisito_id, c.id AS id, c.title AS titulo, c.status AS status, m.tipo AS tipo
         FROM requisito_mapeamentos m JOIN compliance_controls c ON c.requisito_id = m.de_id
        WHERE c.project_id = ?1 AND m.estado = 'validado_juridico' AND m.tipo IN ('equivalente', 'parcial')
          AND COALESCE(c.status, 'Missing') NOT IN ('Missing', 'Not Applicable')
          AND m.para_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)
        UNION ALL
       SELECT m.de_id, c.id, c.title, c.status, m.tipo
         FROM requisito_mapeamentos m JOIN compliance_controls c ON c.requisito_id = m.para_id
        WHERE c.project_id = ?1 AND m.estado = 'validado_juridico' AND m.tipo IN ('equivalente', 'parcial')
          AND COALESCE(c.status, 'Missing') NOT IN ('Missing', 'Not Applicable')
          AND m.de_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`
    ).bind(projectId, fonte),
    db.prepare(
      `SELECT er.requisito_id AS requisito_id, e.id AS id, e.file_name AS titulo, e.evaluation_status AS status
         FROM evidencia_requisitos er JOIN evidence e ON e.id = er.evidencia_id
        WHERE er.project_id = ?1 AND e.project_id = ?1 AND e.evaluation_status IN ('conforming', 'partial')
          AND (e.valido_ate IS NULL OR e.valido_ate >= date('now')) AND er.requisito_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`
    ).bind(projectId, fonte),
  ]);
  const origens = new Map<string, OrigemCobertura[]>();
  const somar = (rid: string, o: OrigemCobertura) => origens.set(rid, [...(origens.get(rid) ?? []), o]);
  for (const d of docs.results as { requisito_id: string; id: string; titulo: string }[]) somar(d.requisito_id, { tipo: 'documento', id: d.id, titulo: d.titulo });
  for (const e of evids.results as { requisito_id: string; id: string; titulo: string; status: string }[]) somar(e.requisito_id, { tipo: 'evidencia', id: e.id, titulo: e.titulo, status: e.status });
  for (const c of ctrls.results as { requisito_id: string; id: string; titulo: string; status: string; tipo: 'equivalente' | 'parcial' }[]) {
    somar(c.requisito_id, { tipo: 'controle', id: c.id, titulo: c.titulo, status: c.status, mapeamento: c.tipo });
  }
  return (reqs.results as { id: string; referencia: string; titulo: string; pai_id: string | null }[]).map((r) => {
    const o = origens.get(r.id) ?? [];
    const cobre = o.some((x) => x.tipo === 'documento' || (x.tipo === 'evidencia' && x.status === 'conforming') || (x.tipo === 'controle' && x.mapeamento === 'equivalente'));
    return { requisito_id: r.id, referencia: r.referencia, titulo: r.titulo, pai_id: r.pai_id, situacao: cobre ? 'coberto' : o.length ? 'parcial' : 'lacuna', origens: o };
  });
}
