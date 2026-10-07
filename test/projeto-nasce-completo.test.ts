// P3 (fatia de jornada): critério de pronto parcial. O aceite pelo link cria um projeto que já tem
// os controles, o escopo vendido e o contato na governança (sem assinatura), e avisa a consultoria
// quando não há consultor. D1 real, pela rota pública.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { sha256Hex, genToken, autoridadeDeAssinatura, recusaDeAssinatura, requireProjectAccess } from '../src/helpers';
import { CARGO_CONTATO_ACEITE } from '../src/services/fechar-venda';

const db = () => env.DB as D1Database;
let ip = 0;
const aceitar = (corpo: unknown) => app.fetch(new Request('http://localhost/api/v1/public/propostas/aceitar', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.77.0.${++ip}` }, body: JSON.stringify(corpo),
}), workerEnv() as any);
const conta = async (sql: string, ...b: unknown[]) => (await db().prepare(sql).bind(...b).first<{ n: number }>())!.n;

const SERVICO = { nome: 'Implementação ISO 27001 + 27701', norma: 'ISO/IEC 27001:2022 + 27701:2025', tipo: 'projeto', descricao: '', premissas: [], exclusoes: [],
  formaPreco: 'fixo', valorFixo: 90000, entregaveis: ['x'], criterioAceite: 'ok', fases: [{ nome: 'Diagnóstico', percentual: 100 }] };

describe('projeto nasce completo do aceite da proposta', () => {
  beforeAll(async () => {
    await applySchema();
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-com','com@ness.lat','x','Com','comercial')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cadm','cadm@ness.lat','x','Adm','consultoria_admin','org_ness')`),
    ]);
  }, 60_000);

  it('aceite pelo link: controles, escopo, contato sem assinatura, aviso sem consultor; re-aceite idempotente', async () => {
    const token = genToken();
    await db().batch([
      db().prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-1', 'Cliente', 'Proposal', 'org_ness')`),
      db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, status, cliente, consultor_email, total_projeto, escopo, documento_html, documento_hash,
        valida_ate, criada_por, token_hash) VALUES ('pp-1', 'org_ness', 'l-1', 'NESS-2026-77', 'enviada', 'Cliente Ltda.', NULL, 90000,
        'Sede em São Paulo e a plataforma de pagamentos', '<p>doc</p>', 'hash-doc', '2099-12-31', 'com@ness.lat', ?)`).bind(await sha256Hex(token)),
      db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico, valor) VALUES ('pp-1-i', 'pp-1', 0, ?, 90000)`).bind(JSON.stringify(SERVICO)),
    ]);
    const corpo = { token, nome: 'Maria Cliente', cargo: 'Diretora Executiva', email: 'maria@cliente.com', poderes: true };

    expect((await aceitar(corpo)).status).toBe(200);
    const projetoId = (await db().prepare(`SELECT projeto_id FROM propostas WHERE id = 'pp-1'`).first<any>()).projeto_id as string;
    expect(projetoId).toBeTruthy();

    // 1. controles
    expect(await conta(`SELECT COUNT(*) n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27001:2022'`, projetoId)).toBe(93);
    expect(await conta(`SELECT COUNT(*) n FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025'`, projetoId)).toBe(31);
    // escopo e nome
    expect(await db().prepare('SELECT scope, project_name FROM projects WHERE id = ?').bind(projetoId).first<any>())
      .toEqual({ scope: 'Sede em São Paulo e a plataforma de pagamentos', project_name: 'Cliente Ltda. — ISO/IEC 27001:2022 + 27701:2025' });
    // contato na governança, sem assinatura
    expect((await db().prepare('SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ?').bind(projetoId).all<any>()).results)
      .toEqual([{ name: 'Maria Cliente', email: 'maria@cliente.com', role_category: 'executivo', job_title: CARGO_CONTATO_ACEITE }]);
    const a = await autoridadeDeAssinatura(db(), projetoId, { email: 'maria@cliente.com', role: 'org_admin' });
    expect(recusaDeAssinatura(a, 'ceo')).not.toBeNull();
    // sem consultor: a administração é avisada e alcança o projeto
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE user_id = 'u-cadm' AND type = 'projeto_sem_consultor' AND target_id = 'pp-1'`)).toBe(1);
    await expect(requireProjectAccess(db(), { role: 'consultoria_admin', org_id: 'org_ness', email: 'cadm@ness.lat' }, projetoId)).resolves.toBe(true);

    // re-aceite: 409, nada novo
    expect((await aceitar(corpo)).status).toBe(409);
    expect(await conta(`SELECT COUNT(*) n FROM projects WHERE proposta_id = 'pp-1'`)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM compliance_controls WHERE project_id = ?`, projetoId)).toBe(124);
    expect(await conta(`SELECT COUNT(*) n FROM project_governance WHERE project_id = ?`, projetoId)).toBe(1);
    expect(await conta(`SELECT COUNT(*) n FROM notifications WHERE type = 'projeto_sem_consultor' AND target_id = 'pp-1'`)).toBe(1);
  }, 60_000);
});
