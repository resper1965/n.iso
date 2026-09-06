import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { sha256Hex, logAudit, invalidateUserSessions, erro500, genId } from '../helpers';
import { log } from '../observability';

/**
 * SCIM 2.0 — provisionamento e DESPROVISIONAMENTO (item 4.2 do
 * `enterprise-grade-plan.md`).
 *
 * O item existe pela segunda metade. Provisionar é conveniência; despovisionar é
 * controle: quando alguém é desligado no IdP do cliente, o acesso aqui precisa
 * cair sem ninguém lembrar de nada. "Alguém lembra" não é um controle que se
 * declara numa auditoria.
 *
 * MONTADO FORA DE `/api/v1`, em `/scim/v2/*`, por dois motivos que se somam: é
 * o caminho que a RFC 7644 padroniza e que os IdPs esperam, e ele NÃO passa pelo
 * `authMiddleware` — o autenticador aqui é um token por tenant, não uma sessão
 * de usuário. Misturar os dois faria o caminho de sessão carregar um caso que
 * não é dele.
 *
 * ESCOPO IMPLEMENTADO: `/Users` com GET (lista com filtro `userName eq`), GET
 * por id, POST, PUT, PATCH e DELETE. `/Groups` NÃO está implementado, e o
 * `ServiceProviderConfig` diz isso em vez de fingir: o produto não tem conceito
 * de grupo, e responder 200 com lista vazia faria o IdP acreditar que sincronizou
 * grupos que nunca existiram.
 *
 * O QUE `DELETE` E `active: false` FAZEM. Os dois desativam; nenhum apaga. A
 * conta desativada continua existindo porque a TRILHA referencia o e-mail dela
 * — apagar a linha reescreveria o passado, que é exatamente o que `audit_logs`
 * existe para impedir. E as sessões vivas são invalidadas na hora: sem isso, o
 * desligado continuaria dentro por até 24 horas.
 */

export const scimApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ESQUEMA_USUARIO = 'urn:ietf:params:scim:schemas:core:2.0:User';
const ESQUEMA_LISTA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ESQUEMA_ERRO = 'urn:ietf:params:scim:api:messages:2.0:Error';
const ESQUEMA_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

/**
 * Papel dado a toda conta provisionada por SCIM.
 *
 * FIXO, e não configurável por tenant. O SSO tem `papel_padrao` porque lá a
 * escolha é feita pela ness. ao configurar o IdP; aqui quem chama é o IdP do
 * cliente, e deixá-lo escolher o papel seria deixar o cliente decidir o próprio
 * nível de acesso na plataforma.
 *
 * Uma versão anterior deste arquivo tinha um `Set` de papéis proibidos que nunca
 * era consultado — dead code que LIA como guarda, e que o CodeQL pegou. Um
 * `Set` não usado é pior que nenhum: quem revisa conclui que existe validação.
 * O que garante o invariante agora é o valor literal aqui e o teste
 * "conta criada por SCIM nunca recebe papel de plataforma".
 */
const PAPEL_PROVISIONADO = 'org_user';

type LinhaUsuario = {
  id: string;
  email: string;
  name: string;
  role: string;
  client_project_id: string | null;
  ativo: number;
  created_at: string;
};

function erroScim(c: any, status: number, detalhe: string, scimType?: string) {
  return c.json({ schemas: [ESQUEMA_ERRO], status: String(status), detail: detalhe, ...(scimType ? { scimType } : {}) }, status);
}

/** Representação SCIM de um usuário nosso. */
function comoScim(u: LinhaUsuario, origem: string) {
  return {
    schemas: [ESQUEMA_USUARIO],
    id: u.id,
    userName: u.email,
    name: { formatted: u.name },
    displayName: u.name,
    emails: [{ value: u.email, primary: true }],
    active: u.ativo === 1,
    meta: {
      resourceType: 'User',
      created: u.created_at,
      location: `${origem}/scim/v2/Users/${u.id}`,
    },
  };
}

/**
 * Autentica pelo token do tenant e prende a requisição ao projeto dele.
 *
 * O `project_id` sai do TOKEN, nunca do corpo ou da URL. É o que garante que o
 * IdP de um cliente não consiga criar nem desativar conta de outro — mesma
 * disciplina do resto do produto, aplicada num caminho que não passa pelo
 * `projectAccessMiddleware`.
 */
scimApp.use('*', async (c, next) => {
  const cabecalho = c.req.header('Authorization') ?? '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
  if (!token) return erroScim(c, 401, 'Bearer token ausente.');

  const hash = await sha256Hex(token);
  const linha = await c.env.DB.prepare(
    'SELECT project_id FROM project_scim WHERE token_hash = ? AND ativo = 1'
  ).bind(hash).first<{ project_id: string }>();
  if (!linha) return erroScim(c, 401, 'Token SCIM inválido ou revogado.');

  c.set('scimProjectId' as any, linha.project_id);

  // Registrar uso ajuda a responder "este IdP ainda está sincronizando?" sem
  // depender de log. É `await` dentro de try/catch, e não `waitUntil`, por um
  // motivo concreto: o getter `c.executionCtx` LANÇA quando não há contexto de
  // execução — o que acontece em `app.request()` e em parte dos testes — e o
  // `?.` não protege contra throw no próprio getter. Um UPDATE de uma linha não
  // vale transformar a autenticação do SCIM em 500.
  try {
    await c.env.DB.prepare("UPDATE project_scim SET ultimo_uso_em = datetime('now') WHERE project_id = ?")
      .bind(linha.project_id).run();
  } catch {
    // Telemetria nunca derruba a requisição que ela observa.
  }

  await next();
});

const projetoDe = (c: any): string => c.get('scimProjectId');
const origemDe = (c: any): string => new URL(c.req.url).origin;

/** O que o IdP consulta para saber o que suportamos — inclusive o que NÃO. */
scimApp.get('/ServiceProviderConfig', (c) =>
  c.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      { type: 'oauthbearertoken', name: 'Bearer', description: 'Token por tenant, emitido pela ness.' },
    ],
    // Declarado em vez de omitido: o produto não tem conceito de grupo, e
    // responder /Groups com lista vazia faria o IdP acreditar que sincronizou
    // grupos que nunca existiram.
    'urn:niso:nao-suportado': ['Groups'],
  })
);

scimApp.get('/Users', async (c) => {
  try {
    const projectId = projetoDe(c);
    const filtro = c.req.query('filter');

    // `userName eq "x"` é o único filtro que os IdPs usam para reconciliar, e o
    // único aceito aqui. Interpretar expressão SCIM completa seria construir um
    // parser de consulta sobre o banco — superfície nova, ganho nenhum.
    let email: string | null = null;
    if (filtro) {
      const m = filtro.match(/^\s*userName\s+eq\s+"([^"]+)"\s*$/i);
      if (!m) return erroScim(c, 400, `Filtro não suportado: ${filtro}. Apenas 'userName eq "..."'.`, 'invalidFilter');
      email = m[1].toLowerCase();
    }

    const { results } = email
      ? await c.env.DB.prepare(
          'SELECT id, email, name, role, client_project_id, ativo, created_at FROM users WHERE client_project_id = ? AND email = ?'
        ).bind(projectId, email).all<LinhaUsuario>()
      : await c.env.DB.prepare(
          'SELECT id, email, name, role, client_project_id, ativo, created_at FROM users WHERE client_project_id = ? ORDER BY created_at LIMIT 200'
        ).bind(projectId).all<LinhaUsuario>();

    const lista = results ?? [];
    return c.json({
      schemas: [ESQUEMA_LISTA],
      totalResults: lista.length,
      startIndex: 1,
      itemsPerPage: lista.length,
      Resources: lista.map((u) => comoScim(u, origemDe(c))),
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao listar usuários (SCIM)', e);
  }
});

/** Busca o usuário SEMPRE preso ao projeto do token. */
async function usuarioDoTenant(c: any, id: string): Promise<LinhaUsuario | null> {
  const db = c.env.DB as D1Database;
  return db
    .prepare('SELECT id, email, name, role, client_project_id, ativo, created_at FROM users WHERE id = ? AND client_project_id = ?')
    .bind(id, projetoDe(c))
    .first<LinhaUsuario>();
}

scimApp.get('/Users/:id', async (c) => {
  try {
    const u = await usuarioDoTenant(c, c.req.param('id'));
    // 404, e não 403, para usuário de outro tenant: distinguir os dois diria ao
    // IdP de um cliente que aquele id existe em outro.
    if (!u) return erroScim(c, 404, 'Usuário não encontrado.');
    return c.json(comoScim(u, origemDe(c)));
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar usuário (SCIM)', e);
  }
});

scimApp.post('/Users', async (c) => {
  try {
    const projectId = projetoDe(c);
    const corpo = await c.req.json<any>().catch(() => null);
    if (!corpo) return erroScim(c, 400, 'Corpo JSON inválido.');

    const email = String(corpo.userName ?? corpo.emails?.[0]?.value ?? '').toLowerCase().trim();
    if (!email || !email.includes('@')) return erroScim(c, 400, 'userName precisa ser um e-mail.', 'invalidValue');

    const existente = await c.env.DB.prepare(
      'SELECT id, client_project_id FROM users WHERE email = ?'
    ).bind(email).first<{ id: string; client_project_id: string | null }>();

    if (existente) {
      // 409 é o que a RFC 7644 manda para recurso já existente, e é o que faz o
      // IdP reconciliar em vez de tentar de novo para sempre.
      if (existente.client_project_id !== projectId) {
        return erroScim(c, 409, 'Já existe conta com este e-mail.', 'uniqueness');
      }
      return erroScim(c, 409, 'Usuário já existe.', 'uniqueness');
    }

    const id = genId();
    const nome = String(corpo.displayName ?? corpo.name?.formatted ?? email.split('@')[0]);
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, client_project_id, ativo)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(id, email, 'scim:sem-senha-local', nome, PAPEL_PROVISIONADO, projectId, corpo.active === false ? 0 : 1).run();

    await logAudit(c.env.DB, 'scim.user_created', `scim:${projectId}`, `Conta ${email} provisionada por SCIM`, '', '', projectId);

    const criado = await usuarioDoTenant(c, id);
    return c.json(comoScim(criado!, origemDe(c)), 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar usuário (SCIM)', e);
  }
});

/**
 * Ativa ou desativa, e — quando desativa — DERRUBA AS SESSÕES VIVAS.
 *
 * Sem a invalidação, o desligado continuaria dentro por até 24 horas com a
 * sessão que já tinha. O item do plano diz "perde acesso sem ação manual"; uma
 * janela de um dia não é isso.
 */
async function definirAtivo(c: any, u: LinhaUsuario, ativo: boolean) {
  await c.env.DB.prepare('UPDATE users SET ativo = ? WHERE id = ?').bind(ativo ? 1 : 0, u.id).run();
  if (!ativo) {
    await invalidateUserSessions(c.env.SESSIONS, u.id);
    log('info', { msg: 'scim_desprovisionamento', projeto: u.client_project_id ?? '', usuario: u.id });
  }
  await logAudit(
    c.env.DB,
    ativo ? 'scim.user_activated' : 'scim.user_deactivated',
    `scim:${u.client_project_id}`,
    `Conta ${u.email} ${ativo ? 'reativada' : 'desativada'} por SCIM`,
    '', '', u.client_project_id ?? ''
  );
}

scimApp.put('/Users/:id', async (c) => {
  try {
    const u = await usuarioDoTenant(c, c.req.param('id'));
    if (!u) return erroScim(c, 404, 'Usuário não encontrado.');
    const corpo = await c.req.json<any>().catch(() => null);
    if (!corpo) return erroScim(c, 400, 'Corpo JSON inválido.');

    const nome = String(corpo.displayName ?? corpo.name?.formatted ?? u.name);
    await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(nome, u.id).run();

    if (corpo.active !== undefined && (corpo.active === true) !== (u.ativo === 1)) {
      await definirAtivo(c, u, corpo.active === true);
    }

    return c.json(comoScim((await usuarioDoTenant(c, u.id))!, origemDe(c)));
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar usuário (SCIM)', e);
  }
});

/**
 * PATCH — é por aqui que o desligamento chega na prática.
 *
 * Entra e Okta mandam `{"op":"replace","value":{"active":false}}` ou
 * `{"op":"replace","path":"active","value":false}`. As duas formas são válidas
 * pela RFC e as duas são aceitas: recusar uma faria o desprovisionamento
 * simplesmente não acontecer com metade dos IdPs, em silêncio.
 */
scimApp.patch('/Users/:id', async (c) => {
  try {
    const u = await usuarioDoTenant(c, c.req.param('id'));
    if (!u) return erroScim(c, 404, 'Usuário não encontrado.');

    const corpo = await c.req.json<any>().catch(() => null);
    if (!corpo || !Array.isArray(corpo.Operations)) {
      return erroScim(c, 400, `Corpo precisa ser um ${ESQUEMA_PATCH} com Operations.`, 'invalidSyntax');
    }

    let ativoDesejado: boolean | undefined;
    let nomeDesejado: string | undefined;

    for (const op of corpo.Operations) {
      const acao = String(op.op ?? '').toLowerCase();
      if (acao !== 'replace' && acao !== 'add') continue;

      const caminho = String(op.path ?? '').toLowerCase();
      if (caminho === 'active') {
        ativoDesejado = op.value === true || op.value === 'True' || op.value === 'true';
      } else if (caminho === 'displayname' || caminho === 'name.formatted') {
        nomeDesejado = String(op.value);
      } else if (!op.path && op.value && typeof op.value === 'object') {
        if ('active' in op.value) {
          ativoDesejado = op.value.active === true || op.value.active === 'True' || op.value.active === 'true';
        }
        if (op.value.displayName) nomeDesejado = String(op.value.displayName);
      }
    }

    if (nomeDesejado !== undefined) {
      await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(nomeDesejado, u.id).run();
    }
    if (ativoDesejado !== undefined && ativoDesejado !== (u.ativo === 1)) {
      await definirAtivo(c, u, ativoDesejado);
    }

    return c.json(comoScim((await usuarioDoTenant(c, u.id))!, origemDe(c)));
  } catch (e: any) {
    return erro500(c, 'Falha ao aplicar PATCH (SCIM)', e);
  }
});

/**
 * DELETE desativa; não apaga.
 *
 * A trilha de auditoria referencia o e-mail desta conta. Apagar a linha
 * reescreveria o passado — exatamente o que `audit_logs` existe para impedir — e
 * deixaria registros apontando para um usuário que "nunca existiu". 204 é o que
 * a RFC manda, e é o que o IdP espera para marcar como sincronizado.
 */
scimApp.delete('/Users/:id', async (c) => {
  try {
    const u = await usuarioDoTenant(c, c.req.param('id'));
    if (!u) return erroScim(c, 404, 'Usuário não encontrado.');
    if (u.ativo === 1) await definirAtivo(c, u, false);
    return c.body(null, 204);
  } catch (e: any) {
    return erro500(c, 'Falha ao remover usuário (SCIM)', e);
  }
});
