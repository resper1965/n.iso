import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { semearCatalogo, ligarControles, fonteDaNorma } from '../src/services/requisitos';
import { semearControles } from '../src/services/project-setup';
import { ISO_27001_2022, ISO_27001_2022_STANDARD } from '../src/data/iso27001-2022';
import { ISO_27701_2025_CONTROLLER, ISO_27701_2025_PROCESSOR, ISO_27701_2025_STANDARD } from '../src/data/iso27701-2025';

const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('semearCatalogo', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-seed', 'C', 'ISO 27001', 'controller', 'Active')`).run();
  });

  it('cria as 4 fontes e todos os requisitos ISO, com id legível e papel do 27701', async () => {
    const r = await semearCatalogo(env.DB);
    expect(r.fontes).toBe(4);
    expect(r.requisitos).toBe(ISO_27001_2022.length + ISO_27701_2025_CONTROLLER.length + ISO_27701_2025_PROCESSOR.length);
    expect(await n(`SELECT count(*) AS n FROM requisitos WHERE fonte_id = 'iso27001:2022'`)).toBe(ISO_27001_2022.length);
    expect(await env.DB.prepare(`SELECT referencia, titulo FROM requisitos WHERE id = 'iso27001:2022:A.5.1'`).first())
      .toEqual({ referencia: 'A.5.1', titulo: ISO_27001_2022[0].title });
    expect(await env.DB.prepare(`SELECT papel FROM requisitos WHERE id = 'iso27701:2025:A.1.2.6'`).first()).toEqual({ papel: 'controlador' });
    expect(await env.DB.prepare(`SELECT papel FROM requisitos WHERE id = 'iso27701:2025:A.2.2.2'`).first()).toEqual({ papel: 'operador' });
    expect(await env.DB.prepare(`SELECT papel FROM requisitos WHERE id = 'iso27001:2022:A.5.1'`).first()).toEqual({ papel: null });
  });

  it('rodar de novo não duplica e não sobrescreve título editado', async () => {
    await env.DB.prepare(`UPDATE requisitos SET titulo = 'Editado pelo administrador' WHERE id = 'iso27001:2022:A.5.1'`).run();
    const antes = await n('SELECT count(*) AS n FROM requisitos');
    const r = await semearCatalogo(env.DB);
    expect(r).toEqual({ fontes: 0, requisitos: 0 });
    expect(await n('SELECT count(*) AS n FROM requisitos')).toBe(antes);
    expect(await env.DB.prepare(`SELECT titulo FROM requisitos WHERE id = 'iso27001:2022:A.5.1'`).first()).toEqual({ titulo: 'Editado pelo administrador' });
  });

  it('semeia a fonte de uma lacuna do catálogo sem tocar nas demais', async () => {
    await env.DB.prepare(`DELETE FROM requisitos WHERE id = 'iso27001:2022:A.8.34'`).run();
    const r = await semearCatalogo(env.DB);
    expect(r.requisitos).toBe(1);
  });
});

describe('ligarControles', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a', 'A', 'ISO 27001', 'controller', 'Active'), ('p-b', 'B', 'ISO 27001', 'controller', 'Active')`),
    ]);
    await semearCatalogo(env.DB);
  });

  it('controle novo já nasce ligado ao requisito da sua norma', async () => {
    await semearControles(env.DB, 'p-a', ISO_27001_2022_STANDARD, ISO_27001_2022);
    await semearControles(env.DB, 'p-a', ISO_27701_2025_STANDARD, ISO_27701_2025_CONTROLLER);
    expect(await n(`SELECT count(*) AS n FROM compliance_controls WHERE project_id = 'p-a' AND requisito_id IS NULL`)).toBe(0);
    expect(await env.DB.prepare(`SELECT requisito_id FROM compliance_controls WHERE project_id = 'p-a' AND standard = ? AND title LIKE 'A.5.1 %'`)
      .bind(ISO_27001_2022_STANDARD).first()).toEqual({ requisito_id: 'iso27001:2022:A.5.1' });
  });

  it('o backfill liga o controle antigo sem confundir normas, e só o da norma certa', async () => {
    // Controles criados antes do catálogo, de dois projetos e de normas diferentes, com o mesmo código no título.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('old-1', 'p-b', ?, 'A.5.1 — Políticas'), ('old-2', 'p-b', ?, 'A.1.2.6 — DPIA'), ('old-3', 'p-b', 'ISO 27001:2013', 'A.5.1.1 — Antigo'), ('old-4', 'p-b', ?, 'A.99.9 — Fora do catálogo')`)
        .bind(ISO_27001_2022_STANDARD, ISO_27701_2025_STANDARD, ISO_27001_2022_STANDARD),
    ]);
    const ligados = await ligarControles(env.DB);
    expect(ligados).toBe(2);
    const rq = async (id: string) => (await env.DB.prepare('SELECT requisito_id AS r FROM compliance_controls WHERE id = ?').bind(id).first<{ r: string | null }>())!.r;
    expect(await rq('old-1')).toBe('iso27001:2022:A.5.1');
    expect(await rq('old-2')).toBe('iso27701:2025:A.1.2.6');
    expect(await rq('old-3')).toBeNull();
    expect(await rq('old-4')).toBeNull();
  });

  it('com projectId, só liga o projeto pedido, e repetir não muda nada', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('x-a', 'p-a', ?, 'A.5.2 — x'), ('x-b', 'p-b', ?, 'A.5.2 — x')`)
        .bind(ISO_27001_2022_STANDARD, ISO_27001_2022_STANDARD),
    ]);
    expect(await ligarControles(env.DB, 'p-b')).toBe(1);
    expect(await ligarControles(env.DB, 'p-b')).toBe(0);
    expect(await env.DB.prepare(`SELECT requisito_id FROM compliance_controls WHERE id = 'x-a'`).first()).toEqual({ requisito_id: null });
  });

  it('fonteDaNorma conhece as duas normas ISO e devolve null para as outras', () => {
    expect(fonteDaNorma(ISO_27001_2022_STANDARD)).toBe('iso27001:2022');
    expect(fonteDaNorma(ISO_27701_2025_STANDARD)).toBe('iso27701:2025');
    expect(fonteDaNorma('ISO 27001:2013')).toBeNull();
  });
});
