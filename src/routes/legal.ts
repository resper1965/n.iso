import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, erro500 } from '../helpers';
import { validateBody, legalPublishSchema, legalAcceptSchema } from '../schemas';
import { situacaoLegal, versoesVigentes, type DocumentoLegal } from '../legal-policy';

// Documentos legais do n.iso (termos, privacidade) e o aceite de cada usuário.
//
// Fica em rota PRÓPRIA e autenticada, não em `public.ts`: o pacote de design
// trata isto como "público" porque o texto é público, mas o ACEITE é por
// usuário e precisa de sessão — sem ela não há de quem registrar data e IP.
export const legalApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function ip(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
}

async function documentosPublicados(db: D1Database): Promise<DocumentoLegal[]> {
  const { results } = await db.prepare(
    `SELECT id, kind, version, classification, title, url, published_at
       FROM legal_documents
      WHERE published_at IS NOT NULL
      ORDER BY published_at ASC`
  ).all();
  return (results || []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    version: r.version,
    classification: r.classification,
    title: r.title,
    url: r.url,
    publishedAt: r.published_at,
  }));
}

async function aceitosPor(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT document_id FROM legal_acceptances WHERE user_id = ?'
  ).bind(userId).all();
  return (results || []).map((r: any) => r.document_id);
}

/**
 * O que falta a este usuário aceitar, e se isso barra o acesso.
 * Alcançável mesmo com a sessão barrada — é a rota que mostra a saída.
 */
legalApp.get('/pending', async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 401);
    const [docs, aceitos] = await Promise.all([
      documentosPublicados(c.env.DB),
      aceitosPor(c.env.DB, user.id),
    ]);
    return c.json(situacaoLegal(docs, aceitos));
  } catch (e: any) {
    return erro500(c, 'Falha ao consultar documentos legais', e);
  }
});

/** Registra o aceite com data, IP e user-agent. Sem os três não prova nada. */
legalApp.post('/accept', async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 401);
    const v = await validateBody(c, legalAcceptSchema);
    if (!v.success) return v.response;
    const { documentIds } = v.data as { documentIds: string[] };

    // Só a versão vigente é aceitável. Sem esta checagem daria para aceitar uma
    // versão antiga (ou um rascunho) e sair do bloqueio sem ler o texto novo —
    // que é exatamente o que o versionamento existe para impedir.
    const vigentes = new Set(versoesVigentes(await documentosPublicados(c.env.DB)).map(d => d.id));
    const invalidos = documentIds.filter(id => !vigentes.has(id));
    if (invalidos.length) {
      return c.json({ error: 'Só é possível aceitar a versão vigente de cada documento.' }, 400);
    }

    const agente = (c.req.header('User-Agent') || '').slice(0, 300);
    const origem = ip(c);
    for (const docId of documentIds) {
      // Aceitar duas vezes o mesmo documento é ruído, não fato novo: o primeiro
      // aceite é o que vale, e é a data dele que importa em disputa.
      await c.env.DB.prepare(
        `INSERT INTO legal_acceptances (id, user_id, document_id, ip, user_agent)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, document_id) DO NOTHING`
      ).bind(genId(), user.id, docId, origem, agente).run();
    }

    await logAudit(
      c.env.DB, 'legal.accepted', user.email,
      `Aceite registrado para ${documentIds.length} documento(s) legal(is) (IP ${origem})`
    );

    const aceitos = await aceitosPor(c.env.DB, user.id);
    return c.json({ ok: true, ...situacaoLegal(await documentosPublicados(c.env.DB), aceitos) });
  } catch (e: any) {
    return erro500(c, 'Falha ao registrar aceite', e);
  }
});

/**
 * Publica uma versão. Restrito à administração da plataforma: uma versão
 * `material` barra o acesso de todo mundo até o aceite, e isso não é decisão de
 * usuário de tenant.
 */
legalApp.post('/documents', async (c) => {
  try {
    const user = c.get('user');
    if (!user || user.role !== 'platform_admin') {
      return c.json({ error: 'Apenas a administração da plataforma publica documento legal' }, 403);
    }
    const v = await validateBody(c, legalPublishSchema);
    if (!v.success) return v.response;
    const { kind, version, classification, title, url, publish } = v.data as any;

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO legal_documents (id, kind, version, classification, title, url, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, kind, version, classification, title, url ?? null, publish === false ? null : new Date().toISOString()).run();

    await logAudit(
      c.env.DB, 'legal.published', user.email,
      `Documento legal ${kind} ${version} publicado como ${classification}`
    );
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return c.json({ error: 'Esta versão já existe para este documento' }, 409);
    }
    return erro500(c, 'Falha ao publicar documento legal', e);
  }
});
