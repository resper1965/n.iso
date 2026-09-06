import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword, verifyPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';
import middlewareSrc from '../src/middleware/auth.ts?raw';
import helpersSrc from '../src/helpers.ts?raw';

/**
 * Validação de corpo nas rotas que mais custam quando aceitam lixo — e a
 * catraca que impede a dívida de crescer (item 3.3 do `enterprise-grade-plan.md`).
 *
 * O sistema lê corpo de requisição de dois jeitos. `validateBody(c, schema)`
 * recusa com 400 e diz qual campo. `await c.req.json()` cru aceita o que vier, e
 * o handler descobre o problema quando `email.trim()` estoura num endpoint
 * público — 500, não 400.
 *
 * Não dava para fechar as 53 ocorrências de uma vez sem arriscar recusar
 * payload que a interface manda hoje. Foram fechadas as de maior custo: senha,
 * escopo de acesso e as rotas SEM autenticação. As demais estão na catraca
 * abaixo, que permite baixar o número e nunca subir.
 */

const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);

describe('Política de senha nova', () => {
  let sessao: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`
    ).bind('u-1', 'quem@x.com', await hashPassword('senha-antiga-boa'), 'Quem', 'org_admin').run();
    sessao = {
      ...(await sessionFor({ id: 'u-1', email: 'quem@x.com', role: 'org_admin' })),
      'Content-Type': 'application/json',
    };
  });

  it('recusa senha nova curta — o produto que recomenda o controle não pode ignorá-lo', async () => {
    const res = await req('/api/v1/auth/change-password', {
      method: 'POST', headers: sessao,
      body: JSON.stringify({ oldPassword: 'senha-antiga-boa', newPassword: 'curta7c' }),
    });
    expect(res.status).toBe(400);
    const corpo = await res.json<any>();
    expect(corpo.error).toBe('Payload inválido');
    expect(JSON.stringify(corpo.details)).toContain('8 caracteres');

    // E, o que mais importa: não trocou.
    const linha = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind('u-1').first<any>();
    expect(await verifyPassword('senha-antiga-boa', linha.password_hash), 'a senha foi trocada apesar do 400').toBe(true);
  });

  it('aceita senha nova de 8+ e troca de verdade', async () => {
    const res = await req('/api/v1/auth/change-password', {
      method: 'POST', headers: sessao,
      body: JSON.stringify({ oldPassword: 'senha-antiga-boa', newPassword: 'senha-nova-boa' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const linha = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind('u-1').first<any>();
    expect(await verifyPassword('senha-nova-boa', linha.password_hash)).toBe(true);
  });

  it('senha ERRADA continua sendo 401, não 400 — a validação não mudou a ordem', async () => {
    // Se o schema recusasse antes de conferir a senha atual, a resposta viraria
    // 400 e a rota deixaria de distinguir "não pode" de "campo malformado".
    const res = await req('/api/v1/auth/change-password', {
      method: 'POST', headers: sessao,
      body: JSON.stringify({ oldPassword: 'nao-e-essa', newPassword: 'outra-senha-boa' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Rotas de /api/v1/auth que exigem sessão', () => {
  /*
   * As três estavam mortas por ordem de montagem: `app.route('/api/v1/auth')`
   * vem ANTES de `app.use('/api/v1/*', authMiddleware)`, e sub-router em Hono é
   * handler — quando responde, a cadeia para. Em produção, antes da correção:
   * `/me` devolvia 200 {} sem credencial, `/reset-password-first` devolvia 403
   * sempre e `/change-password` estourava 500 sempre.
   */
  it('GET /me sem credencial é 401, não 200 com corpo vazio', async () => {
    const res = await req('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /me com sessão devolve o usuário', async () => {
    const s = await sessionFor({ id: 'u-1', email: 'quem@x.com', role: 'org_admin' });
    const res = await req('/api/v1/auth/me', { headers: s });
    expect(res.status).toBe(200);
    expect((await res.json() as any).user.email).toBe('quem@x.com');
  });

  it('POST /reset-password-first com sessão troca a senha do primeiro acesso', async () => {
    // O fluxo obrigatório de primeiro acesso do `globals.js`. Antes: 403 sempre.
    await env.DB.prepare(
      `INSERT OR REPLACE INTO users (id, email, password_hash, name, role, requires_password_change) VALUES (?,?,?,?,?,1)`
    ).bind('u-novo', 'novo@x.com', await hashPassword('provisoria-123'), 'Novo', 'org_user').run();
    const s = {
      ...(await sessionFor({ id: 'u-novo', email: 'novo@x.com', role: 'org_user' })),
      'Content-Type': 'application/json',
    };

    const res = await req('/api/v1/auth/reset-password-first', {
      method: 'POST', headers: s, body: JSON.stringify({ newPassword: 'definitiva-boa' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    const linha = await env.DB.prepare('SELECT password_hash, requires_password_change FROM users WHERE id = ?')
      .bind('u-novo').first<any>();
    expect(await verifyPassword('definitiva-boa', linha.password_hash)).toBe(true);
    expect(linha.requires_password_change, 'a marca de primeiro acesso não foi limpa').toBe(0);
  });

  it('POST /reset-password-first sem sessão é 401', async () => {
    const res = await req('/api/v1/auth/reset-password-first', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'definitiva-boa' }),
    });
    expect(res.status).toBe(401);
  });

  it('/logout continua público — sessão expirada tem de poder ser limpa', async () => {
    const res = await req('/api/v1/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/v1/admin/users/:id — escopo de acesso vem de corpo validado', () => {
  let admin: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
        .bind('u-adm', 'adm@ness.io', senha, 'Admin', 'platform_admin'),
      env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-alvo', 'alvo@x.com', senha, 'Alvo', 'org_user', 'proj-a'),
    ]);
    admin = {
      ...(await sessionFor({ id: 'u-adm', email: 'adm@ness.io', role: 'platform_admin' })),
      'Content-Type': 'application/json',
    };
  });

  it('papel de tipo errado é recusado, e o papel antigo permanece', async () => {
    const res = await req('/api/v1/admin/users/u-alvo', {
      method: 'PUT', headers: admin, body: JSON.stringify({ role: 123 }),
    });
    expect(res.status).toBe(400);
    const linha = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind('u-alvo').first<any>();
    expect(linha.role, 'o papel foi alterado apesar do 400').toBe('org_user');
  });

  it('e-mail continua sendo atualizável', async () => {
    // A armadilha de ligar validação depois: o Zod REMOVE campo não declarado.
    // `email` não estava no `updateUserSchema` e o handler o grava — sem
    // declará-lo, a alteração de e-mail pararia de funcionar em silêncio.
    const res = await req('/api/v1/admin/users/u-alvo', {
      method: 'PUT', headers: admin, body: JSON.stringify({ email: 'outro@x.com' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const linha = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind('u-alvo').first<any>();
    expect(linha.email).toBe('outro@x.com');
  });

  it('senha curta é recusada também aqui', async () => {
    const res = await req('/api/v1/admin/users/u-alvo', {
      method: 'PUT', headers: admin, body: JSON.stringify({ password: 'curta' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Portal público de políticas — corpo sem autenticação nenhuma', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind('proj-pub', 'Cliente Público', 'ISO 27001', 'controller', 'Active').run();
  });

  it('e-mail que não é string devolve 400, não 500', async () => {
    // O handler chamava `email.trim().toLowerCase()` logo após um `if (!email)`.
    // Número passa no `if` e estoura no `trim` — 500 numa rota pública, que é
    // ruído na taxa de erro e ainda entrega um erro de servidor a quem sondar.
    const res = await req('/api/v1/public/policies/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 'proj-pub', email: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it('verify-otp com otp de tipo errado também é 400', async () => {
    const res = await req('/api/v1/public/policies/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 'proj-pub', email: 'a@b.com', otp: { $ne: null } }),
    });
    expect(res.status).toBe(400);
  });

  it('projeto inexistente continua 404 — a validação não engoliu o caso de negócio', async () => {
    const res = await req('/api/v1/public/policies/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 'nao-existe', email: 'a@b.com' }),
    });
    expect(res.status).toBe(404);
  });
});

/**
 * CATRACA — mesma ideia do piso de cobertura: o número pode cair, nunca subir.
 *
 * Ler o corpo cru não é errado em si (há rotas onde o corpo é opcional e o
 * handler já trata cada campo). O que é errado é a dívida crescer sem ninguém
 * notar. Quem fechar uma ocorrência baixa o teto no mesmo commit; quem abrir uma
 * nova precisa justificar no diff.
 */
describe('Catraca de leituras de corpo sem schema', () => {
  const fontes = import.meta.glob('../src/routes/*.ts', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>;

  /** 53 no levantamento inicial; 45 depois de senha/escopo/rotas públicas; 40 depois dos PUT dos módulos. */
  const TETO = 40;

  /**
   * Arquivos dispensados da catraca, com o motivo — não um número inflado.
   *
   * `scim.ts` fala SCIM 2.0, e o corpo vem do IdP do cliente. Entra, Okta e
   * Google mandam formas diferentes para a mesma operação (o `PATCH` de
   * desativação tem duas sintaxes válidas na própria RFC), e um schema estrito
   * faria o desprovisionamento simplesmente não acontecer com metade dos IdPs —
   * em silêncio, que é o pior modo de falha possível para esse controle. O
   * handler valida defensivamente o que USA: que `userName` é e-mail, que
   * `Operations` é array, que o JSON parseia.
   */
  const DISPENSADOS: Record<string, string> = {
    'scim.ts': 'corpo definido pelo IdP (RFC 7644); schema estrito quebraria interoperabilidade',
  };

  it('não cresce', () => {
    const ocorrencias: string[] = [];
    for (const [chave, src] of Object.entries(fontes)) {
      // A chave do glob é relativa a ESTE arquivo (`../src/routes/x.ts`); a
      // mensagem de falha quer o caminho do repositório. Reconstruído a partir
      // do nome do módulo, não por `replace('../', '')` — que recortaria só a
      // primeira ocorrência e é frágil à toa quando o nome já está em mãos.
      const modulo = chave.split('/').pop() ?? chave;
      if (modulo.includes('.test.')) continue;
      if (modulo in DISPENSADOS) continue;
      const caminho = `src/routes/${modulo}`;
      src.split('\n').forEach((linha, i) => {
        if (/c\.req\.json/.test(linha)) {
          ocorrencias.push(`${caminho}:${i + 1}`);
        }
      });
    }

    // Piso além do teto: se o glob parar de casar, a contagem cai para zero e o
    // teste passaria sem ter olhado nada.
    expect(Object.keys(fontes).length, 'o glob de rotas não casou nada').toBeGreaterThan(10);

    // Dispensa órfã é pior que dispensa: dá a impressão de que alguém decidiu
    // algo sobre um arquivo que já não existe.
    for (const arquivo of Object.keys(DISPENSADOS)) {
      expect(
        Object.keys(fontes).some((k) => k.endsWith(`/${arquivo}`)),
        `dispensa órfã na catraca: ${arquivo}`
      ).toBe(true);
    }

    expect(
      ocorrencias.length,
      `subiu de ${TETO} para ${ocorrencias.length} leituras de corpo sem schema. ` +
      `Use validateBody na rota nova, ou baixe o TETO no mesmo commit se estiver fechando outras.\n  ` +
      ocorrencias.join('\n  ')
    ).toBeLessThanOrEqual(TETO);
  });
});

describe('PUT dos módulos com corpo parcial — 400, não 500', () => {
  /*
   * Os PUT `/:id` montavam o UPDATE coluna a coluna e passavam `body.campo`
   * direto para o `.bind()`. Campo ausente vira `undefined`, e o D1 lança —
   * então corpo parcial devolvia **500**. Não é hipótese: apareceu em
   * `PUT /api/v1/capa/:id` durante a escrita dos testes da onda 1, e eu tinha
   * corrigido o TESTE, não o handler.
   *
   * 500 aqui custa duas vezes: o cliente não descobre qual campo falta, e a
   * requisição entra na taxa de 5xx que o `slo.yml` agora vigia — um formulário
   * incompleto viraria alerta de indisponibilidade.
   */
  const MODULOS = [
    { rota: '/api/v1/audits/reg-a', tabela: 'audit_schedule', campo: 'title' },
    { rota: '/api/v1/capa/reg-a', tabela: 'corrective_actions', campo: 'title' },
    { rota: '/api/v1/training/reg-a', tabela: 'training_records', campo: 'employee_name' },
    { rota: '/api/v1/vendors/reg-a', tabela: 'vendors', campo: 'name' },
    { rota: '/api/v1/risks/reg-a', tabela: 'risks', campo: 'asset' },
  ];

  let staff: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
      .bind('proj-m', 'Cliente M', 'ISO 27001', 'controller', 'Active').run();
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
      .bind('u-st', 'st@ness.io', await hashPassword('password123'), 'Staff', 'consultor').run();
    staff = {
      ...(await sessionFor({ id: 'u-st', email: 'st@ness.io', role: 'consultor' })),
      'Content-Type': 'application/json',
    };
    // Insere preenchendo TODA coluna NOT NULL sem default. `INSERT OR IGNORE`
    // com colunas de menos engole a violação em silêncio: a linha não nasce, e
    // o teste seguinte falha longe daqui, num `null` inesperado.
    for (const m of MODULOS) {
      const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${m.tabela}")`).all<any>();
      const usadas: string[] = [];
      const valores: unknown[] = [];
      for (const col of cols as any[]) {
        if (col.name === 'id') { usadas.push('id'); valores.push('reg-a'); continue; }
        if (col.name === 'project_id') { usadas.push('project_id'); valores.push('proj-m'); continue; }
        if (col.notnull && col.dflt_value === null) {
          usadas.push(col.name);
          valores.push(/INT|REAL|NUM/i.test(col.type ?? '') ? 1 : 'x');
        }
      }
      await env.DB.prepare(
        `INSERT INTO "${m.tabela}" (${usadas.map((u) => `"${u}"`).join(',')}) VALUES (${usadas.map(() => '?').join(',')})`
      ).bind(...valores).run();
    }
  });

  it.each(MODULOS)('$rota com corpo vazio devolve 400 nomeando o campo', async ({ rota, campo }) => {
    const res = await req(rota, { method: 'PUT', headers: staff, body: '{}' });
    expect(res.status, `${rota} devolveu ${res.status} — corpo parcial não pode virar erro de servidor`).toBe(400);
    const corpo = await res.json<any>();
    expect(JSON.stringify(corpo.details), `o 400 não diz que falta ${campo}`).toContain(campo);
  });

  it('campo OPCIONAL omitido não estoura — o `undefined` vira null antes do bind', async () => {
    // A outra metade da correção. Exigir o obrigatório sozinho não bastaria: o
    // opcional omitido continuaria chegando como `undefined` no `.bind()`.
    const res = await req('/api/v1/capa/reg-a', {
      method: 'PUT', headers: staff,
      body: JSON.stringify({ title: 'Ação corretiva', status: 'Open' }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const linha = await env.DB.prepare('SELECT title, severity FROM corrective_actions WHERE id = ?')
      .bind('reg-a').first<any>();
    expect(linha.title).toBe('Ação corretiva');
    expect(linha.severity, 'o campo omitido devia ter virado NULL').toBeNull();
  });
});

/**
 * CATRACA — `any` nos caminhos de autorização (item 3.4 do plano).
 *
 * `any` é ruim em qualquer lugar, mas numa função de autorização é ruim de um
 * jeito específico: `requireResourceAccess(db, tabela, id, user)` recebia
 * `user: any`, então passar o objeto ERRADO — a linha do banco em vez da
 * sessão, digamos — compilava, e `user.client_project_id` virava `undefined`.
 * A comparação seguinte não explode: ela responde. Só o tipo pega isso, e pega
 * antes de rodar.
 *
 * Escopo fechado de propósito: os dois arquivos que decidem QUEM PODE. O resto
 * do `any` do projeto é dívida separada e não entra nesta catraca.
 */
describe('Catraca de `any` nos caminhos de autorização', () => {
  const arquivos = {
    'src/middleware/auth.ts': middlewareSrc,
    'src/helpers.ts': helpersSrc,
  };

  /** Nomes que decidem autorização — não é o arquivo inteiro, são estas funções. */
  const FUNCOES = [
    'requireResourceAccess',
    'requireProjectAccess',
    'somenteNess',
    'ehEquipeNess',
    'resolveApiKeyUser',
    'authMiddleware',
  ];

  it('nenhuma assinatura de função de autorização usa `any`', () => {
    const infratores: string[] = [];
    for (const [nome, src] of Object.entries(arquivos)) {
      src.split('\n').forEach((linha, i) => {
        const declara = FUNCOES.some((f) => linha.includes(f) && /function|=>|const/.test(linha));
        if (declara && /\bany\b/.test(linha)) {
          infratores.push(`${nome}:${i + 1}  ${linha.trim()}`);
        }
      });
    }
    expect(infratores, `\`any\` em assinatura de autorização:\n  ${infratores.join('\n  ')}`).toEqual([]);
  });

  it('o corpo do middleware de autenticação não converte o usuário com `as any`', () => {
    // `(user as any).mfa_pending` desliga a checagem de tipo exatamente no
    // campo que decide se o segundo fator vale. Um typo no nome do campo vira
    // `undefined`, que é falsy — e o MFA deixa de ser exigido, em silêncio.
    const casts = middlewareSrc.split('\n').filter((l) => /user as any/.test(l));
    expect(casts, `cast do usuário para any no middleware:\n  ${casts.join('\n  ')}`).toEqual([]);
  });
});

/**
 * `/health` distingue versão (item 0.2 do plano).
 *
 * O `AGENTS.md` dizia, com razão, que `/health` não servia para responder "está
 * em produção?": ele respondia igual com código velho e código novo, e a sonda
 * precisava de heurística — mandar um login vazio e olhar o formato do erro.
 * Isso funciona até o dia em que o envelope de validação mudar; aí a sonda passa
 * a mentir.
 */
describe('GET /health', () => {
  it('continua público e responde ok', async () => {
    const res = await pedir(worker, '/health');
    expect(res.status).toBe(200);
    expect((await res.json<any>()).status).toBe('ok');
  });

  it('traz o campo version', async () => {
    const body = await (await pedir(worker, '/health')).json<any>();
    expect(body).toHaveProperty('version');
  });

  it('sem a var injetada, diz "dev" — que é a verdade, não um placeholder', async () => {
    const body = await (await pedir(worker, '/health')).json<any>();
    expect(body.version).toBe('dev');
  });

  it('com a var injetada, devolve o SHA publicado', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/health'),
      { ...env, VERSAO_SHA: 'abc1234', AI: { run: async () => ({ response: 'stub' }) } } as any
    );
    expect((await res.json<any>()).version).toBe('abc1234');
  });
});
