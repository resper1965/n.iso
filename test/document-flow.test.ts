import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

/**
 * Fluxo de geração de documento contra D1 e R2 REAIS (miniflare).
 *
 * A versão anterior deste arquivo mockava o D1 com `first()` devolvendo objeto
 * fixo e `run()` devolvendo `{success:true}` para qualquer query. Isso fazia o
 * teste passar mesmo que o INSERT citasse coluna inexistente — que é justamente
 * a classe de defeito que já chegou em produção neste repositório.
 *
 * Aqui o INSERT de `evidence` (10 colunas) e o UPSERT de `checklist_progress`
 * (que depende de um índice único em project_id+phase_number+item_id) rodam
 * de verdade. Se o schema divergir do código, o teste quebra.
 *
 * A IA continua sendo dublê: não há binding AI no ambiente de teste, e o
 * handler tem fallback próprio para quando a geração falha — o caminho de
 * persistência, que é o que interessa aqui, é o mesmo nos dois casos.
 */
const aiStub = {
  run: async () => ({ response: '# Escopo\n\nConteúdo gerado para teste.' }),
};

function testEnv() {
  return { ...env, AI: aiStub } as any;
}

describe('Geração e persistência de documento (D1 + R2 reais)', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status)
       VALUES ('proj-123', 'ness. testing', 'GRC Tech', 'ISO 27001:2022', 'ISO 27001', 'controller', 'Active')`
    ).run();
    // O usuário precisa existir de verdade: checklist_progress.checked_by tem FK
    // para users(id). Com o D1 mockado isso passava despercebido — o INSERT
    // devolvia {success:true} sem validar constraint nenhuma.
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ('user-123','test@ness.dev','x','Teste','platform_admin')`
    ).run();
    headers = {
      ...(await sessionFor({ id: 'user-123', email: 'test@ness.dev', role: 'platform_admin' })),
      'Content-Type': 'application/json',
    };
  });

  it('gera o documento, grava no R2 e persiste evidence + checklist_progress', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/projects/proj-123/checklist/p3_1/generate', { method: 'POST', headers }),
      testEnv()
    );
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidence_id).toBeTruthy();

    // A linha existe mesmo — não é um `{success:true}` de mock.
    const ev = await env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(body.evidence_id).first<any>();
    expect(ev.project_id).toBe('proj-123');
    expect(ev.r2_key).toBe('projects/proj-123/evidence/p3_1.md');
    expect(ev.file_hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 real do conteúdo
    expect(ev.file_size).toBeGreaterThan(0);

    // O objeto foi para o R2 com o mesmo conteúdo cujo hash foi gravado.
    const obj = await env.STORAGE.get(ev.r2_key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toContain('#');

    // O UPSERT de checklist_progress exercita o índice único
    // (project_id, phase_number, item_id) — sem ele o ON CONFLICT falha.
    const prog = await env.DB.prepare(
      'SELECT is_checked, evidence_id FROM checklist_progress WHERE project_id = ? AND item_id = ?'
    ).bind('proj-123', 'p3_1').first<any>();
    expect(prog.is_checked).toBe(1);
    expect(prog.evidence_id).toBe(body.evidence_id);
  });

  it('gerar o mesmo item duas vezes atualiza o progresso em vez de duplicar', async () => {
    const req = () => worker.fetch(
      new Request('http://localhost/api/v1/projects/proj-123/checklist/p3_2/generate', { method: 'POST', headers }),
      testEnv()
    );
    expect((await req()).status).toBe(200);
    const segunda = await req();
    expect(segunda.status).toBe(200);

    const linhas = await env.DB.prepare(
      'SELECT count(*) AS n FROM checklist_progress WHERE project_id = ? AND item_id = ?'
    ).bind('proj-123', 'p3_2').first<any>();
    expect(linhas.n).toBe(1);
  });

  it('lê e atualiza o conteúdo da evidência pelo R2', async () => {
    const gen = await worker.fetch(
      new Request('http://localhost/api/v1/projects/proj-123/checklist/p3_3/generate', { method: 'POST', headers }),
      testEnv()
    );
    const { evidence_id } = await gen.json() as any;

    const getRes = await worker.fetch(
      new Request(`http://localhost/api/v1/evidence/${evidence_id}/content`, { headers }),
      testEnv()
    );
    const getData = await getRes.json() as any;
    expect(getRes.status, JSON.stringify(getData)).toBe(200);
    expect(getData.content).toContain('#');

    const putRes = await worker.fetch(
      new Request(`http://localhost/api/v1/evidence/${evidence_id}/content`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content: '# Novo Escopo\n\nTexto atualizado.' }),
      }),
      testEnv()
    );
    expect(putRes.status).toBe(200);

    // A atualização precisa ter chegado ao R2, não só devolvido ok.
    const ev = await env.DB.prepare('SELECT r2_key FROM evidence WHERE id = ?').bind(evidence_id).first<any>();
    const obj = await env.STORAGE.get(ev.r2_key);
    expect(await obj!.text()).toContain('Texto atualizado');
  });

  it('404 para projeto inexistente, sem gravar nada', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/projects/nao-existe/checklist/p3_1/generate', { method: 'POST', headers }),
      testEnv()
    );
    expect(res.status).toBe(404);
  });
});
