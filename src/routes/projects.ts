import { Hono } from 'hono';
import { Bindings, Variables } from '../index';

import { genId, genToken, logAudit, validateUpload, erro500, somenteNess, sha256Hex } from '../helpers';
import { PHASE_TITLES, PHASE_CHECKLISTS } from '../constants';
import { MigrationService } from '../services/migration-service';
import { seedPhases } from '../services/project-setup';
import { controlsForRole, ISO_27701_2025_STANDARD } from '../data/iso27701-2025';
import { checkCoherence } from '../services/coherence';
import { validateBody, projectPhaseSchema, interviewSchema, evidenceMetaSchema, scopeChangeSchema, auditorTokenSchema, politicaTenantSchema, ssoConfigSchema } from '../schemas';
import { registerAssetRoutes } from './project-assets';
import { encryptSecret, decryptSecret, isEncrypted } from '../secret-crypto';
import { COLUNAS_REVOGACAO } from './controls';
import { exportarProjeto } from '../portabilidade';
import { ipPermitido } from '../politica-tenant';
import { papelValidoParaSso } from '../sso';

export const projectsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Emite o token SCIM deste cliente (item 4.2 do plano).
 *
 * O token é mostrado UMA VEZ e guardado só como hash — quem tem acesso ao banco
 * não deve conseguir se passar pelo IdP do cliente, que é justamente quem tem
 * poder de desativar contas. Mesma disciplina de `api_keys.key_hash`.
 *
 * `POST` e não `PUT`: emitir substitui o token anterior, e chamar duas vezes
 * gera dois tokens diferentes. Um `PUT` idempotente aqui esconderia isso.
 */
projectsApp.post('/:projectId/scim-token', somenteNess, async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const projeto = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    const token = `scim_${genToken()}${genToken()}`;
    const ator = c.get('user')?.email ?? 'system';

    await c.env.DB.prepare(
      `INSERT INTO project_scim (project_id, token_hash, ativo, criado_em, criado_por)
       VALUES (?, ?, 1, datetime('now'), ?)
       ON CONFLICT(project_id) DO UPDATE SET
         token_hash = excluded.token_hash, ativo = 1,
         criado_em = excluded.criado_em, criado_por = excluded.criado_por, ultimo_uso_em = NULL`
    ).bind(projectId, await sha256Hex(token), ator).run();

    await logAudit(
      c.env.DB, 'project.scim_token_issued', ator,
      `Token SCIM emitido para o projeto ${projectId} (o anterior, se havia, deixou de valer)`,
      '', '', projectId
    );

    return c.json({
      ok: true,
      token,
      base_url: `${new URL(c.req.url).origin}/scim/v2`,
      aviso: 'Guarde agora: o token não é mostrado de novo. Emitir outro invalida este.',
    }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao emitir o token SCIM', e);
  }
});

/**
 * Configuração de SSO deste cliente (item 4.1 do plano).
 *
 * Escrita restrita à ness., pelo mesmo motivo da política de segurança: quem
 * controla o `issuer` controla quem entra. Um `org_admin` que pudesse apontar o
 * SSO do próprio tenant para um IdP escolhido por ele passaria a poder emitir
 * tokens para qualquer e-mail daquele domínio.
 *
 * O `client_secret` NUNCA volta na leitura — nem mascarado com os últimos
 * dígitos. Segredo de IdP não tem por que ser lido de volta por ninguém: quem
 * precisa dele é o Worker, que o decifra na hora do login.
 */
projectsApp.get('/:projectId/sso', somenteNess, async (c) => {
  try {
    const p = await c.env.DB.prepare(
      'SELECT project_id, issuer, client_id, dominios, papel_padrao, ativo, atualizado_em, atualizado_por FROM project_sso WHERE project_id = ?'
    ).bind(c.req.param('projectId')).first();
    return c.json({ ok: true, sso: p ?? null });
  } catch (e: any) {
    return erro500(c, 'Falha ao ler a configuração de SSO', e);
  }
});

projectsApp.put('/:projectId/sso', somenteNess, async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, ssoConfigSchema);
    if (!v.success) return v.response;
    const body = v.data as any;

    const projeto = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Papel de staff atribuído por provisionamento automático transformaria
    // "quem tem e-mail do domínio" em "quem administra a plataforma".
    if (!papelValidoParaSso(body.papel_padrao)) {
      return c.json({ error: `papel_padrao não pode ser papel de plataforma: ${body.papel_padrao}` }, 400);
    }

    const chaveCripto = (c.env as any).TOKEN_ENC_KEY as string | undefined;
    if (!chaveCripto) {
      // Recusar é a decisão certa: gravar segredo de IdP em texto claro seria
      // pior que não ter SSO.
      return c.json({ error: 'TOKEN_ENC_KEY não configurada — o client_secret não pode ser gravado em claro.' }, 503);
    }
    const cifrado = await encryptSecret(body.client_secret, chaveCripto);

    const ator = c.get('user')?.email ?? 'system';
    await c.env.DB.prepare(
      `INSERT INTO project_sso (project_id, issuer, client_id, client_secret, dominios, papel_padrao, ativo, atualizado_em, atualizado_por)
       VALUES (?,?,?,?,?,?,?, datetime('now'), ?)
       ON CONFLICT(project_id) DO UPDATE SET
         issuer = excluded.issuer, client_id = excluded.client_id, client_secret = excluded.client_secret,
         dominios = excluded.dominios, papel_padrao = excluded.papel_padrao, ativo = excluded.ativo,
         atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`
    ).bind(
      projectId, body.issuer, body.client_id, cifrado,
      body.dominios.split(',').map((d: string) => d.trim().toLowerCase()).filter(Boolean).join(','),
      body.papel_padrao, body.ativo ? 1 : 0, ator
    ).run();

    await logAudit(
      c.env.DB, 'project.sso_updated', ator,
      `SSO do projeto ${projectId}: issuer=${body.issuer}, dominios=${body.dominios}, ativo=${body.ativo ? 1 : 0}`,
      '', '', projectId
    );

    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao gravar a configuração de SSO', e);
  }
});

/**
 * Política de segurança DESTE cliente (item 4.3 do plano).
 *
 * Leitura e escrita sob `/:projectId/`, então o `projectAccessMiddleware` já
 * garante que ninguém lê nem escreve a política do vizinho.
 *
 * A escrita é restrita à equipe ness. de propósito, e é uma decisão de produto
 * defensável nos dois sentidos: apertar a própria política é um pedido legítimo
 * do cliente, mas AFROUXÁ-LA de dentro tornaria o controle inútil — quem
 * conseguisse uma sessão de `org_admin` desligaria a exigência de MFA que existe
 * justamente para impedir esse cenário. Enquanto não há um fluxo de aprovação, o
 * pedido passa pela ness.
 */
projectsApp.get('/:projectId/security-policy', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const p = await c.env.DB.prepare(
      'SELECT project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist, updated_at, updated_by FROM project_security_policy WHERE project_id = ?'
    ).bind(projectId).first();
    // Sem linha, devolve a postura padrão explicitamente em vez de 404: "não há
    // política" é uma resposta, e a interface precisa dela para desenhar a tela.
    return c.json({
      ok: true,
      politica: p ?? {
        project_id: projectId,
        mfa_obrigatorio: 0,
        sessao_ttl_seg: null,
        ip_allowlist: null,
        padrao_da_plataforma: true,
      },
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao ler a política de segurança', e);
  }
});

projectsApp.put('/:projectId/security-policy', somenteNess, async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, politicaTenantSchema);
    if (!v.success) return v.response;
    const body = v.data as any;

    const projeto = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    // Uma allowlist que não casa com nada tranca o cliente inteiro para fora, e
    // o conserto exige justamente o acesso que ela nega. Recusar entrada
    // malformada AQUI é mais barato que descobrir depois.
    const entradas = (body.ip_allowlist ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
    const invalidas = entradas.filter((e: string) => !ipPermitido(e.split('/')[0], e));
    if (invalidas.length) {
      return c.json(
        { error: `Entradas inválidas na allowlist (aceita IPv4 e CIDR IPv4): ${invalidas.join(', ')}` },
        400
      );
    }

    const ator = c.get('user')?.email ?? 'system';
    await c.env.DB.prepare(
      `INSERT INTO project_security_policy (project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist, updated_at, updated_by)
       VALUES (?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(project_id) DO UPDATE SET
         mfa_obrigatorio = excluded.mfa_obrigatorio,
         sessao_ttl_seg = excluded.sessao_ttl_seg,
         ip_allowlist = excluded.ip_allowlist,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    ).bind(
      projectId,
      body.mfa_obrigatorio ? 1 : 0,
      body.sessao_ttl_seg ?? null,
      entradas.length ? entradas.join(',') : null,
      ator
    ).run();

    await logAudit(
      c.env.DB, 'project.security_policy_updated', ator,
      `Política de segurança do projeto ${projectId}: mfa=${body.mfa_obrigatorio ? 1 : 0}, ttl=${body.sessao_ttl_seg ?? 'padrão'}, ips=${entradas.length}`,
      '', '', projectId
    );

    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao gravar a política de segurança', e);
  }
});

/**
 * Portabilidade: o cliente inteiro, num arquivo (item 4.6 do plano; LGPD art.
 * 18, V).
 *
 * A guarda de tenant é o `projectAccessMiddleware`, e o que a ativa é a FORMA DA
 * URL, não o nome do parâmetro aqui: o `index.ts` registra
 * `app.use('/api/v1/projects/:projectId/*', ...)`, que casa com
 * `/api/v1/projects/<qualquer>/<algo>`. Verificado por mutação — renomear este
 * parâmetro para `:id` mantém o 403 ao vizinho. (Uma versão anterior deste
 * comentário afirmava o contrário; a mutação desmentiu.)
 *
 * O que o nome faz é ficar coerente com o que o middleware lê. E o detalhe que
 * importa de verdade: o `/*` exige um segmento DEPOIS do id, então
 * `GET /api/v1/projects/:id` — sem sufixo — NÃO passa pelo middleware e tem
 * guarda própria no handler. Rota nova sob projeto que não tenha sufixo precisa
 * lembrar disso.
 *
 * `somenteNess` NÃO é usado: o dado é do cliente, e o direito de levá-lo é dele.
 * O papel read-only (`org_user`, `client`) alcança porque é GET.
 */
projectsApp.get('/:projectId/export', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const projeto = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    const conteudo = await exportarProjeto(c.env, projectId);

    await logAudit(
      c.env.DB,
      'project.exported',
      c.get('user')?.email ?? 'system',
      `Export de portabilidade do projeto ${projectId}: ${conteudo.manifesto.total_linhas} linhas`,
      '', '', projectId
    );

    // `Content-Disposition`: o arquivo é para SAIR do produto — abrir como texto
    // no navegador é o comportamento errado para um export de portabilidade.
    return new Response(JSON.stringify(conteudo, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="niso-export-${projectId}-${conteudo.manifesto.gerado_em.slice(0, 10)}.json"`,
      },
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao exportar o projeto', e);
  }
});

// NUNCA devolver credenciais no corpo. `repository_token` é secret (uso só
// server-side); redigido aqui — o cliente recebe apenas um booleano indicando se
// há token configurado. Em repouso ele é cifrado (AES-GCM, ver secret-crypto.ts);
// consumidores server-side leem via getRepositoryToken (decifra).
function redactProject<T extends Record<string, any> | null | undefined>(p: T): T {
  if (!p) return p;
  const { repository_token, ...rest } = p as Record<string, any>;
  return { ...rest, repository_token_set: !!repository_token } as unknown as T;
}

/**
 * Lê o `repository_token` de um projeto DECIFRADO, para uso server-side (git ops).
 * Ponto único de leitura: nenhum consumidor deve tocar a coluna direto. Tokens
 * legados em texto claro (sem prefixo `v1:`) são devolvidos como estão.
 */
export async function getRepositoryToken(env: Bindings, projectId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT repository_token FROM projects WHERE id = ?').bind(projectId).first() as any;
  const raw = row?.repository_token;
  if (!raw) return null;
  return decryptSecret(raw, env.TOKEN_ENC_KEY || '');
}
// controlsApp foi extraído para routes/controls.ts (mesmo path /api/v1/controls).


// ─── Projects CRUD ──────────────────────────────────────────────────────────

projectsApp.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      project_name?: string;
      client_name: string;
      sector?: string;
      scope?: string;
      standards?: string;
      org_role?: string;
    }>();

    if (!body.client_name) {
      return c.json({ error: 'client_name é obrigatório' }, 400);
    }

    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO projects (id, project_name, client_name, sector, scope, standards, org_role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).bind(
      id,
      body.project_name ?? '',
      body.client_name,
      body.sector ?? '',
      body.scope ?? '',
      body.standards ?? 'ISO 27001',
      body.org_role ?? ''
    ).run();

    await seedPhases(c.env.DB, id);
    await logAudit(c.env.DB, 'project.created', c.get('user')?.email ?? 'system', `Projeto ${id} criado para ${body.client_name}`, '', '', id);

    return c.json({ id, project_name: body.project_name, client_name: body.client_name, status: 'active' }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar projeto', e);
  }
});

projectsApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (!user.client_project_id) {
        return c.json([]);
      }
      const project = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ?'
      ).bind(user.client_project_id).first();
      return c.json(project ? [redactProject(project)] : []);
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return c.json((results ?? []).map(redactProject));
  } catch (e: any) {
    return erro500(c, 'Falha ao listar projetos', e);
  }
});

projectsApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (user.client_project_id && user.client_project_id !== id) {
      return c.json({ error: 'Forbidden: No access to this project' }, 403);
    }
  }
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(redactProject(project));
});

projectsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
      if (user.role === 'org_user' || (user.client_project_id && user.client_project_id !== id)) {
        return c.json({ error: 'Forbidden: Cannot edit this project' }, 403);
      }
    }
    const body = await c.req.json<{
      status?: string;
      project_name?: string;
      repository_url?: string;
      repository_token?: string;
      standards?: string;
      scope?: string;
    }>();
    // `standards` não é editável por aqui — é derivado do control-set (definido
    // pelos endpoints seed-27701-2025 / migrate). Erro EXPLÍCITO em vez do
    // genérico "Nothing to update", que confundia (o campo estava presente).
    if (body.standards !== undefined) {
      return c.json({ error: 'O campo "standards" não é editável diretamente: ele é derivado do control-set. Use POST /:id/seed-27701-2025 ou os endpoints de migração.' }, 400);
    }
    const updates: string[] = [];
    const values: any[] = [];
    if (body.status) { updates.push('status = ?'); values.push(body.status); }
    if (body.project_name !== undefined) { updates.push('project_name = ?'); values.push(body.project_name); }
    // `scope` (escopo do SGSI / descrição, ex.: residência de dado) é gravável
    // pelo mesmo modelo de permissão dos demais campos deste handler.
    if (body.scope !== undefined) { updates.push('scope = ?'); values.push(body.scope); }
    if (body.repository_url !== undefined) { updates.push('repository_url = ?'); values.push(body.repository_url); }
    if (body.repository_token !== undefined) {
      // Cifra em repouso quando há chave. Sem TOKEN_ENC_KEY (dev/legado), grava
      // como veio — o campo continua redigido nas respostas por redactProject.
      const tokenParaGravar = (body.repository_token && c.env.TOKEN_ENC_KEY)
        ? await encryptSecret(body.repository_token, c.env.TOKEN_ENC_KEY)
        : body.repository_token;
      updates.push('repository_token = ?');
      values.push(tokenParaGravar);
    }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(id);
    await c.env.DB.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await logAudit(c.env.DB, 'project.updated', user?.email ?? 'system', `Projeto ${id} atualizado: ${updates.join(', ')}`, '', '', id);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar projeto', e);
  }
});

// Revogação de aprovação EM LOTE (papel de escrita — o projectAccessMiddleware já
// garante o tenant). Limpa o sign-off do papel indicado em vários controles do
// projeto de uma vez. `reason` obrigatório; aterramento por project_id (só
// controles DESTE projeto). Sem senha de aprovador nem admin. Ver revoke-approval
// unitário em routes/controls.ts.
projectsApp.post('/:id/revoke-approvals', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json().catch(() => ({} as any));
    const role = body?.role;
    const reason = String(body?.reason ?? '').trim();
    const ids: string[] = Array.isArray(body?.control_ids) ? body.control_ids.filter((x: any) => typeof x === 'string' && x) : [];
    if (role !== 'ciso' && role !== 'ceo') return c.json({ error: "Campo 'role' deve ser 'ciso' ou 'ceo'" }, 400);
    if (!reason) return c.json({ error: "Campo 'reason' é obrigatório" }, 400);
    if (!ids.length) return c.json({ error: "Campo 'control_ids' não pode ser vazio" }, 400);

    const placeholders = ids.map(() => '?').join(',');
    const res = await c.env.DB.prepare(
      `UPDATE compliance_controls SET ${COLUNAS_REVOGACAO[role as 'ciso' | 'ceo']}, updated_at = datetime('now')
       WHERE project_id = ? AND id IN (${placeholders})`
    ).bind(projectId, ...ids).run();
    const revogados = (res as any).meta?.changes ?? 0;

    await logAudit(c.env.DB, 'control.approvals_revoked_batch', c.get('user')?.email ?? 'system', `Revogação em lote (${String(role).toUpperCase()}) de ${revogados} controle(s) no projeto ${projectId}. Motivo: ${reason}`, reason, '', projectId);
    return c.json({ ok: true, role, revoked_count: revogados });
  } catch (e: any) {
    return erro500(c, 'Falha ao revogar aprovações em lote', e);
  }
});

// Reatribuição em lote do responsável (owner) dos controles de UM projeto:
// troca `owner_from` por `owner_to` sem N chamadas ao PUT /controls/:id. `owner`
// é metadado organizacional — não toca status, aprovações nem maturidade. O
// isolamento por tenant vem do projectAccessMiddleware (mesmo padrão do lote de
// revogação); o WHERE ainda amarra por project_id como defesa em profundidade.
projectsApp.patch('/:id/controls', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json().catch(() => ({} as any));
    // owner_from: valor atual a casar (obrigatório, não-vazio). owner_to: novo
    // valor (obrigatório; string vazia limpa o responsável).
    const ownerFrom = typeof body?.owner_from === 'string' ? body.owner_from.trim() : '';
    const ownerTo = typeof body?.owner_to === 'string' ? body.owner_to : undefined;
    if (!ownerFrom) return c.json({ error: "Campo 'owner_from' é obrigatório (responsável atual a reatribuir)" }, 400);
    if (ownerTo === undefined) return c.json({ error: "Campo 'owner_to' é obrigatório (novo responsável; string vazia limpa)" }, 400);

    const res = await c.env.DB.prepare(
      `UPDATE compliance_controls SET owner = ?, updated_at = datetime('now')
       WHERE project_id = ? AND owner = ?`
    ).bind(ownerTo, projectId, ownerFrom).run();
    const reatribuidos = (res as any).meta?.changes ?? 0;

    await logAudit(c.env.DB, 'control.owner_reassigned_batch', c.get('user')?.email ?? 'system', `Reatribuição em lote de responsável: ${reatribuidos} controle(s) de "${ownerFrom}" para "${ownerTo || '(sem responsável)'}" no projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true, owner_from: ownerFrom, owner_to: ownerTo, reassigned_count: reatribuidos });
  } catch (e: any) {
    return erro500(c, 'Falha ao reatribuir responsável em lote', e);
  }
});

// Migração idempotente: cifra em repouso os repository_token gravados em texto
// claro (pré-D1). Só platform_admin; exige TOKEN_ENC_KEY configurada. Rodar uma
// vez após provisionar o secret. Reexecutar é seguro — o que já está cifrado
// (prefixo v1:) é pulado.
projectsApp.post('/admin/encrypt-tokens', async (c) => {
  try {
    if (c.get('user')?.role !== 'platform_admin') {
      return c.json({ error: 'Forbidden: requer platform_admin' }, 403);
    }
    if (!c.env.TOKEN_ENC_KEY) {
      return c.json({ error: 'TOKEN_ENC_KEY não configurada; nada a fazer' }, 400);
    }
    const { results } = await c.env.DB.prepare(
      "SELECT id, repository_token FROM projects WHERE repository_token IS NOT NULL AND repository_token != ''"
    ).all();
    let cifrados = 0, jaCifrados = 0;
    for (const row of (results || []) as any[]) {
      if (isEncrypted(row.repository_token)) { jaCifrados++; continue; }
      const enc = await encryptSecret(row.repository_token, c.env.TOKEN_ENC_KEY);
      await c.env.DB.prepare('UPDATE projects SET repository_token = ? WHERE id = ?').bind(enc, row.id).run();
      cifrados++;
    }
    await logAudit(c.env.DB, 'projects.tokens_encrypted', c.get('user')?.email ?? 'system', `Tokens cifrados: ${cifrados}; já cifrados: ${jaCifrados}`, '', '', '');
    return c.json({ ok: true, cifrados, ja_cifrados: jaCifrados });
  } catch (e: any) {
    return erro500(c, 'Falha ao cifrar tokens', e);
  }
});

// Controls inside Project
projectsApp.get('/:id/controls', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    if (user.client_project_id && user.client_project_id !== projectId) {
      return c.json({ error: 'Forbidden: Access denied to controls of another project' }, 403);
    }
  }
  const result = await c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ? ORDER BY id ASC').bind(projectId).all();
  return c.json({ ok: true, controls: result.results });
});

// Phases inside Project
projectsApp.get('/:id/phases', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(projectId).all();
  return c.json({ ok: true, phases: result.results });
});

projectsApp.put('/:id/phases/:num', async (c) => {
  try {
    const projectId = c.req.param('id');
    const num = c.req.param('num');
    const v = await validateBody(c, projectPhaseSchema);
    if (!v.success) return v.response;
    const { status, notes } = v.data as any;
    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
    values.push(projectId, num);
    const res = await c.env.DB.prepare(`UPDATE project_phases SET ${updates.join(', ')} WHERE project_id = ? AND phase_number = ?`).bind(...values).run();
    // Fim do no-op silencioso: a rota casa por `phase_number` (0..N), não por
    // phase_id. Um `num` inexistente (ex.: id passado no lugar do número) casava
    // 0 linhas e ainda devolvia {ok:true} — indistinguível de gravação real.
    // Agora 0 linhas afetadas = 404 explícito.
    if (((res as any).meta?.changes ?? 0) === 0) {
      return c.json({ error: `Fase ${num} não encontrada no projeto ${projectId}. Use o phase_number (0..N), não o phase_id.` }, 404);
    }
    await logAudit(c.env.DB, 'phase.updated', c.get('user')?.email ?? 'system', `Fase ${num} do projeto ${projectId} atualizada`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar fase do projeto', e);
  }
});

// Interviews inside Project
projectsApp.get('/:id/interviews/:track', async (c) => {
  const projectId = c.req.param('id');
  const track = c.req.param('track');
  const result = await c.env.DB.prepare('SELECT * FROM project_interviews WHERE project_id = ? AND track = ? ORDER BY id ASC').bind(projectId, track).all();
  return c.json({ ok: true, interviews: result.results });
});

projectsApp.post('/:id/interviews', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, interviewSchema);
    if (!v.success) return v.response;
    const { answers } = v.data as any;
    
    const stmt = c.env.DB.prepare(
      `INSERT INTO project_interviews (id, project_id, track, question, answer, interviewee, gap_detected, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const batch = answers.map((a: any) => stmt.bind(genId(), projectId, a.track, a.question, a.answer, a.interviewee || null, a.gap_detected ? 1 : 0, a.notes || null));
    await c.env.DB.batch(batch);
    await logAudit(c.env.DB, 'interviews.saved', c.get('user')?.email ?? 'system', `Salvas ${answers.length} respostas de entrevista para projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true, count: answers.length });
  } catch (e: any) {
    return erro500(c, 'Falha ao salvar entrevistas', e);
  }
});

projectsApp.get('/:id/interviews/summary', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT track, COUNT(*) as total, SUM(gap_detected) as gaps FROM project_interviews WHERE project_id = ? GROUP BY track'
  ).bind(projectId).all<{ track: string; total: number; gaps: number }>();
  return c.json({ ok: true, summary: results });
});

// Documents inside Project
projectsApp.get('/:id/documents', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM evidence WHERE project_id = ? AND r2_key LIKE "docs/%" ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, documents: results });
});

projectsApp.post('/:id/documents/upload', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    if (!file) return c.json({ error: 'No file provided' }, 400);

    // Recusa antes de ler o arquivo na memória: sem isto qualquer cliente
    // autenticado enche o R2, e HTML/SVG voltariam ao navegador como XSS.
    const invalido = validateUpload(file);
    if (invalido) return c.json({ error: invalido }, 400);

    const docId = genId();
    const r2Key = `docs/${projectId}/${docId}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });

    const user = c.get('user');
    await c.env.DB.prepare(
      `INSERT INTO evidence (id, project_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, evaluation_notes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'conforming', 'Documento Interno do SGSI Controlado', ?, datetime('now'))`
    ).bind(docId, projectId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();

    await logAudit(c.env.DB, 'document.uploaded', user?.email || 'system', `Documento ${file.name} carregado para projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true, id: docId, sha256: realSha256 }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha no upload de documento', e);
  }
});

projectsApp.put('/:id/documents/:docId', async (c) => {
  try {
    const projectId = c.req.param('id');
    const docId = c.req.param('docId');
    const v = await validateBody(c, evidenceMetaSchema);
    if (!v.success) return v.response;
    const { file_name, evaluation_notes } = v.data as any;

    const doc = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ? AND project_id = ?').bind(docId, projectId).first();
    if (!doc) return c.json({ error: 'Document not found' }, 404);

    const updates: string[] = [];
    const values: any[] = [];
    if (file_name) { updates.push('file_name = ?'); values.push(file_name); }
    if (evaluation_notes !== undefined) { updates.push('evaluation_notes = ?'); values.push(evaluation_notes); }

    if (updates.length > 0) {
      values.push(docId, projectId);
      await c.env.DB.prepare(`UPDATE evidence SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`).bind(...values).run();
    }

    const user = c.get('user');
    await logAudit(c.env.DB, 'document.updated', user?.email || 'system', `Documento ${docId} atualizado no projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar documento', e);
  }
});

// Ativos do projeto: rotas extraídas para routes/project-assets.ts.
registerAssetRoutes(projectsApp);

// Checklist progress inside Project
projectsApp.get('/:id/checklist-progress', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare(`
    SELECT cp.phase_number, cp.item_id, cp.is_checked, cp.checked_by, cp.checked_at, cp.evidence_id, cp.notes, cp.assigned_to, cp.due_date, ev.evaluation_status, ev.evaluation_notes
    FROM checklist_progress cp
    LEFT JOIN evidence ev ON cp.evidence_id = ev.id
    WHERE cp.project_id = ?
  `).bind(projectId).all();
  return c.json({ ok: true, progress: rows.results || [] });
});

// Scope changes inside Project
projectsApp.get('/:id/scope-changes', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM scope_changes WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json(rows.results || []);
});

projectsApp.post('/:id/scope-changes', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, scopeChangeSchema);
    if (!v.success) return v.response;
    const { change_description, reason, impact_analysis, requested_by } = v.data as any;
    if (!change_description) return c.json({ error: 'change_description is required' }, 400);

    const changeId = genId();
    await c.env.DB.prepare(`
      INSERT INTO scope_changes (id, project_id, change_description, reason, impact_analysis, requested_by, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `).bind(changeId, projectId, change_description, reason || null, impact_analysis || null, requested_by || c.get('user')?.email || 'system').run();

    await logAudit(c.env.DB, 'scope_change.created', c.get('user')?.email || 'system', `Solicitação de alteração de escopo ${changeId} criada para projeto ${projectId}`, '', '', projectId);
    return c.json({ ok: true, id: changeId });
  } catch (e: any) {
    return erro500(c, 'Falha ao registrar alteração de escopo', e);
  }
});

// Risk matrix inside Project
projectsApp.get('/:id/risk-matrix', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT risk_level, treatment, risk_score FROM risks WHERE project_id = ?'
  ).bind(c.req.param('id')).all<{ risk_level: string; treatment: string; risk_score: number }>();

  const byLevel: Record<string, number> = {};
  const byTreatment: Record<string, number> = {};
  let totalScore = 0;
  for (const r of results) {
    byLevel[r.risk_level] = (byLevel[r.risk_level] || 0) + 1;
    byTreatment[r.treatment] = (byTreatment[r.treatment] || 0) + 1;
    totalScore += r.risk_score;
  }

  return c.json({
    ok: true,
    total: results.length,
    by_level: byLevel,
    by_treatment: byTreatment,
    average_score: results.length ? +(totalScore / results.length).toFixed(1) : 0,
  });
});

// ISO 27701 Migrations inside Project
projectsApp.post('/:id/migrate-27701', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, status FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2013'"
    ).bind(projectId).all<{ id: string; status: string }>();

    const oldSoA: Record<string, boolean> = {};
    for (const ctrl of (controls || [])) {
      oldSoA[ctrl.id] = ctrl.status !== 'Missing';
    }

    const { newSoA, gaps, transformationRatio } = MigrationService.migrateSoA(oldSoA);

    let created = 0;
    const { results: existing2022 } = await c.env.DB.prepare(
      "SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'"
    ).bind(projectId).all<{ id: string }>();
    const existing = new Set((existing2022 || []).map(c => c.id));

    for (const [controlId, isApplicable] of Object.entries(newSoA)) {
      if (isApplicable && !existing.has(controlId)) {
        await c.env.DB.prepare(
          `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
           VALUES (?, ?, 'ISO 27001:2022', ?, 'Migrated from 2013 standard', 'Missing', datetime('now'))`
        ).bind(controlId, projectId, controlId).run();
        created++;
      }
    }

    await logAudit(c.env.DB, 'migration.27701', c.get('user')?.email ?? 'system', `27701 migration (2013->2022): ${gaps.length} gaps, ${created} new controls, project ${projectId}`, '', '', projectId);

    return c.json({
      ok: true,
      gaps,
      transformation_ratio: +transformationRatio.toFixed(2),
      new_controls_created: created,
    });
  } catch (e: any) {
    return erro500(c, 'Falha na migração 27701', e);
  }
});

projectsApp.post('/:id/migrate-27701-2025', async (c) => {
  try {
    const projectId = c.req.param('id');
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, status FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2019'"
    ).bind(projectId).all<{ id: string; status: string }>();

    const oldSoA: Record<string, boolean> = {};
    for (const ctrl of (controls || [])) {
      oldSoA[ctrl.id] = ctrl.status !== 'Missing';
    }

    const { newSoA, gaps, transformationRatio } = MigrationService.migrateSoA27701(oldSoA);

    let created = 0;
    const { results: existing2025 } = await c.env.DB.prepare(
      "SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025'"
    ).bind(projectId).all<{ id: string }>();
    const existing = new Set((existing2025 || []).map(c => c.id));

    for (const [controlId, isApplicable] of Object.entries(newSoA)) {
      if (isApplicable && !existing.has(controlId)) {
        await c.env.DB.prepare(
          `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, updated_at)
           VALUES (?, ?, 'ISO 27701:2025', ?, 'Migrated from 2019 standard', 'Missing', datetime('now'))`
        ).bind(controlId, projectId, controlId).run();
        created++;
      }
    }

    await logAudit(c.env.DB, 'migration.27701.2025', c.get('user')?.email ?? 'system', `27701:2025 migration: ${gaps.length} gaps, ${created} new controls, project ${projectId}`, '', '', projectId);

    return c.json({
      ok: true,
      gaps,
      transformation_ratio: +transformationRatio.toFixed(2),
      new_controls_created: created,
    });
  } catch (e: any) {
    return erro500(c, 'Falha na migração 27701:2025', e);
  }
});

// Semeia o control-set 27701:2025 (Anexo A) DO ZERO, por papel do projeto.
//
// O migrate-27701-2025 acima só TRANSFORMA um SoA 27701:2019 existente — inútil
// para projetos sem base 2019 (a maioria: eles têm só os 93 do 27001:2022). Este
// endpoint cria os controles de privacidade da edição 2025 (Tabela A.1 Controlador
// e/ou A.2 Operador, conforme org_role) como 'Missing', para o SGPI existir de
// fato. Idempotente: re-rodar não duplica. Também garante o rótulo da norma.
projectsApp.post('/:id/seed-27701-2025', async (c) => {
  try {
    const projectId = c.req.param('id');
    const proj = await c.env.DB.prepare('SELECT id, org_role, standards FROM projects WHERE id = ?')
      .bind(projectId).first<{ id: string; org_role: string; standards: string }>();
    if (!proj) return c.json({ error: 'Projeto não encontrado' }, 404);

    const wanted = controlsForRole(proj.org_role);

    // Idempotência: o código do controle vive como primeiro token do título
    // (ex.: "A.1.2.2 — ..."). Pula o que já foi semeado.
    const { results: existing } = await c.env.DB.prepare(
      'SELECT title FROM compliance_controls WHERE project_id = ? AND standard = ?'
    ).bind(projectId, ISO_27701_2025_STANDARD).all<{ title: string }>();
    const existingCodes = new Set((existing || []).map((r) => (r.title || '').split(' ')[0]));

    let created = 0;
    for (const ctrl of wanted) {
      if (existingCodes.has(ctrl.code)) continue;
      await c.env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, description, status, maturity, updated_at)
         VALUES (?, ?, ?, ?, '', 'Missing', 0, datetime('now'))`
      ).bind(genId(), projectId, ISO_27701_2025_STANDARD, `${ctrl.code} — ${ctrl.title}`).run();
      created++;
    }

    // Rótulo da norma: garante 27701:2025 (substitui 2019 se presente).
    let standards = (proj.standards || '').toString();
    if (!/27701:2025/.test(standards)) {
      standards = /27701:2019/.test(standards)
        ? standards.replace(/(ISO\/?\s*(?:IEC\s*)?)27701:2019/i, `$1${'27701:2025'}`)
        : (standards ? `${standards}, ${ISO_27701_2025_STANDARD}` : ISO_27701_2025_STANDARD);
      await c.env.DB.prepare('UPDATE projects SET standards = ? WHERE id = ?').bind(standards, projectId).run();
    }

    await logAudit(
      c.env.DB, 'seed.27701.2025', c.get('user')?.email ?? 'system',
      `Seed 27701:2025 (${proj.org_role || 'Controller'}): ${created} controles criados, ${wanted.length - created} já existiam, projeto ${projectId}`,
      '', c.req.header('CF-Connecting-IP') ?? '', projectId,
    );

    return c.json({ ok: true, standard: ISO_27701_2025_STANDARD, role: proj.org_role, seeded: created, catalog_total: wanted.length, standards });
  } catch (e: any) {
    return erro500(c, 'Falha ao semear controles 27701:2025', e);
  }
});

// Traceability inside Project
projectsApp.get('/:id/traceability', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  const controls = await db.prepare(
    `SELECT id, title, status FROM compliance_controls WHERE project_id = ?`
  ).bind(projectId).all();

  const rows = controls.results || [];
  const controlIds = rows.map((r: any) => r.id);

  if (controlIds.length === 0) return c.json({ ok: true, controls: [] });

  const placeholders = controlIds.map(() => '?').join(',');

  const risksResult = await db.prepare(
    `SELECT id, asset, threat, risk_level, control_id FROM risks WHERE control_id IN (${placeholders})`
  ).bind(...controlIds).all();

  const evidenceResult = await db.prepare(
    `SELECT id, file_name, created_at, control_id FROM evidence WHERE control_id IN (${placeholders})`
  ).bind(...controlIds).all();

  const risksMap: Record<string, any[]> = {};
  for (const r of (risksResult.results || []) as any[]) {
    (risksMap[r.control_id] ||= []).push({ id: r.id, asset: r.asset, threat: r.threat, risk_level: r.risk_level });
  }
  const evidenceMap: Record<string, any[]> = {};
  for (const e of (evidenceResult.results || []) as any[]) {
    (evidenceMap[e.control_id] ||= []).push({ id: e.id, file_name: e.file_name, created_at: e.created_at });
  }

  const linked = rows.map((ctrl: any) => ({
    id: ctrl.id,
    title: ctrl.title,
    status: ctrl.status,
    risks: risksMap[ctrl.id] || [],
    evidence: evidenceMap[ctrl.id] || [],
  }));

  return c.json({ ok: true, controls: linked });
});

// Coerência entre fases do SGSI/SGPI: referências órfãs entre risks, compliance_controls,
// evidence e policy_versions (ver src/services/coherence.ts).
projectsApp.get('/:id/coherence', async (c) => {
  const projectId = c.req.param('id');
  const report = await checkCoherence(c.env.DB, projectId);
  return c.json(report);
});

// DPIA Assessments inside Project
projectsApp.get('/:id/dpia', async (c) => {
  const projectId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM dpia_assessments WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
  return c.json({ ok: true, assessments: result.results });
});

projectsApp.post('/:id/dpia', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json<any>();
    const id = genId();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, dpo_recommendations, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`
    ).bind(id, projectId, body.ropa_id || null, body.processing_name, body.data_category_risk, body.necessity_proportionality, body.technical_measures, body.residual_risk_level || 'Medium', body.dpo_recommendations || null, now).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'dpia_created', user?.email || 'system', `DPIA ${id} created`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar DPIA', e);
  }
});

// Audit Pack & Audit Trail inside Project
projectsApp.get('/:id/audit-pack', async (c) => {
  try {
    const projectId = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const [phases, controls, evidence, logs] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC').bind(projectId).all(),
      c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ?').bind(projectId).all(),
      c.env.DB.prepare('SELECT * FROM evidence WHERE project_id = ?').bind(projectId).all(),
      c.env.DB.prepare('SELECT * FROM audit_logs WHERE project_id = ? OR (project_id IS NULL AND details LIKE ?) ORDER BY created_at DESC LIMIT 100').bind(projectId, `%${projectId}%`).all()
    ]);

    return c.json({
      ok: true,
      pack: {
        project,
        phases: phases.results || [],
        controls: controls.results || [],
        evidence: evidence.results || [],
        audit_trail: logs.results || [],
        generated_at: new Date().toISOString()
      }
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao gerar pacote de auditoria', e);
  }
});

projectsApp.get('/:id/audit-trail', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs WHERE project_id = ? OR (project_id IS NULL AND details LIKE ?) ORDER BY created_at DESC LIMIT 500`
  ).bind(projectId, `%${projectId}%`).all();
  return c.json(results || []);
});

// Auditor Token inside Project
projectsApp.post('/:id/auditor-token', async (c) => {
  try {
    const projectId = c.req.param('id');
    const v = await validateBody(c, auditorTokenSchema);
    if (!v.success) return v.response;
    const body = v.data;
    const days = body.days_valid ?? 30;
    const token = genToken();
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    await c.env.DB.prepare(
      `INSERT INTO auditor_tokens (id, token, project_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(genId(), token, projectId, expiresAt).run();

    await logAudit(c.env.DB, 'auditor_token.created', c.get('user')?.email ?? 'system', `Auditor token created for project ${projectId}, valid ${days} days`, '', '', projectId);
    return c.json({ ok: true, token, expires_at: expiresAt }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao gerar token de auditor', e);
  }
});
