import { logAudit } from '../helpers';
import { hashConteudo } from './pedidos';
import type { DocumentoCriar } from '../schemas';

/** Erro de regra de negócio, com o status que a rota devolve. */
export type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

/** Nome da tabela entra no SQL: só destes dois literais, nunca da requisição. */
const existeNoProjeto = async (db: D1Database, tabela: 'documentos' | 'partes', id: string, projectId: string): Promise<boolean> =>
  !!(await db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ? AND project_id = ?`).bind(id, projectId).first());

const unico = (e: unknown) => String((e as { message?: string })?.message ?? e).includes('UNIQUE');

/** Hash da versão: o mesmo SHA-256 canônico dos pedidos, sobre o texto. */
export const hashDoTexto = (texto: string) => hashConteudo({ texto });

const SELECT_DOCUMENTO = `
  SELECT d.id, d.tipo, d.titulo, d.pai_id, d.dono_parte_id, d.revisar_a_cada_meses, d.revisar_ate, d.status, d.created_at, d.updated_at,
    (SELECT v.numero FROM documento_versoes v WHERE v.documento_id = d.id AND v.estado = 'vigente') AS versao_vigente,
    EXISTS (SELECT 1 FROM documento_versoes v WHERE v.documento_id = d.id AND v.estado = 'rascunho') AS tem_rascunho
  FROM documentos d WHERE d.project_id = ?`;

type LinhaDocumento = Record<string, unknown> & { tem_rascunho: number };
const comBooleano = (d: LinhaDocumento) => ({ ...d, tem_rascunho: !!d.tem_rascunho });

export async function listarDocumentos(db: D1Database, projectId: string) {
  const r = await db.prepare(`${SELECT_DOCUMENTO} ORDER BY d.titulo`).bind(projectId).all<LinhaDocumento>();
  return r.results.map(comBooleano);
}

/** O documento com todas as versões (texto incluso). ponytail: sem paginação, um documento tem poucas versões. */
export async function lerDocumento(db: D1Database, projectId: string, id: string) {
  const d = await db.prepare(`${SELECT_DOCUMENTO} AND d.id = ?`).bind(projectId, id).first<LinhaDocumento>();
  if (!d) return null;
  const v = await db.prepare(
    `SELECT numero, estado, origem, hash, texto, criado_por, criado_em FROM documento_versoes WHERE documento_id = ? AND project_id = ? ORDER BY numero`
  ).bind(id, projectId).all();
  return { ...comBooleano(d), versoes: v.results };
}

export async function criarDocumento(db: D1Database, projectId: string, ator: string, dados: DocumentoCriar): Promise<Falha | { ok: true; id: string }> {
  if (dados.pai_id && !(await existeNoProjeto(db, 'documentos', dados.pai_id, projectId))) return falha(400, 'pai_id inexistente ou de outro projeto');
  if (dados.dono_parte_id && !(await existeNoProjeto(db, 'partes', dados.dono_parte_id, projectId))) return falha(400, 'dono_parte_id inexistente ou de outro projeto');
  const id = crypto.randomUUID();
  const hash = await hashDoTexto(dados.texto);
  await db.batch([
    db.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, pai_id, dono_parte_id, revisar_a_cada_meses) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, dados.tipo, dados.titulo, dados.pai_id ?? null, dados.dono_parte_id ?? null, dados.revisar_a_cada_meses ?? null),
    db.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES (?, ?, ?, 1, ?, ?, 'rascunho', 'humano', ?)`)
      .bind(crypto.randomUUID(), projectId, id, dados.texto, hash, ator),
  ]);
  await logAudit(db, 'documento.criado', ator, `Documento ${id} criado: ${dados.titulo}`, '', '', projectId);
  return { ok: true, id };
}

/**
 * Salva o texto no rascunho do documento. Um rascunho por documento: se já existe, o texto dele é
 * substituído (mesmo número); se não, nasce o próximo número.
 */
export async function salvarRascunho(
  db: D1Database, projectId: string, documentoId: string, ator: string, texto: string, origem: 'humano' | 'agente' | 'gerador',
): Promise<Falha | { ok: true; numero: number; criada: boolean }> {
  if (!(await existeNoProjeto(db, 'documentos', documentoId, projectId))) return falha(404, 'Documento não encontrado');
  const hash = await hashDoTexto(texto);

  const atualizou = await db.prepare(
    `UPDATE documento_versoes SET texto = ?, hash = ?, origem = ?, criado_por = ?, criado_em = CURRENT_TIMESTAMP
     WHERE documento_id = ? AND project_id = ? AND estado = 'rascunho'`
  ).bind(texto, hash, origem, ator, documentoId, projectId).run();
  let criada = false;
  if (!atualizou.meta.changes) {
    try {
      await db.prepare(
        `INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por)
         SELECT ?, ?, ?, COALESCE(MAX(numero), 0) + 1, ?, ?, 'rascunho', ?, ? FROM documento_versoes WHERE documento_id = ?`
      ).bind(crypto.randomUUID(), projectId, documentoId, texto, hash, origem, ator, documentoId).run();
      criada = true;
    } catch (e) {
      // Duas gravações ao mesmo tempo: o índice de um rascunho por documento barrou a segunda.
      if (unico(e)) return falha(409, 'Já existe um rascunho deste documento; salve de novo');
      throw e;
    }
  }
  const atual = await db.prepare(`SELECT numero FROM documento_versoes WHERE documento_id = ? AND project_id = ? AND estado = 'rascunho'`)
    .bind(documentoId, projectId).first<{ numero: number }>();
  const numero = atual?.numero ?? 0;
  await logAudit(db, 'documento.versao', ator, `Documento ${documentoId}: versão ${numero} ${criada ? 'criada' : 'atualizada'} em rascunho`, '', '', projectId);
  return { ok: true, numero, criada };
}

/**
 * Publica um rascunho: a vigente atual vira `substituida` e o rascunho vira `vigente`, no mesmo batch
 * (transação). Os UPDATEs testam o estado no próprio WHERE: se outra requisição chegou antes, nada
 * muda aqui e o resultado é 409. O índice parcial de uma vigente por documento é a trava de última instância.
 */
export async function publicarVersao(
  db: D1Database, projectId: string, documentoId: string, numero: number, ator: string,
): Promise<Falha | { ok: true; numero: number }> {
  if (!(await existeNoProjeto(db, 'documentos', documentoId, projectId))) return falha(404, 'Documento não encontrado');
  const v = await db.prepare(`SELECT estado FROM documento_versoes WHERE documento_id = ? AND project_id = ? AND numero = ?`)
    .bind(documentoId, projectId, numero).first<{ estado: string }>();
  if (!v) return falha(404, 'Versão não encontrada');
  if (v.estado !== 'rascunho') return falha(409, 'Só um rascunho pode ser publicado');

  const [, publicou] = await db.batch([
    db.prepare(
      `UPDATE documento_versoes SET estado = 'substituida'
       WHERE documento_id = ? AND project_id = ? AND estado = 'vigente'
         AND EXISTS (SELECT 1 FROM documento_versoes WHERE documento_id = ? AND numero = ? AND estado = 'rascunho')`
    ).bind(documentoId, projectId, documentoId, numero),
    db.prepare(`UPDATE documento_versoes SET estado = 'vigente' WHERE documento_id = ? AND project_id = ? AND numero = ? AND estado = 'rascunho'`)
      .bind(documentoId, projectId, numero),
    db.prepare(
      `UPDATE documentos SET status = 'vigente', updated_at = CURRENT_TIMESTAMP,
         revisar_ate = CASE WHEN revisar_a_cada_meses IS NOT NULL THEN date('now', '+' || revisar_a_cada_meses || ' months') END
       WHERE id = ? AND project_id = ?
         AND EXISTS (SELECT 1 FROM documento_versoes WHERE documento_id = ? AND numero = ? AND estado = 'vigente')`
    ).bind(documentoId, projectId, documentoId, numero),
  ]);
  if (!publicou.meta.changes) return falha(409, 'Só um rascunho pode ser publicado');
  await logAudit(db, 'documento.publicado', ator, `Documento ${documentoId}: versão ${numero} publicada`, '', '', projectId);
  return { ok: true, numero };
}

export type ResumoImportacaoDocumentos = {
  criados: number; ja_existiam: number; versoes: number; ignorados_nao_aplicavel: number; ignorados_sem_texto: number;
};

/**
 * Traz as políticas que já existem para `documentos`. Hoje a política é o texto em
 * `compliance_controls.description` com o histórico em `policy_versions`, mas `description` preenchida NÃO
 * quer dizer política (em produção é texto de catálogo em quase todo controle). O sinal de política é ter
 * versão em `policy_versions`, aprovação CISO/CEO ou pedido `tipo = 'politica'`. Controle "Não aplicável"
 * fica de fora: ali `description` é a justificativa da SoA.
 *
 * As versões vêm de `policy_versions` em ordem, renumeradas de 1 a n; se o texto atual do controle difere da
 * última (ou não há versões), entra mais uma com ele. A última é a vigente. Repetível: o controle que já tem
 * documento (`origem_control_id`) é pulado. Um batch por controle: documento e versões entram juntos ou não entram.
 */
export async function importarDocumentos(db: D1Database, projectId: string, ator: string): Promise<ResumoImportacaoDocumentos> {
  const [controles, historico] = await Promise.all([
    db.prepare(
      `SELECT c.id, c.title, c.description, c.status,
         EXISTS (SELECT 1 FROM documentos d WHERE d.origem_control_id = c.id) AS ja
       FROM compliance_controls c
       WHERE c.project_id = ?
         AND (EXISTS (SELECT 1 FROM policy_versions pv WHERE pv.control_id = c.id)
              OR c.ciso_approved_by IS NOT NULL OR c.ceo_approved_by IS NOT NULL
              OR EXISTS (SELECT 1 FROM pedidos p WHERE p.project_id = c.project_id AND p.tipo = 'politica' AND p.ref_id = c.id))
       ORDER BY c.id`
    ).bind(projectId).all<{ id: string; title: string; description: string | null; status: string | null; ja: number }>(),
    db.prepare(
      `SELECT pv.control_id, pv.policy_text, pv.created_by FROM policy_versions pv
       JOIN compliance_controls c ON c.id = pv.control_id
       WHERE c.project_id = ? ORDER BY pv.control_id, pv.version, pv.rowid`
    ).bind(projectId).all<{ control_id: string; policy_text: string; created_by: string | null }>(),
  ]);

  const porControle = new Map<string, { texto: string; por: string | null }[]>();
  for (const h of historico.results) {
    if (!h.policy_text?.trim()) continue;
    porControle.set(h.control_id, [...(porControle.get(h.control_id) ?? []), { texto: h.policy_text, por: h.created_by }]);
  }

  const resumo: ResumoImportacaoDocumentos = { criados: 0, ja_existiam: 0, versoes: 0, ignorados_nao_aplicavel: 0, ignorados_sem_texto: 0 };
  for (const c of controles.results) {
    if (c.status === 'Not Applicable') { resumo.ignorados_nao_aplicavel++; continue; }
    if (c.ja) { resumo.ja_existiam++; continue; }

    const versoes = [...(porControle.get(c.id) ?? [])];
    if (c.description?.trim() && versoes.at(-1)?.texto !== c.description) versoes.push({ texto: c.description, por: ator });
    if (!versoes.length) { resumo.ignorados_sem_texto++; continue; }

    const id = crypto.randomUUID();
    const hashes = await Promise.all(versoes.map((v) => hashDoTexto(v.texto)));
    await db.batch([
      db.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status, origem_control_id) VALUES (?, ?, 'politica', ?, 'vigente', ?)`)
        .bind(id, projectId, c.title, c.id),
      ...versoes.map((v, i) =>
        db.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, 'humano', ?)`)
          .bind(crypto.randomUUID(), projectId, id, i + 1, v.texto, hashes[i], i === versoes.length - 1 ? 'vigente' : 'substituida', v.por ?? ator)),
    ]);
    resumo.criados++;
    resumo.versoes += versoes.length;
  }
  await logAudit(db, 'documentos.importados', ator,
    `Importação de políticas: ${resumo.criados} criadas, ${resumo.ja_existiam} já existiam, ${resumo.versoes} versões, ` +
    `${resumo.ignorados_nao_aplicavel} não aplicáveis e ${resumo.ignorados_sem_texto} sem texto ignorados`, '', '', projectId);
  return resumo;
}
