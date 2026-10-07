import { PHASE_CHECKLISTS } from '../constants';
import { idDoControle, sha256Hex } from '../helpers';

/** Item do checklist que a tela mostra (PHASE_CHECKLISTS), com a fase em que aparece. */
export type ItemDoChecklist = { id: string; text: string; category: string; phaseNumber: number };

export function itemDoChecklist(itemId: string): ItemDoChecklist | null {
  for (const [fase, itens] of Object.entries(PHASE_CHECKLISTS)) {
    const item = itens.find((i) => i.id === itemId);
    if (item) return { ...item, phaseNumber: Number(fase) };
  }
  return null;
}

// ponytail: a referência do controle vive no próprio texto do item ("... (A.5.1)"), o mesmo
// padrão que a lista de pendências já lê (frontend/src/globals.js). Cláusula ("Cl 4.3") não é
// controle do Anexo A. Se um dia o item precisar de mais de um controle, vira campo na lista.
export function refDoControle(texto: string): string | null {
  return /\((A\.\d+\.\d+)\)/.exec(texto)?.[1] ?? null;
}

/** Id da linha do controle do item NESTE projeto, ou null (item sem controle ou projeto sem ele). */
export async function controleDoItem(db: D1Database, projectId: string, item: ItemDoChecklist): Promise<string | null> {
  const ref = refDoControle(item.text);
  return ref ? idDoControle(db, projectId, ref) : null;
}

/**
 * Marca o item com a evidência. Não toca `notes`: é a anotação que o consultor escreveu no item
 * (antes a geração gravava um texto fixo por cima dela).
 */
export async function marcarItemComEvidencia(
  db: D1Database, projectId: string, item: ItemDoChecklist, evidenceId: string, user: { id?: string } | null | undefined,
): Promise<void> {
  // `checked_by` referencia users(id): chave de API não tem linha lá (id `apikey:…`).
  const quem = user?.id && !user.id.startsWith('apikey:') ? user.id : null;
  await db.prepare(
    `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, evidence_id)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
       is_checked = 1, checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP, evidence_id = excluded.evidence_id`
  ).bind(projectId, item.phaseNumber, item.id, quem, evidenceId).run();
}

/**
 * Documento em texto (assistente ou geração por IA) vira evidência `pending` ligada ao controle do
 * item, e o item fica marcado. Chave do R2 por evidência: com a chave por item, gerar de novo
 * sobrescrevia o arquivo da evidência anterior e o hash gravado nela deixava de bater.
 */
export async function registrarDocumentoDoItem(
  env: { DB: D1Database; STORAGE: R2Bucket }, projectId: string, item: ItemDoChecklist, conteudo: string,
  user: { id?: string; email?: string } | null | undefined, notas: string,
): Promise<{ evidenceId: string; fileName: string; r2Key: string }> {
  const evidenceId = crypto.randomUUID();
  const r2Key = `projects/${projectId}/evidence/${item.id}-${evidenceId}.md`;
  await env.STORAGE.put(r2Key, conteudo, { httpMetadata: { contentType: 'text/markdown' } });
  const controlId = await controleDoItem(env.DB, projectId, item);
  const fileName = `${item.text}.md`;
  await env.DB.prepare(
    'INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status, evaluation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evidenceId, projectId, controlId, fileName, r2Key, await sha256Hex(conteudo), 'text/markdown',
    new TextEncoder().encode(conteudo).byteLength, user?.email ?? 'system', 'pending', notas).run();
  await marcarItemComEvidencia(env.DB, projectId, item, evidenceId, user);
  return { evidenceId, fileName, r2Key };
}
