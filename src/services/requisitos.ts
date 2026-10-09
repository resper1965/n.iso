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
