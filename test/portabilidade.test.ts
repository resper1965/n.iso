import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';
import { exportarProjeto, tabelasExportaveis } from '../src/portabilidade';

/**
 * Portabilidade do tenant (item 4.6 do plano; LGPD art. 18, V).
 *
 * As duas asserções que carregam este arquivo são de sinal oposto, e as duas
 * importam igual:
 *
 *   1. O export leva TUDO do cliente — export incompleto é pior que nenhum,
 *      porque parece completo. Por isso as tabelas saem do banco, não de uma
 *      lista, e este teste confere que tabela nova entra sozinha.
 *   2. O export NÃO leva nada de outro cliente. É a mesma falha de isolamento de
 *      sempre, num lugar onde ela vazaria o tenant inteiro de uma vez.
 */

const A = 'proj-a';
const B = 'proj-b';

describe('Export de portabilidade', () => {
  let admA: Record<string, string>;
  let admB: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(B, 'Cliente B', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'a@x.com', senha, 'A', 'org_admin', A),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-b', 'b@x.com', senha, 'B', 'org_admin', B),

      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability) VALUES (?,?,?,?,?,?)`)
        .bind('r-a', A, 'Servidor do A', 'Ameaça A', 4, 4),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability) VALUES (?,?,?,?,?,?)`)
        .bind('r-b', B, 'SEGREDO-DO-CLIENTE-B', 'Ameaça B', 5, 5),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES (?,?,?)`).bind('v-a', A, 'Fornecedor do A'),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES (?,?,?)`).bind('v-b', B, 'SEGREDO-FORNECEDOR-B'),

      // Credencial viva: NÃO pode sair no export.
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, name, key_hash, permissions, status) VALUES (?,?,?,?,?,?)`)
        .bind('k-a', A, 'chave', 'hash-secreto-da-chave', 'read', 'Active'),
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES (?,?,?,?)`)
        .bind('at-a', A, 'token-secreto-do-auditor', '2099-01-01T00:00:00Z'),
    ]);

    admA = await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: A });
    admB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: B });
  });

  it('a lista de tabelas sai do BANCO — tabela nova entra sozinha', async () => {
    const antes = await tabelasExportaveis(env as any);
    expect(antes.length, 'nenhuma tabela exportável — a descoberta quebrou').toBeGreaterThan(20);
    expect(antes).toContain('risks');

    // O modo de falha que este teste existe para pegar: alguém cria a tabela, o
    // export continua "funcionando", e o cliente leva um arquivo sem ela.
    await env.DB.prepare('CREATE TABLE tabela_nova_do_produto (id TEXT PRIMARY KEY, project_id TEXT, valor TEXT)').run();
    const depois = await tabelasExportaveis(env as any);
    expect(depois, 'tabela nova não entrou no export').toContain('tabela_nova_do_produto');
    await env.DB.prepare('DROP TABLE tabela_nova_do_produto').run();
  });

  it('leva os dados do cliente e NADA do vizinho', async () => {
    const { manifesto, dados } = await exportarProjeto(env as any, A);

    expect((dados.risks as any[]).map((r) => r.id)).toEqual(['r-a']);
    expect((dados.vendors as any[]).map((v) => v.id)).toEqual(['v-a']);
    expect((dados.projects as any[])[0].client_name).toBe('Cliente A');

    // A asserção que importa não é a contagem, é a ausência do texto: qualquer
    // tabela que escapasse do filtro apareceria aqui.
    const bruto = JSON.stringify(dados);
    expect(bruto, 'dado do outro tenant no export').not.toContain('SEGREDO-DO-CLIENTE-B');
    expect(bruto).not.toContain('SEGREDO-FORNECEDOR-B');

    expect(manifesto.projeto).toBe(A);
    expect(manifesto.total_linhas).toBeGreaterThan(0);
  });

  it('NÃO leva credencial — chave de API e token de auditor ficam de fora', async () => {
    // Elas têm `project_id` e passariam pela descoberta automática. São dado da
    // PLATAFORMA, não do titular: um export que as carrega vira cópia viva de
    // credenciais, guardada em qualquer lugar onde o cliente ponha o arquivo.
    const { dados } = await exportarProjeto(env as any, A);
    expect(Object.keys(dados)).not.toContain('api_keys');
    expect(Object.keys(dados)).not.toContain('auditor_tokens');
    const bruto = JSON.stringify(dados);
    expect(bruto).not.toContain('hash-secreto-da-chave');
    expect(bruto).not.toContain('token-secreto-do-auditor');
  });

  it('o manifesto declara o que NÃO foi incluído, e por que não há assinatura', async () => {
    // Manifesto que só lista o que veio deixa o resto parecer inexistente. E
    // `assinatura: null` sem motivo escrito é pior que assinatura nenhuma: quem
    // recebe não distingue "não configurado" de "falhou".
    const { manifesto } = await exportarProjeto(env as any, A);
    expect(manifesto.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifesto.nao_incluido.length).toBeGreaterThanOrEqual(3);
    expect(manifesto.assinatura).toBeNull();
    expect(manifesto.assinatura_ausente, 'null sem motivo').toContain('EXPORT_SIGNING_KEY');
  });

  it('assina com Ed25519, e QUEM RECEBE consegue verificar com a chave pública', async () => {
    // A asserção que justifica ter trocado HMAC por assimétrico: a verificação
    // abaixo usa SÓ a chave pública. Com HMAC, quem verificasse também
    // conseguiria forjar — e uma assinatura que o recipiente não pode conferir
    // sem poder falsificar não prova origem a ninguém.
    const par = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify']);
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', (par as any).privateKey);
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
    const comChave = { ...env, EXPORT_SIGNING_KEY: b64(pkcs8) } as any;

    const um = await exportarProjeto(comChave, A);
    expect(um.manifesto.assinatura_alg).toBe('Ed25519');
    expect(um.manifesto.assinatura_ausente).toBeUndefined();

    const sig = Uint8Array.from(atob(um.manifesto.assinatura!), (ch) => ch.charCodeAt(0));
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' } as any,
      (par as any).publicKey,
      sig,
      new TextEncoder().encode(JSON.stringify(um.dados))
    );
    expect(ok, 'a assinatura não confere com a chave pública').toBe(true);
  });

  it('a assinatura NÃO confere se o conteúdo mudar', async () => {
    // Sem esta metade, uma assinatura de constante passaria no teste acima.
    const par = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify']);
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', (par as any).privateKey);
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
    const comChave = { ...env, EXPORT_SIGNING_KEY: b64(pkcs8) } as any;

    const um = await exportarProjeto(comChave, A);
    await env.DB.prepare('INSERT INTO vendors (id, project_id, name) VALUES (?,?,?)')
      .bind('v-a2', A, 'Outro fornecedor').run();
    const dois = await exportarProjeto(comChave, A);

    expect(dois.manifesto.assinatura).not.toBe(um.manifesto.assinatura);
    expect(dois.manifesto.sha256).not.toBe(um.manifesto.sha256);

    const sigVelha = Uint8Array.from(atob(um.manifesto.assinatura!), (ch) => ch.charCodeAt(0));
    const confere = await crypto.subtle.verify(
      { name: 'Ed25519' } as any, (par as any).publicKey, sigVelha,
      new TextEncoder().encode(JSON.stringify(dois.dados))
    );
    expect(confere, 'assinatura antiga validou conteúdo novo').toBe(false);
  });

  it('chave presente mas ilegível é DIFERENTE de chave ausente', async () => {
    // Rotação malfeita não pode passar como "ainda não configurado" — ninguém
    // investigaria.
    const ruim = { ...env, EXPORT_SIGNING_KEY: 'isto-nao-e-pkcs8' } as any;
    const r = await exportarProjeto(ruim, A);
    expect(r.manifesto.assinatura).toBeNull();
    expect(r.manifesto.assinatura_ausente).toContain('presente mas inválida');
  });
});

describe('GET /api/v1/projects/:projectId/export', () => {
  it('cliente baixa o próprio projeto, como anexo', async () => {
    const admA = await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: A });
    const res = await pedir(worker, `/api/v1/projects/${A}/export`, { headers: admA });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain(`niso-export-${A}`);
    const corpo = await res.json<any>();
    expect(corpo.manifesto.projeto).toBe(A);
  });

  it('cliente NÃO baixa o projeto do vizinho', async () => {
    // A rota usa `:projectId` de propósito: é esse nome que faz o
    // `projectAccessMiddleware` rodar. Com `:id`, a guarda não pegaria — e o
    // vazamento seria do tenant inteiro de uma vez.
    const admB = await sessionFor({ id: 'u-b', email: 'b@x.com', role: 'org_admin', client_project_id: B });
    const res = await pedir(worker, `/api/v1/projects/${A}/export`, { headers: admB });
    expect(res.status, 'o export ignorou o isolamento de tenant').toBe(403);
  });

  it('sem sessão é 401', async () => {
    expect((await pedir(worker, `/api/v1/projects/${A}/export`)).status).toBe(401);
  });
});
