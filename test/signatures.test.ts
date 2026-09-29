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
        `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-1','resper@bekaa.eu',?,'Ricardo Esper','consultor','proj-1')`
      ).bind(hash),
      env.DB.prepare(
        `INSERT INTO compliance_controls (id, project_id, standard, title, description, status) VALUES ('ctrl-a51','proj-1','ISO 27001:2022','Política','Requisito universal','Missing')`
      ),
      env.DB.prepare(
        `INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES ('ev-1','proj-1','doc.md','k/doc.md','deadbeef','text/markdown',10,'resper@bekaa.eu','pending')`
      ),

      // Direção Executiva do projeto: pessoa DIFERENTE do Líder SGSI. É o que
      // torna a dupla aprovação uma dupla aprovação.
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('usr-ceo','direcao@cliente.com',?,'Direcao Executiva','org_admin','proj-1')`
      ).bind(hash),

      // A matriz de governança deste projeto. Quem assina o quê sai daqui — o
      // papel de plataforma (`platform_admin`) não concede assinatura nenhuma,
      // porque o papel de alguém MUDA de projeto para projeto.
      env.DB.prepare(
        `INSERT INTO project_governance (id, project_id, name, email, role_category, job_title)
         VALUES ('gov-sgsi','proj-1','Ricardo Esper','resper@bekaa.eu','tech','DPO / Líder do SGSI')`
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
      ...(await sessionFor({ id: 'usr-1', email: 'resper@bekaa.eu', name: 'Ricardo Esper', role: 'consultor' })),
      'Content-Type': 'application/json',
    };
    headersDirecao = {
      ...(await sessionFor({ id: 'usr-ceo', email: 'direcao@cliente.com', name: 'Direcao Executiva', role: 'org_admin', client_project_id: 'proj-1' })),
      'Content-Type': 'application/json',
    };
  });

  async function post(path: string, body: unknown, h: Record<string, string> = headers) {
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

    it('aprova com a senha correta e grava o status no banco', async () => {
      const res = await post('/api/v1/controls/ctrl-a51/approve', {
        role: 'ciso',
        password: 'password123',
        project_id: 'proj-1',
      });
      const data = await res.json() as any;
      expect(res.status, JSON.stringify(data)).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.approved_by).toBe('Ricardo Esper');

      const ctrl = await env.DB.prepare("SELECT status FROM compliance_controls WHERE id='ctrl-a51'").first<any>();
      expect(ctrl.status).toBe('Approved');

      // A trilha é conferida aqui dentro, não num `it` seguinte: o pool isola o
      // storage por teste, então escrita feita num teste não existe no próximo.
      // Um teste que dependesse disso passaria por engano com a base vazia.
      const log = await env.DB.prepare(
        "SELECT actor, details FROM audit_logs WHERE action = 'control.approved' ORDER BY rowid DESC LIMIT 1"
      ).first<any>();
      expect(log).not.toBeNull();
      expect(log.actor).toBe('resper@bekaa.eu');
      expect(log.details).toContain('ctrl-a51');
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
      const res = await post('/api/v1/evidence/nao-existe/approve', { password: 'password123' });
      expect(res.status).toBe(404);
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
      expect(ev.ciso_approved_by).toBe('Ricardo Esper');
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
      expect(ev.ciso_approved_by).toBe('Ricardo Esper');
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
        ...(await sessionFor({ id: 'usr-1', email: 'resper@bekaa.eu', name: 'Ricardo Esper', role: 'platform_admin' })),
        'Content-Type': 'application/json',
      };
      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' }, admin);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('administração da plataforma');

      const ev = await env.DB.prepare("SELECT ciso_approved_by FROM evidence WHERE id='ev-1'").first<any>();
      expect(ev.ciso_approved_by).toBeNull();
    });

    it('quem não está na matriz deste projeto não assina, qualquer que seja o papel de plataforma', async () => {
      await env.DB.prepare("DELETE FROM project_governance WHERE email = 'resper@bekaa.eu'").run();

      const res = await post('/api/v1/evidence/ev-1/approve', { role: 'ciso', password: 'password123' });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('não designado na matriz');

      const ev = await env.DB.prepare("SELECT ciso_approved_by FROM evidence WHERE id='ev-1'").first<any>();
      expect(ev.ciso_approved_by).toBeNull();
    });
  });
});
