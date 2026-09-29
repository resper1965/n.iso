import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';

/**
 * CRUD dos módulos de projeto — capa, audits, vendors, training, ropa e
 * certification.
 *
 * Os seis têm a MESMA forma: listar e criar sob
 * `/api/v1/projects/:projectId/<módulo>`, atualizar e excluir em
 * `/api/v1/<módulo>/:id`. Eram também os menos cobertos do backend (13% a 50%
 * em 2026-09), e por isso um teste só, com tabela de descritores, em vez de
 * seis arquivos quase idênticos: onde o código é uniforme, o teste também
 * deveria ser, e um módulo novo entra acrescentando uma linha.
 *
 * A afirmação central não é "o CRUD funciona" — é que **o `project_id` gravado
 * vem do CAMINHO, nunca do corpo**. Todo POST aqui manda `project_id` do OUTRO
 * tenant no corpo de propósito; se algum handler passar a confiar no corpo, o
 * escopo do multi-tenant deixa de ser o path e vira entrada do usuário.
 */

const A = 'proj-a';
const B = 'proj-b';

type Modulo = {
  nome: string;
  /** Segmento de URL, que nem sempre é o nome do módulo (`certification`). */
  base: string;
  tabela: string;
  /** Corpo do POST — sem `project_id`, que o teste injeta mentindo o tenant. */
  criar: Record<string, unknown>;
  /** Corpo do PUT. Vários handlers ligam coluna a coluna: corpo completo. */
  atualizar: Record<string, unknown>;
  campo: string;
  valorEsperado: string;
  /** Onde o id do recurso criado aparece na resposta. */
  idDaResposta?: (corpo: any) => string;
};

const MODULOS: Modulo[] = [
  {
    nome: 'capa', base: 'capa', tabela: 'corrective_actions',
    criar: { title: 'CAPA nova', description: 'd', severity: 'High', assigned_to: 'Fulano', due_date: '2026-06-01' },
    atualizar: { title: 'CAPA revisada', description: 'd', severity: 'High', assigned_to: 'Fulano', due_date: '2026-06-01', status: 'Closed' },
    campo: 'title', valorEsperado: 'CAPA revisada',
  },
  {
    nome: 'audits', base: 'audits', tabela: 'audit_schedule',
    criar: { audit_type: 'Interna', title: 'Auditoria nova', scheduled_date: '2026-06-01', auditor_name: 'Ciclano', scope: 'SGSI' },
    atualizar: { audit_type: 'Interna', title: 'Auditoria revisada', scheduled_date: '2026-06-01', auditor_name: 'Ciclano', scope: 'SGSI', status: 'Completed' },
    campo: 'title', valorEsperado: 'Auditoria revisada',
  },
  {
    nome: 'vendors', base: 'vendors', tabela: 'vendors',
    criar: { name: 'Fornecedor novo', category: 'Cloud' },
    atualizar: { name: 'Fornecedor revisado', category: 'Cloud' },
    campo: 'name', valorEsperado: 'Fornecedor revisado',
  },
  {
    nome: 'training', base: 'training', tabela: 'training_records',
    criar: { employee_name: 'Beltrano', training_name: 'LGPD' },
    atualizar: { employee_name: 'Beltrano', training_name: 'LGPD avançado', status: 'Completed' },
    campo: 'training_name', valorEsperado: 'LGPD avançado',
  },
  {
    nome: 'ropa', base: 'ropa', tabela: 'ropa_records',
    criar: { processing_purpose: 'Folha de pagamento' },
    atualizar: { processing_purpose: 'Folha de pagamento revisada' },
    campo: 'processing_purpose', valorEsperado: 'Folha de pagamento revisada',
  },
  {
    nome: 'certification', base: 'certification', tabela: 'certification_tracking',
    criar: { standard: 'ISO 27001:2022', stage: 'Gap Assessment' },
    atualizar: { stage: 'Stage 1' },
    campo: 'stage', valorEsperado: 'Stage 1',
    // Esta rota é upsert por projeto e devolve o registro inteiro, não `id`.
    idDaResposta: (corpo) => corpo.certification.id,
  },
];

/** Atalho local: o `env` com stub de IA e a montagem vivem em `helpers/d1.ts`. */
const req = (caminho: string, init: RequestInit = {}) => pedir(worker, caminho, init);

describe('CRUD dos módulos de projeto', () => {
  let headers: Record<string, string>;
  let json: Record<string, string>;

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
    ]);
    headers = await sessionFor({ id: 'u-adm-a', email: 'adm@a.com', role: 'org_admin', client_project_id: A });
    json = { ...headers, 'Content-Type': 'application/json' };
  });

  for (const m of MODULOS) {
    describe(m.nome, () => {
      let id: string;

      it('cria com o project_id do CAMINHO, ignorando o do corpo', async () => {
        const res = await req(`/api/v1/projects/${A}/${m.base}`, {
          method: 'POST', headers: json,
          // O corpo mente o tenant. Se o handler acreditar nele, o registro
          // nasce no projeto do outro cliente.
          body: JSON.stringify({ ...m.criar, project_id: B }),
        });
        expect(res.status, await res.clone().text()).toBeLessThan(300);

        const corpo = await res.json() as any;
        id = m.idDaResposta ? m.idDaResposta(corpo) : corpo.id;
        expect(id, 'a resposta não trouxe o id do recurso criado').toBeTruthy();

        const linha = await env.DB.prepare(`SELECT project_id FROM ${m.tabela} WHERE id = ?`).bind(id).first<any>();
        expect(linha, 'o registro não foi gravado').not.toBeNull();
        expect(linha.project_id, `${m.nome}: o project_id veio do CORPO, não do caminho`).toBe(A);
      });

      it('lista o que foi criado, e só do próprio projeto', async () => {
        const res = await req(`/api/v1/projects/${A}/${m.base}`, { headers });
        expect(res.status, await res.clone().text()).toBe(200);

        // As rotas divergem na forma da resposta (array cru, `{results}`,
        // `{ok, <coisa>}`): o teste procura o id no JSON serializado, que é o
        // que importa aqui — o registro aparece para o dono.
        expect(await res.text()).toContain(id);
      });

      it('atualiza pela rota de topo', async () => {
        const res = await req(`/api/v1/${m.base}/${id}`, {
          method: 'PUT', headers: json, body: JSON.stringify(m.atualizar),
        });
        expect(res.status, await res.clone().text()).toBe(200);

        const linha = await env.DB.prepare(`SELECT ${m.campo} AS v FROM ${m.tabela} WHERE id = ?`).bind(id).first<any>();
        expect(linha.v).toBe(m.valorEsperado);
      });

      it('exclui pela rota de topo', async () => {
        const res = await req(`/api/v1/${m.base}/${id}`, { method: 'DELETE', headers });
        expect(res.status, await res.clone().text()).toBe(200);

        const linha = await env.DB.prepare(`SELECT id FROM ${m.tabela} WHERE id = ?`).bind(id).first();
        expect(linha, 'o DELETE respondeu 200 sem remover a linha').toBeNull();
      });
    });
  }

  /**
   * `training` tem duas rotas que fogem da forma comum dos seis, e são as que
   * carregam regra de negócio de verdade: o resumo calcula o percentual que
   * decide conformidade (A.6.3 — conscientização), e a importação em lote grava
   * N registros de uma vez.
   *
   * Este bloco usa um projeto PRÓPRIO (`proj-t`). A versão anterior somava sobre
   * o projeto A e só chegava a `total = 5` porque o DELETE do bloco de CRUD
   * acima havia rodado antes — uma falha lá produzia falhas em cascata aqui,
   * apontando para o lugar errado. Contagem não deve depender da ordem dos
   * `it()` de outro describe.
   */
  describe('training: resumo e importação em lote', () => {
    const T = 'proj-t';
    let headersT: Record<string, string>;
    let jsonT: Record<string, string>;

    beforeAll(async () => {
      const senha = await hashPassword('password123');
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
          .bind(T, 'Cliente T', 'ISO 27001', 'controller', 'Active'),
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
          .bind('u-adm-t', 'adm@t.com', senha, 'Admin do T', 'org_admin', T),
      ]);
      headersT = await sessionFor({ id: 'u-adm-t', email: 'adm@t.com', role: 'org_admin', client_project_id: T });
      jsonT = { ...headersT, 'Content-Type': 'application/json' };
    });
    it('importa em lote com o project_id do caminho', async () => {
      const res = await req(`/api/v1/projects/${T}/training/import-external`, {
        method: 'POST', headers: jsonT,
        body: JSON.stringify({
          records: [
            { employee_name: 'Um', training_name: 'LGPD', status: 'Completed' },
            { employee_name: 'Dois', training_name: 'LGPD', status: 'Completed' },
            { employee_name: 'Tres', training_name: 'LGPD', status: 'Pending' },
            { employee_name: 'Quatro', training_name: 'LGPD', status: 'Completed' },
            { employee_name: 'Cinco', training_name: 'LGPD', status: 'Completed' },
          ],
        }),
      });
      expect(res.status, await res.clone().text()).toBe(201);
      expect((await res.json() as any).imported).toBe(5);

      const { results } = await env.DB.prepare(
        'SELECT project_id FROM training_records WHERE project_id = ?'
      ).bind(T).all();
      expect(results).toHaveLength(5);
    });

    it('lote vazio é 400, não 201 com zero registros', async () => {
      const res = await req(`/api/v1/projects/${T}/training/import-external`, {
        method: 'POST', headers: jsonT, body: JSON.stringify({ records: [] }),
      });
      expect(res.status).toBe(400);
    });

    it('resume a cobertura e o veredito de conformidade', async () => {
      // 4 de 5 concluídos = 80%, que é exatamente o limiar. O caso de borda é
      // o que importa: `>= 80` e `> 80` dão vereditos opostos aqui.
      const res = await req(`/api/v1/projects/${T}/training/summary`, { headers: headersT });
      expect(res.status, await res.clone().text()).toBe(200);
      const resumo = await res.json() as any;
      expect(resumo.total).toBe(5);
      expect(resumo.completed).toBe(4);
      expect(resumo.pending).toBe(1);
      expect(resumo.coverage_percent).toBe(80);
      expect(resumo.compliance_status).toBe('Compliant');
    });

    it('projeto sem registro nenhum não divide por zero', async () => {
      // O projeto B nunca recebeu registro de treinamento neste arquivo.
      const res = await req(`/api/v1/projects/${B}/training/summary`, {
        headers: await sessionFor({ id: 'u-staff-t', email: 'staff@ness.io', role: 'platform_admin' }),
      });
      expect(res.status).toBe(200);
      const resumo = await res.json() as any;
      expect(resumo.total).toBe(0);
      expect(resumo.coverage_percent).toBe(0);
      expect(resumo.compliance_status).toBe('Non-Compliant');
    });
  });
});
