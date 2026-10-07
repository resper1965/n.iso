import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

/**
 * Assinatura eletrônica (aprovação de controle e de evidência) contra D1 REAL.
 *
 * A versão anterior mockava o D1 com um `first()` que devolvia o MESMO objeto
 * para qualquer query — o mesmo blob servia de usuário, de controle e de
 * evidência. Isso significa que o teste afirmava `ok:true` sem que nada fosse
 * gravado, e não distinguia "assinou" de "respondeu que assinou".
 *
 * Aqui cada asserção de sucesso confere a LINHA no banco. É a diferença entre
 * testar a resposta e testar a assinatura — que, num sistema de conformidade,
 * é o registro que um auditor vai pedir.
 *
 * `hashPassword` é importado do próprio `src/helpers`, não reimplementado: se o
 * algoritmo mudar (iterações, formato do salt), o teste acompanha em vez de
 * validar contra uma cópia que envelheceu.
 */
describe('Assinatura eletrônica (D1 real)', () => {
  let headers: Record<string, string>;
  let headersDirecao: Record<string, string>;

  // `beforeEach` (nao `beforeAll`) porque o pool novo isola storage so por
  // arquivo: cada teste de assinatura precisa de `ev-1` sem assinatura previa.
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('proj-1','Cliente Um','ISO 27001','controller','Active')`
      ),
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-1','ana@exemplo.com.br',?,'Ana Souza','consultor','proj-1')`
      ).bind(hash),
      env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, description, status) VALUES ('ctrl-a51','proj-1','ISO 27001:2022','Política','Requisito universal','Missing')`
      ),
      env.DB.prepare(
        `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES ('ev-1','proj-1','doc.md','k/doc.md','deadbeef','text/markdown',10,'cliente@exemplo.com.br','pending')`
      ),

      // Direção Executiva do projeto: pessoa DIFERENTE do Líder SGSI. É o que
      // torna a dupla aprovação uma dupla aprovação.
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-ceo','direcao@cliente.com',?,'Direcao Executiva','org_admin','proj-1')`
      ).bind(hash),

      // A matriz de governança deste projeto. A linha do consultor é `consultor`
      // (D5: é ela que lhe dá acesso ao projeto) com o cargo de DPO, que é o que
      // lhe dá a assinatura de Líder SGSI. Quem assina o quê sai daqui — o
      // papel de plataforma (`platform_admin`) não concede assinatura nenhuma,
      // porque o papel de alguém MUDA de projeto para projeto.
      env.DB.prepare(
        `INSERT INTO project_governance (id, project_id, name, email, role_category, job_title)
         VALUES ('gov-sgsi','proj-1','Ana Souza','ana@exemplo.com.br','consultor','DPO / Líder do SGSI')`
      ),
      env.DB.prepare(
        `INSERT INTO project_governance (id, project_id, name, email, role_category, job_title)
         VALUES ('gov-exec','proj-1','Direcao Executiva','direcao@cliente.com','exec','Diretora Executiva')`
      ),
    ]);
    headers = {
      // Consultor: entrega serviço ao cliente e assina o papel que a matriz do
      // projeto lhe der. NÃO é `platform_admin` — esse opera a plataforma e,
      // por isso mesmo, não assina conformidade nela.
      ...(await sessionFor({ id: 'usr-1', email: 'ana@exemplo.com.br', name: 'Ana Souza', role: 'consultor' })),
      'Content-Type': 'application/json',
    };
    headersDirecao = {
      ...(await sessionFor({ id: 'usr-ceo', email: 'direcao@cliente.com', name: 'Direcao Executiva', role: 'org_admin', client_project_id: 'proj-1' })),
      'Content-Type': 'application/json',
    };
  });

  async function post(path: string, body: unknown, h: Record<string, string> = headers) {
    // A assinatura de evidência leva o hash que a tela exibiu; ev-1 nasce com 'deadbeef'.
    if (/\/evidence\/[^/]+\/approve$/.test(path) && body && typeof body === 'object' && !('file_hash' in body)) body = { ...body, file_hash: 'deadbeef' };
    return worker.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) }),
      env as any
    );
  }

  describe('Aprovação de controle', () => {
    it('exige sessão', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { password: 'password123' }, {
        'Content-Type': 'application/json',
      });
      expect(res.status).toBe(401);
    });

    it('exige a senha no corpo', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso' });
      expect(res.status).toBe(400);
    });

    it('recusa senha incorreta e NÃO altera o controle', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'senhaerrada' });
      expect(res.status).toBe(401);
      expect((await res.json() as any).error).toContain('Senha incorreta');

      const ctrl = await env.DB.prepare("SELECT status FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.status).toBe('Missing');
    });

    it('o Líder SGSI designado assina como ciso: grava quem, quando, IP e UA, e não muda o status', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123', project_id: 'proj-1' });
      const data = await res.json() as any;
      expect(res.status, JSON.stringify(data)).toBe(200);
      expect(data).toMatchObject({ ok: true, role: 'ciso', approved_by: 'Ana Souza' });

      const ctrl = await env.DB.prepare(
        "SELECT status, ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua, ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'"
      ).first<any>();
      expect(ctrl.ciso_approved_by).toBe('Ana Souza');
      expect(ctrl.ciso_approved_at).toBe(data.approved_at);
      expect(ctrl.ciso_approved_ip).toBeTruthy();
      expect(ctrl.ciso_approved_ua).toBeTruthy();
      expect(ctrl.ceo_approved_by).toBeNull();
      // O status é o da SoA (Missing/Partial/Compliant/N/A): assinar a política não o reescreve.
      expect(ctrl.status).toBe('Missing');

      const log = await env.DB.prepare(
        "SELECT actor, details, project_id FROM audit_logs WHERE action = 'control.approved' ORDER BY rowid DESC LIMIT 1"
      ).first<any>();
      expect(log.actor).toBe('ana@exemplo.com.br');
      expect(log.details).toContain('ctrl-a51');
      expect(log.project_id).toBe('proj-1');
    });

    it('as duas assinaturas vêm de duas pessoas designadas', async () => {
      expect((await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' })).status).toBe(200);
      const r = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ceo', password: 'password123' }, headersDirecao);
      expect(r.status, await r.clone().text()).toBe(200);
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ceo_approved_by, ceo_approved_at FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ciso_approved_by).toBe('Ana Souza');
      expect(ctrl.ceo_approved_by).toBe('Direcao Executiva');
      expect(ctrl.ceo_approved_at).toBeTruthy();
    });

    it('sem role no corpo, o papel sai do cargo na matriz', async () => {
      const r = await post('/api/v1/controls/ctrl-a51/approve', { password: 'password123' }, headersDirecao);
      expect(r.status, await r.clone().text()).toBe(200);
      expect((await r.json() as any).role).toBe('ceo');
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ceo_approved_by).toBe('Direcao Executiva');
      expect(ctrl.ciso_approved_by).toBeNull();
    });

    it('o Líder SGSI não assina como Direção', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ceo', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Segregação de Funções');
      const ctrl = await env.DB.prepare("SELECT ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ceo_approved_by).toBeNull();
    });

    it('duas linhas na matriz (DPO e Diretora) não dão os dois papéis à mesma pessoa', async () => {
      await env.DB.prepare(
        `INSERT INTO project_governance (id, project_id, name, email, role_category, job_title)
         VALUES ('gov-sgsi-2','proj-1','Ana Souza','ANA@exemplo.com.br ','exec','Diretora de Operações')`
      ).run();
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ceo', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Segregação de Funções');
    });

    it('a Direção não assina como Líder SGSI', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' }, headersDirecao);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Líder SGSI');
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ciso_approved_by).toBeNull();
    });

    it('quem alcança o projeto mas não está na matriz não assina', async () => {
      await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-fora','fora@cliente.com',?,'Fora','org_admin','proj-1')`)
        .bind(await hashPassword('password123')).run();
      const fora = { ...(await sessionFor({ id: 'usr-fora', email: 'fora@cliente.com', role: 'org_admin', client_project_id: 'proj-1' })), 'Content-Type': 'application/json' };
      const r = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' }, fora);
      expect(r.status).toBe(403);
      expect(await r.text()).toContain('não está designado na matriz');
      const ctrl = await env.DB.prepare("SELECT ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.ciso_approved_by).toBeNull();
      expect(ctrl.ceo_approved_by).toBeNull();
    });

    it('conta de administração da plataforma não assina política, mesmo designada', async () => {
      const admin = { ...(await sessionFor({ id: 'usr-1', email: 'ana@exemplo.com.br', name: 'Ana Souza', role: 'platform_admin' })), 'Content-Type': 'application/json' };
      const r = await post('/api/v1/controls/ctrl-a51/approve', { role: 'ciso', password: 'password123' }, admin);
      expect(r.status).toBe(403);
      expect(await r.text()).toContain('administração da plataforma');
    });
  });

  describe('Aprovação de evidência', () => {
    it('exige sessão', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { password: 'password123' }, {
        'Content-Type': 'application/json',
      });
      expect(res.status).toBe(401);
    });

    it('404 para evidência inexistente', async () => {
      // D5: para o consultor, recurso inexistente é 403 (não há projeto em que ele esteja designado);
      // o 404 do handler é o que o platform_admin vê.
      const admin = { ...(await sessionFor({ id: 'usr-pa', email: 'pa@ness.lat', role: 'platform_admin' })), 'Content-Type': 'application/json' };
      const res = await post('/api/v1/evidence/nao-existe/approve', { password: 'password123' }, admin);
      expect(res.status).toBe(404);
      expect((await post('/api/v1/evidence/nao-existe/approve', { password: 'password123' })).status).toBe(403);
    });

    it('recusa senha incorreta e NÃO grava assinatura', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'senhaerrada' });
      expect(res.status).toBe(401);

      const ev = await env.DB.prepare("SELECT ciso_approved_by FROM evidence WHERE id='ev-1'").first<any>();
      expect(ev.ciso_approved_by).toBeNull();
    });

    it('assina como CISO e grava assinante, data, IP e user-agent', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      const data = await res.json() as any;
      expect(res.status, JSON.stringify(data)).toBe(200);
      expect(data.role).toBe('ciso');

      // Uma assinatura sem quem/quando/de onde não serve de evidência para auditor.
      const ev = await env.DB.prepare(
        "SELECT ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua FROM evidence WHERE id='ev-1'"
      ).first<any>();
      expect(ev.ciso_approved_by).toBe('Ana Souza');
      expect(ev.ciso_approved_at).toBeTruthy();
      expect(ev.ciso_approved_ip).toBeTruthy();
      expect(ev.ciso_approved_ua).toBeTruthy();
    });

    it('as duas assinaturas coexistem — mas vêm de DUAS pessoas designadas', async () => {
      // As duas acontecem no mesmo teste porque o storage é isolado por `it`.
      // O que a versão anterior deste teste afirmava era que a MESMA pessoa
      // assinava os dois papéis — o oposto de segregação de funções.
      expect((await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' })).status).toBe(200);
      expect((await post('/api/v1/evidence/ev-1/approve', { role: 'ceo', password: 'password123' }, headersDirecao)).status).toBe(200);

      const ev = await env.DB.prepare(
        "SELECT ciso_approved_by, ceo_approved_by FROM evidence WHERE id='ev-1'"
      ).first<any>();
      expect(ev.ciso_approved_by).toBe('Ana Souza');
      expect(ev.ceo_approved_by).toBe('Direcao Executiva');
      expect(ev.ciso_approved_by).not.toBe(ev.ceo_approved_by);
    });

    it('o Líder SGSI não assina como Direção', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ceo', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Segregação de Funções');

      const ev = await env.DB.prepare("SELECT ceo_approved_by FROM evidence WHERE id='ev-1'").first<any>();
      expect(ev.ceo_approved_by).toBeNull();
    });

    it('conta de administração da plataforma não assina, mesmo designada na matriz', async () => {
      // O caso que a separação existe para impedir: a MESMA pessoa, com a MESMA
      // designação de DPO, mas entrando pela conta que administra o sistema.
      // Quem opera a plataforma não carimba conformidade nela.
      const admin = {
        ...(await sessionFor({ id: 'usr-1', email: 'ana@exemplo.com.br', name: 'Ana Souza', role: 'platform_admin' })),
        'Content-Type': 'application/json',
      };
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' }, admin);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('administração da plataforma');

      const ev = await env.DB.prepare("SELECT ciso_approved_by FROM evidence WHERE id='ev-1'").first<any>();
      expect(ev.ciso_approved_by).toBeNull();
    });

    it('quem não está na matriz deste projeto não assina, qualquer que seja o papel de plataforma', async () => {
      await env.DB.prepare("DELETE FROM project_governance WHERE email = 'ana@exemplo.com.br'").run();

      // D5: o consultor fora da matriz já não alcança o projeto.
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      expect(res.status).toBe(403);

      // Quem alcança o projeto (o administrador do cliente) mas não está na matriz também não assina.
      await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-fora','fora@cliente.com',?,'Fora','org_admin','proj-1')`)
        .bind(await hashPassword('password123')).run();
      const fora = { ...(await sessionFor({ id: 'usr-fora', email: 'fora@cliente.com', role: 'org_admin', client_project_id: 'proj-1' })), 'Content-Type': 'application/json' };
      const r2 = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' }, fora);
      expect(r2.status).toBe(403);
      expect(await r2.text()).toContain('não está designado na matriz');

      const ev = await env.DB.prepare("SELECT ciso_approved_by FROM evidence WHERE id='ev-1'").first<any>();
      expect(ev.ciso_approved_by).toBeNull();
    });
  });

  describe('a assinatura do Líder SGSI é a revisão', () => {
    const statusDe = async (id: string) =>
      (await env.DB.prepare('SELECT evaluation_status FROM evidence WHERE id = ?').bind(id).first<{ evaluation_status: string }>())!.evaluation_status;

    it('pendente assinada pelo Líder SGSI vira conforme', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(await statusDe('ev-1')).toBe('conforming');
    });

    it('a assinatura da Direção sozinha não conclui a revisão', async () => {
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ceo', password: 'password123' }, headersDirecao);
      expect(res.status, await res.clone().text()).toBe(200);
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it('não passa por cima de evidência reprovada', async () => {
      await env.DB.prepare("UPDATE evidence SET evaluation_status = 'non_conforming' WHERE id = 'ev-1'").run();
      expect((await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' })).status).toBe(200);
      expect(await statusDe('ev-1')).toBe('non_conforming');
    });

    // Review Focus 3
    it('editar o conteúdo devolve a pendente e apaga as assinaturas', async () => {
      await env.DB.prepare("UPDATE evidence SET evaluation_score = 90, evaluation_notes = 'ok' WHERE id = 'ev-1'").run();
      await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      await post('/api/v1/evidence/ev-1/approve', { role: 'ceo', password: 'password123' }, headersDirecao);
      const res = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1/content', {
        method: 'PUT', headers, body: JSON.stringify({ content: '# Texto alterado' }),
      }), env as any);
      expect(res.status, await res.clone().text()).toBe(200);
      const ev = await env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind('ev-1').first<any>();
      expect(ev.evaluation_status).toBe('pending');
      expect(ev.evaluation_score).toBeNull();
      expect(ev.evaluation_notes).toBeNull();
      for (const col of ['by', 'at', 'ip', 'ua']) {
        expect(ev[`ciso_approved_${col}`]).toBeNull();
        expect(ev[`ceo_approved_${col}`]).toBeNull();
      }
    });

    // Review Focus 4
    const avaliar = (saida: string) => worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1/evaluate', {
      method: 'POST', headers, body: JSON.stringify({ text: 'conteúdo' }),
    }), { ...env, AI: { run: async () => ({ response: saida }) } } as any);

    it('avaliação por IA lê o veredito ("NÃO CONFORME" não vira conforme)', async () => {
      expect((await avaliar('# Veredito: NÃO CONFORME\n- **Score de Confiança**: 30')).status).toBe(200);
      expect(await statusDe('ev-1')).toBe('non_conforming');
      await avaliar('# Veredito: **PARCIAL**');
      expect(await statusDe('ev-1')).toBe('partial');
      await avaliar('Sem veredito nenhum');
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it('a IA nunca grava conforme: CONFORME da IA espera a assinatura', async () => {
      await avaliar('# Veredito: CONFORME');
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it.each([
      ['Não conforme', 'non_conforming'], ['nao conforme', 'non_conforming'],
      ['PARCIALMENTE CONFORME', 'partial'], ['Parcial', 'partial'],
      ['[CONFORME | PARCIAL | NÃO CONFORME]', 'pending'], ['PARCIAL ou NÃO CONFORME', 'pending'],
    ])('veredito "%s" vira %s', async (linha, esperado) => {
      await avaliar(`# Veredito: ${linha}`);
      expect(await statusDe('ev-1')).toBe(esperado);
    });

    it('a IA não mexe no status de evidência já assinada pelo Líder SGSI, só em nota e texto', async () => {
      await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      await avaliar('# Veredito: NÃO CONFORME\n- **Score de Confiança**: 30');
      const ev = await env.DB.prepare('SELECT evaluation_status, evaluation_notes FROM evidence WHERE id = ?').bind('ev-1').first<any>();
      expect(ev.evaluation_status).toBe('conforming');
      expect(ev.evaluation_notes).toContain('NÃO CONFORME');
    });

    it('evaluation_status NULL também vira conforme na assinatura', async () => {
      await env.DB.prepare("UPDATE evidence SET evaluation_status = NULL WHERE id = 'ev-1'").run();
      expect((await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' })).status).toBe(200);
      expect(await statusDe('ev-1')).toBe('conforming');
    });

    it('assinar com o hash antigo depois de editar o conteúdo dá 409 e segue pendente', async () => {
      const put = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1/content', {
        method: 'PUT', headers, body: JSON.stringify({ content: '# Outro texto' }),
      }), env as any);
      expect(put.status, await put.clone().text()).toBe(200);
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123', file_hash: 'deadbeef' });
      expect(res.status).toBe(409);
      expect(await res.text()).toContain('mudou desde que você abriu');
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it('sem file_hash a assinatura é recusada (400)', async () => {
      const res = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1/approve', {
        method: 'POST', headers, body: JSON.stringify({ role: 'ciso', password: 'password123' }),
      }), env as any);
      expect(res.status).toBe(400);
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it('evidência criada pelo agente do Líder SGSI também não é revisada por ele', async () => {
      await env.DB.prepare("UPDATE evidence SET uploaded_by = 'agente de ana@exemplo.com.br (Cliente Um)' WHERE id = 'ev-1'").run();
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Quem enviou a evidência não pode revisá-la');
      expect(await statusDe('ev-1')).toBe('pending');
    });

    it('quem enviou a evidência não a revisa como Líder SGSI', async () => {
      await env.DB.prepare("UPDATE evidence SET uploaded_by = 'Ana@Exemplo.com.br' WHERE id = 'ev-1'").run();
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Quem enviou a evidência não pode revisá-la');
      expect(await statusDe('ev-1')).toBe('pending');
    });
  });
});
