import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions, sessionFor, pedir } from './helpers/d1';

/**
 * Funil comercial: assessment → precificação → proposta → projeto
 * (`src/routes/assessments.ts`).
 *
 * Era o arquivo MENOS coberto do backend (15,7%) e é por onde entra dinheiro: o
 * questionário de pré-venda, o preço calculado a partir dele, a proposta gerada
 * e a conversão em projeto. Erro aqui não aparece como 500 na tela — aparece
 * como preço errado numa proposta assinada, ou como projeto criado sem as fases.
 *
 * Dois eixos, e o segundo é o que importa mais:
 *
 *   1. O fluxo funciona ponta a ponta.
 *   2. O LINK PÚBLICO não é uma porta lateral. `/public/:token` é a única rota
 *      do arquivo sem sessão — o token no caminho É a credencial — e ela precisa
 *      recusar o que a rota autenticada recusa.
 */

const staffSessao = async () =>
  sessionFor({ id: 'u-c', email: 'consultor@ness.io', role: 'consultor', iat: Date.now() });

describe('Funil de assessment', () => {
  let staff: Record<string, string>;
  let cliente: Record<string, string>;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-x', 'Cliente X', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)`)
        .bind('u-c', 'consultor@ness.io', senha, 'Consultor', 'consultor'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-x', 'adm@x.com', senha, 'Admin X', 'org_admin', 'proj-x'),
      env.DB.prepare(`INSERT INTO leads (id, company_name, status) VALUES (?,?,?)`).bind('lead-1', 'Empresa', 'New'),
    ]);
    staff = { ...(await staffSessao()), 'Content-Type': 'application/json' };
    cliente = {
      ...(await sessionFor({ id: 'u-x', email: 'adm@x.com', role: 'org_admin', client_project_id: 'proj-x', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function criar(clientName = 'Empresa Nova', leadId?: string) {
    const res = await pedir(worker, '/api/v1/assessments', {
      method: 'POST', headers: staff,
      body: JSON.stringify({ client_name: clientName, ...(leadId ? { lead_id: leadId } : {}) }),
    });
    return { res, corpo: await res.json<any>() };
  }

  describe('criação', () => {
    it('cria com token de acesso e move o lead para Assessment', async () => {
      const { res, corpo } = await criar('Empresa Nova', 'lead-1');
      expect(res.status).toBe(201);
      expect(corpo.access_token).toHaveLength(24);
      expect(corpo.status).toBe('in_progress');

      const lead = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind('lead-1').first<any>();
      expect(lead.status, 'o lead não avançou no funil').toBe('Assessment');
    });

    it('sem client_name é 400', async () => {
      const res = await pedir(worker, '/api/v1/assessments', {
        method: 'POST', headers: staff, body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('cliente não alcança o funil comercial — é área da ness.', async () => {
      // Sonda registrada no próprio arquivo: o `org_admin` de um cliente lia e
      // renomeava o assessment de outro com 200.
      expect((await pedir(worker, '/api/v1/assessments', { headers: cliente })).status).toBe(403);
    });
  });

  describe('blocos do questionário', () => {
    it('devolve as perguntas do bloco, com as respostas já dadas', async () => {
      const { corpo } = await criar();
      const salvar = await pedir(worker, `/api/v1/assessments/${corpo.id}/block/1`, {
        method: 'POST', headers: staff,
        body: JSON.stringify({ answers: [{ question_key: 'sector', question: 'Setor?', answer: 'Fintech' }] }),
      });
      expect(salvar.status, await salvar.clone().text()).toBe(200);

      const ler = await pedir(worker, `/api/v1/assessments/${corpo.id}/block/1`, { headers: staff });
      const bloco = await ler.json<any>();
      expect(bloco.block).toBe(1);
      expect(bloco.questions.length).toBeGreaterThan(0);
      // A chave é a do `BLOCK_QUESTIONS`: resposta gravada com chave que não
      // existe no bloco some da tela sem erro nenhum.
      expect(bloco.questions.find((q: any) => q.key === 'sector')?.answer).toBe('Fintech');
    });

    it('regravar o bloco SUBSTITUI as respostas, não duplica', async () => {
      // O handler apaga o bloco antes de inserir. Sem isso, cada nova gravação
      // acumularia respostas e a precificação leria a versão errada.
      const { corpo } = await criar();
      for (const valor of ['Fintech', 'Healthtech']) {
        await pedir(worker, `/api/v1/assessments/${corpo.id}/block/1`, {
          method: 'POST', headers: staff,
          body: JSON.stringify({ answers: [{ question_key: 'sector', question: 'Setor?', answer: valor }] }),
        });
      }
      const { results } = await env.DB.prepare(
        'SELECT answer FROM assessment_answers WHERE assessment_id = ? AND question_key = ?'
      ).bind(corpo.id, 'sector').all();
      expect(results).toHaveLength(1);
      expect((results as any[])[0].answer).toBe('Healthtech');
    });

    it('bloco fora de 1..10 é 400, e assessment inexistente é 404', async () => {
      const { corpo } = await criar();
      expect((await pedir(worker, `/api/v1/assessments/${corpo.id}/block/99`, { headers: staff })).status).toBe(400);
      expect((await pedir(worker, '/api/v1/assessments/nao-existe/block/1', { headers: staff })).status).toBe(404);
    });
  });

  describe('precificação', () => {
    it('sem respostas, recusa em vez de inventar preço', async () => {
      // Um preço calculado sobre zero respostas seria um número plausível e
      // errado — o pior tipo de saída numa proposta comercial.
      const { corpo } = await criar();
      const res = await pedir(worker, `/api/v1/assessments/${corpo.id}/pricing`, { headers: staff });
      expect(res.status).toBe(400);
    });

    it('com respostas, calcula e devolve tier e preço', async () => {
      const { corpo } = await criar();
      await pedir(worker, `/api/v1/assessments/${corpo.id}/block/1`, {
        method: 'POST', headers: staff,
        body: JSON.stringify({
          answers: [
            { question_key: 'headcount', question: 'Colaboradores?', answer: '101–250' },
            { question_key: 'sector', question: 'Setor?', answer: 'Fintech' },
          ],
        }),
      });
      const res = await pedir(worker, `/api/v1/assessments/${corpo.id}/pricing`, { headers: staff });
      expect(res.status, await res.clone().text()).toBe(200);
      const p = await res.json<any>();
      expect(p.precoFinal).toBeGreaterThan(0);
      expect(p.tier).toBeTruthy();
    });

    it('ajuste manual de preço fica gravado', async () => {
      const { corpo } = await criar();
      const res = await pedir(worker, `/api/v1/assessments/${corpo.id}/pricing`, {
        method: 'PUT', headers: staff,
        body: JSON.stringify({ precoFinal: 123456, desconto: 10, notas: 'desconto de fechamento' }),
      });
      expect(res.status).toBe(200);
      const linha = await env.DB.prepare(
        'SELECT pricing_override, pricing_desconto, pricing_notas FROM assessments WHERE id = ?'
      ).bind(corpo.id).first<any>();
      expect(linha.pricing_override).toBe(123456);
      expect(linha.pricing_desconto).toBe(10);
    });

    it('PUT sem campo nenhum é 400 — não é um no-op silencioso', async () => {
      const { corpo } = await criar();
      const res = await pedir(worker, `/api/v1/assessments/${corpo.id}`, {
        method: 'PUT', headers: staff, body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('conversão em projeto', () => {
    async function comRespostas() {
      const { corpo } = await criar('Cliente Convertido');
      await pedir(worker, `/api/v1/assessments/${corpo.id}/block/1`, {
        method: 'POST', headers: staff,
        body: JSON.stringify({
          answers: [
            { question_key: 'sector', question: 'Setor?', answer: 'Fintech' },
            { question_key: 'scope_type', question: 'Escopo?', answer: 'Toda a empresa' },
            { question_key: 'target_standard', question: 'Norma?', answer: 'ISO 27001 apenas' },
            { question_key: 'data_role', question: 'Papel?', answer: 'controller' },
          ],
        }),
      });
      return corpo.id;
    }

    it('cria o projeto com os dados do questionário E semeia as fases', async () => {
      // Projeto sem fases é projeto que abre vazio na tela do cliente — falha
      // que não gera erro nenhum e só aparece no primeiro acesso dele.
      const id = await comRespostas();
      const res = await pedir(worker, `/api/v1/assessments/${id}/convert`, { method: 'POST', headers: staff });
      expect(res.status, await res.clone().text()).toBe(201);
      const { project_id } = await res.json<any>();

      const projeto = await env.DB.prepare('SELECT client_name, sector, standards, assessment_id FROM projects WHERE id = ?')
        .bind(project_id).first<any>();
      expect(projeto.client_name).toBe('Cliente Convertido');
      expect(projeto.sector).toBe('Fintech');
      expect(projeto.assessment_id, 'o vínculo com o assessment não foi gravado').toBe(id);

      const { results: fases } = await env.DB.prepare('SELECT id FROM project_phases WHERE project_id = ?')
        .bind(project_id).all();
      expect(fases!.length, 'o projeto nasceu sem fases').toBeGreaterThan(0);
    });

    it('converter duas vezes é 409, e não cria projeto novo', async () => {
      const id = await comRespostas();
      await pedir(worker, `/api/v1/assessments/${id}/convert`, { method: 'POST', headers: staff });
      const segunda = await pedir(worker, `/api/v1/assessments/${id}/convert`, { method: 'POST', headers: staff });
      expect(segunda.status).toBe(409);

      const { results } = await env.DB.prepare('SELECT id FROM projects WHERE assessment_id = ?').bind(id).all();
      expect(results, 'a segunda conversão criou um projeto duplicado').toHaveLength(1);
    });

    it('assessment inexistente é 404', async () => {
      expect((await pedir(worker, '/api/v1/assessments/nao-existe/convert', { method: 'POST', headers: staff })).status).toBe(404);
    });
  });

  describe('link público — a única rota sem sessão', () => {
    it('o token abre o assessment e aceita respostas', async () => {
      const { corpo } = await criar();
      const ler = await pedir(worker, `/api/v1/assessments/public/${corpo.access_token}`);
      expect(ler.status).toBe(200);
      expect((await ler.json<any>()).client_name).toBe('Empresa Nova');

      const salvar = await pedir(worker, `/api/v1/assessments/public/${corpo.access_token}/answers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: 2, answers: [{ question_key: 'q1', question: 'P?', answer: 'R' }] }),
      });
      expect(salvar.status).toBe(200);
      expect((await salvar.json<any>()).saved).toBe(1);
    });

    it('token inválido é 404 — e não revela se o assessment existe', async () => {
      expect((await pedir(worker, '/api/v1/assessments/public/token-inventado')).status).toBe(404);
      const res = await pedir(worker, '/api/v1/assessments/public/token-inventado/answers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: 1, answers: [] }),
      });
      expect(res.status).toBe(404);
    });

    it('depois de convertido, o link público FECHA (410)', async () => {
      // Sem isso, o link continuaria aceitando respostas para um assessment que
      // já virou projeto — respostas que ninguém mais leria, num link que
      // circula por e-mail e não expira.
      const { corpo } = await criar();
      await env.DB.prepare("UPDATE assessments SET status = 'converted' WHERE id = ?").bind(corpo.id).run();

      expect((await pedir(worker, `/api/v1/assessments/public/${corpo.access_token}`)).status).toBe(410);
      const escrita = await pedir(worker, `/api/v1/assessments/public/${corpo.access_token}/answers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: 1, answers: [{ question_key: 'q', question: 'P', answer: 'R' }] }),
      });
      expect(escrita.status).toBe(410);
    });

    it('corpo sem `answers` é 400, não 500', async () => {
      const { corpo } = await criar();
      const res = await pedir(worker, `/api/v1/assessments/public/${corpo.access_token}/answers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: 1 }),
      });
      expect(res.status).toBe(400);
    });

    it('o link público NÃO lista assessments nem alcança rota autenticada', async () => {
      // O prefixo `/public/` é isento do `somenteNess`. A isenção precisa valer
      // só para ele: se vazasse para o resto, o token viraria chave da área
      // comercial inteira.
      expect((await pedir(worker, '/api/v1/assessments')).status).toBe(401);
      const { corpo } = await criar();
      expect((await pedir(worker, `/api/v1/assessments/${corpo.id}`)).status).toBe(401);
    });
  });
});
