import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { PHASE_CHECKLISTS } from '../src/constants';
import { ISO_27001_2022 } from '../src/data/iso27001-2022';
import { itemDoChecklist, refDoControle, controleDoItem } from '../src/services/checklist-evidencia';

/**
 * A tela mostra PHASE_CHECKLISTS (src/constants.ts); a geração de documento lia outra lista
 * (src/checklists.ts). Seis itens da tela davam 404 e, dos ids comuns, só 10 tinham o mesmo texto:
 * gerar "Definir Canais de Comunicação Interna" (p0_5) produzia "Carta de mandato assinada".
 */
const P = 'p-lista';
let admin: Record<string, string>;
const todos = Object.entries(PHASE_CHECKLISTS).flatMap(([fase, itens]) => itens.map((i) => ({ ...i, fase: Number(fase) })));

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'C', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctl-a510', ?, 'ISO 27001:2022', 'A.5.10 — Uso aceitável')`).bind(P),
  ]);
  admin = { ...(await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'admin', iat: Date.now() })), 'Content-Type': 'application/json' };
});

describe('lista única de checklist', () => {
  it('todo item da tela é achado, na fase em que a tela o mostra', () => {
    for (const i of todos) {
      const achado = itemDoChecklist(i.id);
      expect(achado, i.id).not.toBeNull();
      expect(achado!.phaseNumber, i.id).toBe(i.fase);
      expect(achado!.text, i.id).toBe(i.text);
    }
    expect(itemDoChecklist('nao-existe')).toBeNull();
  });

  it('toda referência de controle no texto existe no catálogo 27001:2022', () => {
    const codigos = new Set(ISO_27001_2022.map((c) => c.code));
    const refs = todos.map((i) => refDoControle(i.text)).filter((r): r is string => !!r);
    expect(refs.length).toBeGreaterThan(20);
    for (const r of refs) expect(codigos.has(r), r).toBe(true);
  });

  it('referência a cláusula não vira controle', () => {
    expect(refDoControle('Documentar Escopo do SGSI e SGPI (Cl 4.3)')).toBeNull();
    expect(refDoControle('Redigir Política Geral de SI (A.5.1)')).toBe('A.5.1');
    expect(refDoControle('Executar Treinamento Geral de SI e LGPD')).toBeNull();
  });

  it('controleDoItem resolve no projeto e devolve null quando o projeto não tem o controle', async () => {
    expect(await controleDoItem(env.DB, P, itemDoChecklist('p15_5')!)).toBe('ctl-a510');
    expect(await controleDoItem(env.DB, P, itemDoChecklist('p15_1')!)).toBeNull();
    expect(await controleDoItem(env.DB, P, itemDoChecklist('p3_1')!)).toBeNull();
  });

  it('a geração aceita TODO item que a tela mostra', async () => {
    for (const i of todos) {
      const res = await worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/generate-document`, {
        method: 'POST', headers: admin, body: JSON.stringify({ itemId: i.id, fields: {} }),
      }), workerEnv());
      expect(res.status, `${i.id}: ${await res.clone().text()}`).toBe(200);
    }
  });
});
