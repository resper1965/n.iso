import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Isolamento multi-tenant nos routers montados no TOPO (`/api/v1/<coisa>/:id`).
 *
 * Estas rotas NÃO passam pelo `projectAccessMiddleware` — ele só cobre
 * `/api/v1/projects/:projectId/*`. Cada handler precisa chamar
 * `requireResourceAccess` por conta própria, e onde faltava o `UPDATE ... WHERE
 * id = ?` atravessava o tenant.
 *
 * Cada caso tem duas metades, e as duas importam:
 *   - ATAQUE: ator do projeto A sobre recurso do projeto B → 403 E a linha do
 *     B intacta (o status sozinho não prova nada: um handler pode responder
 *     403 depois de já ter gravado);
 *   - LEGÍTIMO: o mesmo ator no PRÓPRIO projeto → sucesso. Sem esta metade não
 *     dá para distinguir "fechou o buraco" de "trancou a porta para todos".
 */

const A = 'proj-a';
const B = 'proj-b';

function testEnv() {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) } } as any;
}
async function req(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), testEnv());
}

describe('IDOR cross-tenant nos routers de topo', () => {
  let orgAdminA: Record<string, string>;
  let cisoA: Record<string, string>;
  let staff: Record<string, string>;
  let jsonA: Record<string, string>;
  let jsonCiso: Record<string, string>;
  let jsonStaff: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(A, 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(B, 'Cliente B', 'ISO 27001', 'controller', 'Active'),

      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-adm-a', 'adm@a.com', senha, 'Admin do A', 'org_admin', A),
      // `users.role` é TEXT livre e `createUserSchema.role` é `z.string()`:
      // este papel é criável hoje, e era ele que furava a matriz de governança.
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-ciso-a', 'ciso@a.com', senha, 'CISO do A', 'ciso', A),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-staff', 'staff@ness.io', senha, 'Staff ness.', 'platform_admin', null),

      // O ator do A é o Líder SGSI do PRÓPRIO projeto — é isso que torna a
      // assinatura dele legítima em A e ilegítima em B.
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?,?,?,?,?,?)`)
        .bind('gov-a', A, 'Admin do A', 'adm@a.com', 'tech', 'CISO'),

      // Recursos do A (alvo dos casos legítimos)
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?,?,?,?,?,?)`)
        .bind('ev-a', A, 'a.md', 'k/a.md', 'aa', 'x@a'),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?,?,?,?,?,?)`)
        .bind('ev-a-descartavel', A, 'lixo.md', 'k/lixo.md', 'cc', 'x@a'),
      env.DB.prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES (?,?,?,?,?)`)
        .bind('aud-a', A, 'Interna', 'Auditoria A', '2026-01-01'),
      env.DB.prepare(`INSERT INTO audit_findings (id, audit_id, project_id, finding_type, description) VALUES (?,?,?,?,?)`)
        .bind('find-a', 'aud-a', A, 'observation', 'Achado do A'),
      env.DB.prepare(`INSERT INTO auditor_notes (id, project_id, auditor_token, note_type, content) VALUES (?,?,?,?,?)`)
        .bind('note-a', A, 'tok-a', 'question', 'Pergunta ao A'),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES (?,?,?)`).bind('vnd-a', A, 'Fornecedor A'),
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name) VALUES (?,?,?,?)`)
        .bind('trn-a', A, 'Funcionario A', 'LGPD'),
      env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name, type) VALUES (?,?,?,?)`).bind('stk-a', A, 'Stakeholder A', 'external'),
      env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date) VALUES (?,?,?)`).bind('mr-a', A, '2026-01-01'),
      env.DB.prepare(`INSERT INTO performance_metrics (id, project_id, metric_name) VALUES (?,?,?)`).bind('met-a', A, 'Metrica A'),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level) VALUES (?,?,?,?,?,?,?)`)
        .bind('rsk-a', A, 'Ativo A', 'Ameaca A', 3, 3, 'Medium'),

      // Recursos do B (alvo dos ataques)
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?,?,?,?,?,?)`)
        .bind('ev-b', B, 'b.md', 'k/b.md', 'bb', 'x@b'),
      env.DB.prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES (?,?,?,?,?)`)
        .bind('aud-b', B, 'Interna', 'Auditoria B', '2026-01-01'),
      env.DB.prepare(`INSERT INTO audit_findings (id, audit_id, project_id, finding_type, description) VALUES (?,?,?,?,?)`)
        .bind('find-b', 'aud-b', B, 'observation', 'Achado secreto do B'),
      env.DB.prepare(`INSERT INTO auditor_notes (id, project_id, auditor_token, note_type, content) VALUES (?,?,?,?,?)`)
        .bind('note-b', B, 'tok-b', 'question', 'Pergunta ao B'),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES (?,?,?)`).bind('vnd-b', B, 'Fornecedor B'),
      env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name) VALUES (?,?,?,?)`)
        .bind('trn-b', B, 'Funcionario B', 'LGPD'),
      env.DB.prepare(`INSERT INTO stakeholders (id, project_id, name, type) VALUES (?,?,?,?)`).bind('stk-b', B, 'Stakeholder B', 'external'),
      env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date) VALUES (?,?,?)`).bind('mr-b', B, '2026-01-01'),
      env.DB.prepare(`INSERT INTO performance_metrics (id, project_id, metric_name) VALUES (?,?,?)`).bind('met-b', B, 'Metrica B'),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level) VALUES (?,?,?,?,?,?,?)`)
        .bind('rsk-b', B, 'Ativo B', 'Ameaca B', 3, 3, 'Medium'),

      // Funil comercial da ness. — sem `project_id`, logo sem tenant a comparar.
      env.DB.prepare(`INSERT INTO leads (id, company_name, status) VALUES (?,?,?)`).bind('lead-x', 'Empresa Terceira', 'New'),
      env.DB.prepare(`INSERT INTO assessments (id, client_name, status, access_token) VALUES (?,?,?,?)`)
        .bind('as-x', 'Empresa Terceira', 'In Progress', 'tok-publico'),
      env.DB.prepare(`INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, content_html) VALUES (?,?,?,?,?,?)`)
        .bind('prop-x', 'lead-x', 'as-x', 'Draft', 250000, '<p>preco confidencial</p>'),
    ]);

    orgAdminA = await sessionFor({ id: 'u-adm-a', email: 'adm@a.com', role: 'org_admin', client_project_id: A });
    cisoA = await sessionFor({ id: 'u-ciso-a', email: 'ciso@a.com', role: 'ciso', client_project_id: A });
    staff = await sessionFor({ id: 'u-staff', email: 'staff@ness.io', role: 'platform_admin' });
    jsonA = { ...orgAdminA, 'Content-Type': 'application/json' };
    jsonCiso = { ...cisoA, 'Content-Type': 'application/json' };
    jsonStaff = { ...staff, 'Content-Type': 'application/json' };
  });

  describe('Assinatura eletrônica de evidência', () => {
    it('papel ciso do projeto A não assina evidência do projeto B', async () => {
      // A matriz de governança NÃO cobria isto: o papel `ciso` pula a checagem
      // inteira. Antes da correção respondia 200 e gravava `ciso_approved_by`
      // na evidência do outro cliente.
      for (const rota of ['approve', 'signatures/approve']) {
        for (const metodo of ['POST', 'PUT']) {
          const res = await req(`/api/v1/evidence/ev-b/${rota}`, {
            method: metodo,
            headers: jsonCiso,
            body: JSON.stringify({ password: 'password123', role: 'ciso' }),
          });
          expect(res.status, `${metodo} /evidence/ev-b/${rota}`).toBe(403);
        }
      }

      const ev = await env.DB.prepare('SELECT ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?').bind('ev-b').first<any>();
      expect(ev.ciso_approved_by).toBeNull();
      expect(ev.ceo_approved_by).toBeNull();
    });

    // Este caso já passava ANTES da correção — mas por acidente, barrado pela
    // matriz de governança (regra de negócio), não pelo isolamento de tenant.
    // Fica no arquivo porque é o caso que documenta a diferença entre os dois.
    it('org_admin do A também não assina evidência do B', async () => {
      const res = await req('/api/v1/evidence/ev-b/approve', {
        method: 'POST', headers: jsonA, body: JSON.stringify({ password: 'password123', role: 'ciso' }),
      });
      expect(res.status).toBe(403);
      const ev = await env.DB.prepare('SELECT ciso_approved_by FROM evidence WHERE id = ?').bind('ev-b').first<any>();
      expect(ev.ciso_approved_by).toBeNull();
    });

    it('POSITIVO: o Líder SGSI do projeto A assina a evidência do próprio projeto', async () => {
      const res = await req('/api/v1/evidence/ev-a/approve', {
        method: 'POST', headers: jsonA, body: JSON.stringify({ password: 'password123', role: 'ciso' }),
      });
      expect(res.status, await res.clone().text()).toBe(200);

      const ev = await env.DB.prepare('SELECT ciso_approved_by, ciso_approved_at FROM evidence WHERE id = ?').bind('ev-a').first<any>();
      expect(ev.ciso_approved_by).toBe('Admin do A');
      expect(ev.ciso_approved_at).toBeTruthy();
    });
  });

  describe('Achados de auditoria (escopo vinha do corpo)', () => {
    it('não lista achados de auditoria de outro projeto', async () => {
      const res = await req('/api/v1/audits/aud-b/findings', { headers: orgAdminA });
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain('Achado secreto do B');
    });

    it('não cria achado no projeto B mesmo declarando project_id=B no corpo', async () => {
      const res = await req('/api/v1/audits/aud-b/findings', {
        method: 'POST', headers: jsonA,
        body: JSON.stringify({ project_id: B, finding_type: 'observation', description: 'NC forjada pelo tenant A' }),
      });
      expect(res.status).toBe(403);

      const gravado = await env.DB.prepare(
        "SELECT id FROM audit_findings WHERE description = 'NC forjada pelo tenant A'"
      ).first();
      expect(gravado).toBeNull();
    });

    it('POSITIVO: cria e lista achado na auditoria do próprio projeto', async () => {
      const criar = await req('/api/v1/audits/aud-a/findings', {
        method: 'POST', headers: jsonA,
        body: JSON.stringify({ project_id: A, finding_type: 'observation', description: 'Achado legitimo do A' }),
      });
      expect(criar.status, await criar.clone().text()).toBe(200);

      const listar = await req('/api/v1/audits/aud-a/findings', { headers: orgAdminA });
      expect(listar.status).toBe(200);
      const achados = await listar.json() as any[];
      expect(achados.some(f => f.description === 'Achado legitimo do A')).toBe(true);
    });

    it('o project_id gravado vem da auditoria, não do corpo da requisição', async () => {
      // Auditoria do PRÓPRIO projeto, mas o corpo mente o tenant. O achado tem
      // de cair em A — senão o `project_id` do payload voltaria a ser escopo.
      const res = await req('/api/v1/audits/aud-a/findings', {
        method: 'POST', headers: jsonA,
        body: JSON.stringify({ project_id: B, finding_type: 'observation', description: 'Achado com corpo mentiroso' }),
      });
      expect(res.status, await res.clone().text()).toBe(200);

      const f = await env.DB.prepare(
        "SELECT project_id FROM audit_findings WHERE description = 'Achado com corpo mentiroso'"
      ).first<any>();
      expect(f.project_id).toBe(A);
    });
  });

  describe('Notas do auditor externo', () => {
    it('não responde nota de auditor de outro projeto', async () => {
      const res = await req('/api/v1/auditor-notes/note-b/respond', {
        method: 'PUT', headers: jsonA, body: JSON.stringify({ response: 'resposta injetada por A' }),
      });
      expect(res.status).toBe(403);

      const n = await env.DB.prepare('SELECT response FROM auditor_notes WHERE id = ?').bind('note-b').first<any>();
      expect(n.response).toBeNull();
    });

    it('POSITIVO: responde nota do próprio projeto', async () => {
      const res = await req('/api/v1/auditor-notes/note-a/respond', {
        method: 'PUT', headers: jsonA, body: JSON.stringify({ response: 'resposta legitima' }),
      });
      expect(res.status, await res.clone().text()).toBe(200);

      const n = await env.DB.prepare('SELECT response FROM auditor_notes WHERE id = ?').bind('note-a').first<any>();
      expect(n.response).toBe('resposta legitima');
    });
  });

  describe('Funil comercial da ness. (lead → assessment → proposta)', () => {
    it('org_admin de cliente não lê nem escreve lead, proposta ou assessment', async () => {
      const leituras = ['/api/v1/leads', '/api/v1/leads/lead-x', '/api/v1/proposals', '/api/v1/proposals/prop-x', '/api/v1/assessments', '/api/v1/assessments/as-x'];
      for (const p of leituras) {
        const res = await req(p, { headers: orgAdminA });
        expect(res.status, `GET ${p}`).toBe(403);
        expect(await res.text()).not.toContain('preco confidencial');
      }

      const escritas: Array<[string, string, string]> = [
        ['PUT', '/api/v1/leads/lead-x/status', JSON.stringify({ status: 'Lost' })],
        ['DELETE', '/api/v1/leads/lead-x', ''],
        ['PUT', '/api/v1/proposals/prop-x', JSON.stringify({ status: 'Approved' })],
        ['DELETE', '/api/v1/proposals/prop-x', ''],
        ['POST', '/api/v1/proposals/prop-x/sign', '{}'],
        ['PUT', '/api/v1/assessments/as-x', JSON.stringify({ client_name: 'Renomeado por A' })],
      ];
      for (const [metodo, p, corpo] of escritas) {
        const res = await req(p, { method: metodo, headers: jsonA, body: corpo || undefined });
        expect(res.status, `${metodo} ${p}`).toBe(403);
      }

      // Nada do funil pode ter mudado.
      const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-x').first<any>();
      expect(lead.status).toBe('New');
      const prop = await env.DB.prepare('SELECT status FROM proposals WHERE id = ?').bind('prop-x').first<any>();
      expect(prop.status).toBe('Draft');
      const as = await env.DB.prepare('SELECT client_name FROM assessments WHERE id = ?').bind('as-x').first<any>();
      expect(as.client_name).toBe('Empresa Terceira');
    });

    it('POSITIVO: a equipe ness. continua operando o funil', async () => {
      expect((await req('/api/v1/leads', { headers: staff })).status).toBe(200);
      expect((await req('/api/v1/proposals/prop-x', { headers: staff })).status).toBe(200);
      expect((await req('/api/v1/assessments/as-x', { headers: staff })).status).toBe(200);

      const put = await req('/api/v1/proposals/prop-x', {
        method: 'PUT', headers: jsonStaff, body: JSON.stringify({ status: 'Sent' }),
      });
      expect(put.status, await put.clone().text()).toBe(200);
      const prop = await env.DB.prepare('SELECT status FROM proposals WHERE id = ?').bind('prop-x').first<any>();
      expect(prop.status).toBe('Sent');
    });

    it('POSITIVO: o link público de assessment continua dispensando sessão', async () => {
      // A guarda de papel não pode alcançar `/assessments/public/:token` — ali
      // o token é a credencial e não há usuário para checar.
      const res = await req('/api/v1/assessments/public/tok-publico');
      expect(res.status, await res.clone().text()).toBe(200);
    });
  });

  describe('Erro de acesso responde 403, não 500', () => {
    const ataques: Array<[string, string, string, string, any]> = [
      ['DELETE', '/api/v1/evidence/ev-b', 'evidence', 'ev-b', null],
      ['POST', '/api/v1/evidence/ev-b/evaluate', 'evidence', 'ev-b', { text: 'texto' }],
      ['DELETE', '/api/v1/vendors/vnd-b', 'vendors', 'vnd-b', null],
      ['DELETE', '/api/v1/training/trn-b', 'training_records', 'trn-b', null],
      ['PUT', '/api/v1/stakeholders/stk-b', 'stakeholders', 'stk-b', { name: 'Renomeado por A' }],
      ['DELETE', '/api/v1/stakeholders/stk-b', 'stakeholders', 'stk-b', null],
      ['PUT', '/api/v1/audit-findings/find-b', 'audit_findings', 'find-b', { description: 'Alterado por A' }],
      ['DELETE', '/api/v1/audit-findings/find-b', 'audit_findings', 'find-b', null],
      ['PUT', '/api/v1/management-reviews/mr-b', 'management_reviews', 'mr-b', { decisions: 'Decidido por A' }],
      ['PUT', '/api/v1/metrics/met-b', 'performance_metrics', 'met-b', { metric_name: 'Alterado por A' }],
      ['DELETE', '/api/v1/metrics/met-b', 'performance_metrics', 'met-b', null],
      ['DELETE', '/api/v1/risks/rsk-b', 'risks', 'rsk-b', null],
    ];

    it('recusa com 403 e deixa a linha do outro tenant intacta', async () => {
      for (const [metodo, rota, tabela, id, corpo] of ataques) {
        const res = await req(rota, {
          method: metodo,
          headers: corpo ? jsonA : orgAdminA,
          body: corpo ? JSON.stringify(corpo) : undefined,
        });
        expect(res.status, `${metodo} ${rota}`).toBe(403);

        const linha = await env.DB.prepare(`SELECT id FROM ${tabela} WHERE id = ?`).bind(id).first();
        expect(linha, `${metodo} ${rota} apagou a linha do outro tenant`).not.toBeNull();
      }

      // Nenhum dos PUTs pode ter escrito o valor do atacante.
      const stk = await env.DB.prepare('SELECT name FROM stakeholders WHERE id = ?').bind('stk-b').first<any>();
      expect(stk.name).toBe('Stakeholder B');
      const find = await env.DB.prepare('SELECT description FROM audit_findings WHERE id = ?').bind('find-b').first<any>();
      expect(find.description).toBe('Achado secreto do B');
      const mr = await env.DB.prepare('SELECT decisions FROM management_reviews WHERE id = ?').bind('mr-b').first<any>();
      expect(mr.decisions).toBeNull();
      const met = await env.DB.prepare('SELECT metric_name FROM performance_metrics WHERE id = ?').bind('met-b').first<any>();
      expect(met.metric_name).toBe('Metrica B');
    });

    it('POSITIVO: as mesmas rotas funcionam dentro do próprio projeto', async () => {
      const legitimos: Array<[string, string, string, string, any]> = [
        ['DELETE', '/api/v1/evidence/ev-a-descartavel', 'evidence', 'ev-a-descartavel', null],
        ['DELETE', '/api/v1/vendors/vnd-a', 'vendors', 'vnd-a', null],
        ['DELETE', '/api/v1/training/trn-a', 'training_records', 'trn-a', null],
        ['DELETE', '/api/v1/metrics/met-a', 'performance_metrics', 'met-a', null],
        ['DELETE', '/api/v1/risks/rsk-a', 'risks', 'rsk-a', null],
      ];
      for (const [metodo, rota, tabela, id] of legitimos) {
        const res = await req(rota, { method: metodo, headers: orgAdminA });
        expect(res.status, `${metodo} ${rota}: ${await res.clone().text()}`).toBe(200);
        const linha = await env.DB.prepare(`SELECT id FROM ${tabela} WHERE id = ?`).bind(id).first();
        expect(linha, `${metodo} ${rota} não removeu de verdade`).toBeNull();
      }

      const putStk = await req('/api/v1/stakeholders/stk-a', {
        method: 'PUT', headers: jsonA, body: JSON.stringify({ name: 'Stakeholder A renomeado' }),
      });
      expect(putStk.status, await putStk.clone().text()).toBe(200);
      const stk = await env.DB.prepare('SELECT name FROM stakeholders WHERE id = ?').bind('stk-a').first<any>();
      expect(stk.name).toBe('Stakeholder A renomeado');

      const putFind = await req('/api/v1/audit-findings/find-a', {
        method: 'PUT', headers: jsonA, body: JSON.stringify({ description: 'Achado do A revisado' }),
      });
      expect(putFind.status, await putFind.clone().text()).toBe(200);
      const find = await env.DB.prepare('SELECT description FROM audit_findings WHERE id = ?').bind('find-a').first<any>();
      expect(find.description).toBe('Achado do A revisado');

      const putMr = await req('/api/v1/management-reviews/mr-a', {
        method: 'PUT', headers: jsonA, body: JSON.stringify({ decisions: 'Manter o plano' }),
      });
      expect(putMr.status, await putMr.clone().text()).toBe(200);
      const mr = await env.DB.prepare('SELECT decisions FROM management_reviews WHERE id = ?').bind('mr-a').first<any>();
      expect(mr.decisions).toBe('Manter o plano');
    });
  });

  describe('MCP execute (rota fora de /projects/:id)', () => {
    it('ator do A não lê controle do B via project_id no corpo (403); no próprio projeto passa; staff acessa qualquer um', async () => {
      // ATAQUE: ator do A aponta o project_id do corpo para o B.
      const ataque = await req('/api/v1/mcp/execute', {
        method: 'POST', headers: jsonA,
        body: JSON.stringify({ tool: 'check_control_compliance', arguments: { project_id: B, control_id: 'A.5.1' } }),
      });
      expect(ataque.status, await ataque.clone().text()).toBe(403);

      // LEGÍTIMO: mesmo ator no próprio projeto.
      const legitimo = await req('/api/v1/mcp/execute', {
        method: 'POST', headers: jsonA,
        body: JSON.stringify({ tool: 'check_control_compliance', arguments: { project_id: A, control_id: 'A.5.1' } }),
      });
      expect(legitimo.status, await legitimo.clone().text()).toBe(200);

      // Sem project_id → 400 (não 500).
      const semProjeto = await req('/api/v1/mcp/execute', {
        method: 'POST', headers: jsonA,
        body: JSON.stringify({ tool: 'check_control_compliance', arguments: { control_id: 'A.5.1' } }),
      });
      expect(semProjeto.status).toBe(400);

      // Staff (platform_admin) acessa qualquer projeto.
      const staffB = await req('/api/v1/mcp/execute', {
        method: 'POST', headers: jsonStaff,
        body: JSON.stringify({ tool: 'check_control_compliance', arguments: { project_id: B, control_id: 'A.5.1' } }),
      });
      expect(staffB.status, await staffB.clone().text()).toBe(200);
    });
  });

  describe('Aprovação de DPIA exige autoridade de assinatura', () => {
    it('só o designado na matriz (DPO/Líder SGSI) aprova; não-designado e plataforma → 403', async () => {
      await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES (?,?,?,?)`)
        .bind('dpia-a', A, 'Tratamento A', 'Draft').run();

      // ciso@a.com NÃO está na matriz de governança → não assina (fail-closed).
      const naoDesignado = await req('/api/v1/projects/proj-a/dpia/dpia-a/approve', { method: 'POST', headers: jsonCiso });
      expect(naoDesignado.status, await naoDesignado.clone().text()).toBe(403);

      // Conta de plataforma (staff) não carimba conformidade.
      const plataforma = await req('/api/v1/projects/proj-a/dpia/dpia-a/approve', { method: 'POST', headers: jsonStaff });
      expect(plataforma.status).toBe(403);

      // Estado intacto após as recusas.
      let dpia = await env.DB.prepare('SELECT status, dpo_approved_by FROM dpia_assessments WHERE id = ?').bind('dpia-a').first<any>();
      expect(dpia.status).toBe('Draft');

      // adm@a.com É o CISO designado na matriz (gov-a) → assina de forma legítima.
      const legitimo = await req('/api/v1/projects/proj-a/dpia/dpia-a/approve', { method: 'POST', headers: jsonA });
      expect(legitimo.status, await legitimo.clone().text()).toBe(200);
      dpia = await env.DB.prepare('SELECT status, dpo_approved_by FROM dpia_assessments WHERE id = ?').bind('dpia-a').first<any>();
      expect(dpia.status).toBe('Approved');
      expect(dpia.dpo_approved_by).toBe('Admin do A');
    });
  });
});
