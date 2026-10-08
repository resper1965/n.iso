// Critério de pronto da fatia de jornada (spec 2026-10-07, seção 5), ponta a ponta, pelas rotas do
// produto e com o D1 real. Só a equipe da consultoria (comercial, administração e consultor) e a
// proposta enviada nascem no preparo, como em test/projeto-nasce-completo.test.ts; daí em diante
// tudo passa pela API: aceite, designação, contas do cliente com login e primeira senha, governança,
// política e as duas aprovações, evidência pelo checklist e revisão, e o portal do auditor.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { sha256Hex, genToken, hashPassword } from '../src/helpers';
import { CARGO_CONTATO_ACEITE } from '../src/services/fechar-venda';

type Cab = Record<string, string>;
const db = () => env.DB as D1Database;
const SENHA_EQUIPE = 'Equipe-forte-123!';
const SENHA_PROVISORIA = 'Provisoria-123!';
const SENHA_NOVA = 'Senha-nova-456!';
const TEXTO_51 = 'Política de segurança da informação da Cliente Ltda.: escopo, papéis e revisão anual.';
const TEXTO_52 = 'Papéis e responsabilidades de segurança da informação da Cliente Ltda.';
const SERVICO = { nome: 'Implementação ISO 27001 + 27701', norma: 'ISO/IEC 27001:2022 + 27701:2025', tipo: 'projeto', descricao: '', premissas: [], exclusoes: [],
  formaPreco: 'fixo', valorFixo: 90000, entregaveis: ['x'], criterioAceite: 'ok', fases: [{ nome: 'Diagnóstico', percentual: 100 }] };

let ip = 0;
const chamar = (h: Cab, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.91.0.${++ip % 250}`, ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const ok = async (r: Response, status = 200) => { expect(r.status, await r.clone().text()).toBe(status); return r.json<any>(); };

/** Login real; no primeiro acesso, define a senha nova pela rota obrigatória. */
async function entrar(email: string, senha: string): Promise<Cab> {
  const login = await ok(await chamar({}, 'POST', '/api/v1/auth/login', { email, password: senha }));
  const h = { Authorization: `Bearer ${login.token}` };
  if (login.requiresPasswordChange) await ok(await chamar(h, 'POST', '/api/v1/auth/reset-password-first', { newPassword: SENHA_NOVA }));
  return h;
}

describe('fatia de jornada: do aceite da proposta ao auditor, só pelo produto', () => {
  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword(SENHA_EQUIPE);
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-com','com@ness.lat',?,'Com','comercial','org_ness')`).bind(hash),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cadm','cadm@ness.lat',?,'Adm','consultoria_admin','org_ness')`).bind(hash),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons','cons@ness.lat',?,'Cons','consultor','org_ness')`).bind(hash),
    ]);
  }, 60_000);

  it('percorre os cinco passos do critério', async () => {
    // ── 1. proposta enviada e aceita pelo link → projeto com os controles ────────────────────────
    const tokenProposta = genToken();
    await db().batch([
      db().prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-fj', 'Cliente', 'Proposal', 'org_ness')`),
      db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, status, cliente, consultor_email, total_projeto, escopo, documento_html, documento_hash,
        valida_ate, criada_por, token_hash) VALUES ('pp-fj', 'org_ness', 'l-fj', 'NESS-2026-90', 'enviada', 'Cliente Ltda.', NULL, 90000,
        'Sede em São Paulo', '<p>doc</p>', 'hash-doc', '2099-12-31', 'com@ness.lat', ?)`).bind(await sha256Hex(tokenProposta)),
      db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico, valor) VALUES ('pp-fj-i', 'pp-fj', 0, ?, 90000)`).bind(JSON.stringify(SERVICO)),
    ]);
    await ok(await chamar({}, 'POST', '/api/v1/public/propostas/aceitar',
      { token: tokenProposta, nome: 'Maria Cliente', cargo: 'Diretora Executiva', email: 'maria@cliente.com', poderes: true }));
    const P = (await db().prepare(`SELECT projeto_id FROM propostas WHERE id = 'pp-fj'`).first<{ projeto_id: string }>())!.projeto_id;
    expect(P).toBeTruthy();

    const cadm = await entrar('cadm@ness.lat', SENHA_EQUIPE);
    const controles = await ok(await chamar(cadm, 'GET', `/api/v1/projects/${P}/traceability`));
    expect(controles.controls.length).toBe(124); // 93 da 27001 + 31 da 27701 vendida

    // ── a consultoria designa o consultor; o consultor monta a governança e as contas ───────────
    await ok(await chamar(cadm, 'POST', `/api/v1/projects/${P}/governance`,
      { name: 'Cons', email: 'cons@ness.lat', role_category: 'consultor', job_title: 'Consultor' }));
    const cons = await entrar('cons@ness.lat', SENHA_EQUIPE);

    const matriz = await ok(await chamar(cons, 'GET', `/api/v1/projects/${P}/governance`));
    const contato = matriz.find((g: any) => g.email === 'maria@cliente.com');
    expect(contato.job_title).toBe(CARGO_CONTATO_ACEITE);
    // O contato do aceite é promovido a Direção (CEO); entram o Diretor e o Líder SGSI.
    await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/governance`,
      { id: contato.id, name: 'Maria Cliente', email: 'maria@cliente.com', role_category: 'executivo', job_title: 'CEO' }));
    await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/governance`,
      { name: 'Davi Diretor', email: 'davi@cliente.com', role_category: 'executivo', job_title: 'Diretor de Operações' }));
    await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/governance`,
      { name: 'Lia Líder', email: 'lia@cliente.com', role_category: 'tech', job_title: 'Líder SGSI', is_primary: true }));

    const conta = (email: string, name: string, role: string) =>
      chamar(cons, 'POST', '/api/v1/users', { email, name, role, password: SENHA_PROVISORIA, client_project_id: P });
    await ok(await conta('maria@cliente.com', 'Maria Cliente', 'org_admin'), 201);
    await ok(await conta('davi@cliente.com', 'Davi Diretor', 'org_user'), 201);
    await ok(await conta('lia@cliente.com', 'Lia Líder', 'org_admin'), 201);
    await ok(await conta('ana@cliente.com', 'Ana Analista', 'org_user'), 201);
    const maria = await entrar('maria@cliente.com', SENHA_PROVISORIA);
    const davi = await entrar('davi@cliente.com', SENHA_PROVISORIA);
    const lia = await entrar('lia@cliente.com', SENHA_PROVISORIA);
    const ana = await entrar('ana@cliente.com', SENHA_PROVISORIA);

    // ── 2. o consultor grava a política (A.5.1 e A.5.2) ──────────────────────────────────────────
    const p51 = await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/controls/A.5.1/policy`, { text: TEXTO_51 }));
    const p52 = await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/controls/A.5.2/policy`, { text: TEXTO_52 }));
    const assinaturaDe = (id: string) => db().prepare('SELECT description, ceo_approved_by, ceo_approved_at FROM compliance_controls WHERE id = ?')
      .bind(id).first<{ description: string; ceo_approved_by: string | null; ceo_approved_at: string | null }>();

    // ── 3a. a Direção assina direto (CEO, com senha) ─────────────────────────────────────────────
    await ok(await chamar(maria, 'POST', `/api/v1/controls/${p51.control_id}/approve`, { role: 'ceo', password: SENHA_NOVA }));
    expect(await assinaturaDe(p51.control_id)).toMatchObject({ description: TEXTO_51, ceo_approved_by: 'Maria Cliente', ceo_approved_at: expect.any(String) });

    // ── 3b. a Direção (org_user, só leitura) aprova pelo pedido ─────────────────────────────────
    const pedido = await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/pedidos`,
      { tipo: 'politica', ref_id: 'A.5.2', papel_exigido: 'ceo', destinatarios: [{ email: 'davi@cliente.com' }] }), 201);
    await ok(await chamar(davi, 'POST', `/api/v1/pedidos/${pedido.id}/aprovar`, { senha: SENHA_NOVA }));
    expect(await assinaturaDe(p52.control_id)).toMatchObject({ description: TEXTO_52, ceo_approved_by: 'Davi Diretor', ceo_approved_at: expect.any(String) });

    // ── 4. evidência pelo checklist, ligada ao controle e pendente; o Líder SGSI revisa ─────────
    const form = new FormData();
    form.append('file', new File(['politica assinada'], 'politica.pdf', { type: 'application/pdf' }));
    form.append('item_id', 'p15_1'); // "Redigir Política Geral de SI (A.5.1)"
    const up = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/documents/upload`, { method: 'POST', headers: ana, body: form }), workerEnv());
    const { id: evId } = await ok(up, 201);
    const evidenciaNaRastreabilidade = async () =>
      (await ok(await chamar(cons, 'GET', `/api/v1/projects/${P}/traceability`))).controls.find((c: any) => c.id === p51.control_id).evidence;
    expect(await evidenciaNaRastreabilidade()).toEqual([expect.objectContaining({ id: evId, evaluation_status: 'pending' })]);

    const { file_hash } = (await db().prepare('SELECT file_hash FROM evidence WHERE id = ?').bind(evId).first<{ file_hash: string }>())!;
    // Revisa o Líder SGSI, que não é quem enviou (a Ana).
    await ok(await chamar(lia, 'POST', `/api/v1/evidence/${evId}/approve`, { role: 'ciso', password: SENHA_NOVA, file_hash }));
    expect(await evidenciaNaRastreabilidade()).toEqual([expect.objectContaining({ id: evId, evaluation_status: 'conforming' })]);

    // ── 5. a consultoria gera o link; o auditor vê a SoA com a evidência e baixa o arquivo ──────
    const gerado = await ok(await chamar(cons, 'POST', `/api/v1/projects/${P}/auditor-token`, { days_valid: 7 }), 201);
    const tokenAuditor = (gerado.url as string).match(/\/auditor#([0-9a-f]{64})$/)?.[1];
    expect(tokenAuditor).toBeTruthy();
    const soa = await ok(await chamar({}, 'POST', '/api/v1/public/auditor/ver', { token: tokenAuditor }));
    expect(soa.controles.length).toBe(124);
    expect(soa.controles.find((c: any) => c.id === p51.control_id).evidencias).toEqual([
      expect.objectContaining({ id: evId, file_name: 'politica.pdf', file_hash, evaluation_status: 'conforming', ciso_approved_by: 'Lia Líder' }),
    ]);
    const arquivo = await chamar({}, 'POST', '/api/v1/public/auditor/evidencia', { token: tokenAuditor, evidence_id: evId });
    expect(arquivo.status).toBe(200);
    expect(await arquivo.text()).toBe('politica assinada');
  }, 120_000);
});
