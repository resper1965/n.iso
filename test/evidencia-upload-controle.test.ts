import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * POST /projects/:projectId/evidence/upload gravava no R2 ANTES do INSERT. Com
 * `control_id` inexistente, o INSERT caía na FK, a resposta era 500 e o objeto
 * ficava órfão no R2. Agora o controle é conferido antes de qualquer escrita e,
 * se o INSERT falhar depois do put, o objeto é apagado.
 */
const P = 'up-proj';
const OUTRO = 'up-proj-outro';

let admin: Record<string, string>;

const objetosDe = async (projeto: string) =>
  (await env.STORAGE.list({ prefix: `evidence/${projeto}/` })).objects.map((o) => o.key);

function upload(controlId: string | null, sobre: Record<string, unknown> = {}) {
  const form = new FormData();
  form.append('file', new File(['conteudo da evidencia'], 'politica.pdf', { type: 'application/pdf' }));
  if (controlId !== null) form.append('control_id', controlId);
  return worker.fetch(
    new Request(`http://localhost/api/v1/projects/${P}/evidence/upload`, { method: 'POST', headers: admin, body: form }),
    { ...workerEnv(), ...sobre },
  );
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Outro', 'ISO 27001', 'controller', 'Active')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-meu', ?, 'ISO 27001', 'A.5.1')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-alheio', ?, 'ISO 27001', 'A.5.1')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-up', 'up@ness.io', 'x:y', 'Admin', 'platform_admin')`),
  ]);
  admin = await sessionFor({ id: 'u-up', email: 'up@ness.io', name: 'Admin', role: 'platform_admin' });
});

describe('upload de evidência com control_id', () => {
  it('controle inexistente: 400 e nada gravado no R2', async () => {
    const antes = await objetosDe(P);
    const res = await upload('ctrl-nao-existe');
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.error).toBe('Controle não encontrado neste projeto');
    expect(await objetosDe(P)).toEqual(antes);
  });

  it('controle de outro projeto: mesma resposta que inexistente, e nada gravado', async () => {
    const antes = await objetosDe(P);
    const res = await upload('ctrl-alheio');
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('Controle não encontrado neste projeto');
    expect(await objetosDe(P)).toEqual(antes);
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM evidence WHERE control_id = ?').bind('ctrl-alheio').first<{ n: number }>())!.n).toBe(0);
  });

  it('controle do projeto: 201 e o objeto existe no R2', async () => {
    const res = await upload('ctrl-meu');
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await objetosDe(P)).some((k) => k.includes(id))).toBe(true);
  });

  // Review Focus 5: o modal pede "Ex: A.5.1"; o servidor só aceitava o id da linha.
  it('aceita o código do controle e liga à linha deste projeto', async () => {
    const res = await upload('A.5.1');
    expect(res.status, await res.clone().text()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const ev = await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(id).first<{ control_id: string }>();
    expect(ev!.control_id).toBe('ctrl-meu');
  });

  it('control_ref é leniente: código ausente sobe sem controle; presente, liga', async () => {
    const enviar = (ref: string) => {
      const form = new FormData();
      form.append('file', new File(['certificado'], 'certificado.pdf', { type: 'application/pdf' }));
      form.append('control_ref', ref);
      return worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/evidence/upload`, { method: 'POST', headers: admin, body: form }), workerEnv());
    };
    const sem = await enviar('A.6.3');
    expect(sem.status).toBe(201);
    const idSem = ((await sem.json()) as { id: string }).id;
    expect((await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(idSem).first<{ control_id: string | null }>())!.control_id).toBeNull();

    const com = await enviar('A.5.1');
    const idCom = ((await com.json()) as { id: string }).id;
    expect((await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(idCom).first<{ control_id: string }>())!.control_id).toBe('ctrl-meu');
  });

  // Dublê pontual: só o INSERT em evidence falha; o resto vai ao D1 real.
  const dbInsertFalha = () => new Proxy(env.DB, {
    get(alvo, prop) {
      if (prop === 'prepare') {
        return (sql: string) => /INSERT INTO evidence/.test(sql)
          ? { bind: () => ({ run: async () => { throw new Error('D1_ERROR: falha simulada no INSERT'); } }) }
          : alvo.prepare(sql);
      }
      const v = (alvo as any)[prop];
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  }) as D1Database;

  it('INSERT falha depois do put: o objeto é apagado do R2 e a resposta não vaza', async () => {
    const antes = await objetosDe(P);
    const res = await upload('ctrl-meu', { DB: dbInsertFalha() });
    expect(res.status).toBe(500);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.detail).toBeUndefined();
    expect(JSON.stringify(corpo)).not.toMatch(/D1_ERROR|INSERT/);
    expect(await objetosDe(P)).toEqual(antes);
  });

  it('compensação que falha no R2 vai ao log em vez de sumir', async () => {
    const linhas: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { linhas.push(String(args[0])); });
    const storage = new Proxy(env.STORAGE, {
      get(alvo, prop) {
        if (prop === 'delete') return async () => { throw new Error('R2 indisponível na compensação'); };
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const res = await upload('ctrl-meu', { DB: dbInsertFalha(), STORAGE: storage });
    expect(res.status).toBe(500);
    const erros = linhas
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((ev) => ev?.msg === 'erro_handler')
      .map((ev) => String(ev.erro));
    expect(erros.some((e) => /R2 indisponível na compensação/.test(e)), erros.join(' | ')).toBe(true);
  });
});

afterEach(() => vi.restoreAllMocks());
