import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';
import { PolicyGeneratorService } from '../src/services/policy-generator';

// Todo escritor humano de política grava, além do que já gravava, a versão em `documentos`. O controle
// segue sendo a fonte (a ciência e o portal ainda leem dali): estes testes provam o ESPELHO, e o
// comportamento antigo de cada rota fica a cargo de policies.test.ts, pedido-politica.test.ts e companhia.
const PROJ = 'proj-esc';
const aiStub = { run: async () => ({ response: '# Política gerada\n\nTexto do agente de IA.' }) };

const ambiente = (extra: Record<string, unknown> = {}) => ({ ...env, AI: aiStub, ...extra }) as any;
const req = (path: string, init: RequestInit, headers: Record<string, string>, e = ambiente()) =>
  worker.fetch(new Request(`http://localhost${path}`, { ...init, headers: { ...headers, 'Content-Type': 'application/json' } }), e);

let h: Record<string, string>;

type V = { numero: number; estado: string; texto: string; origem: string };
const versoesDoControle = async (controleId: string) => {
  const d = await env.DB.prepare(`SELECT id, status FROM documentos WHERE origem_control_id = ?`).bind(controleId).first<{ id: string; status: string }>();
  if (!d) return null;
  const v = await env.DB.prepare(`SELECT numero, estado, texto, origem FROM documento_versoes WHERE documento_id = ? ORDER BY numero`).bind(d.id).all<V>();
  return { documento: d, versoes: v.results };
};
const descricao = async (id: string) => (await env.DB.prepare(`SELECT description FROM compliance_controls WHERE id = ?`).bind(id).first<{ description: string }>())?.description;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente Exemplo', 'ISO 27001', 'controller', 'Active')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-esc', 'consultor-esc@ness.dev', 'x', 'Consultor', 'platform_admin')`),
    // com histórico de política
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('esc-hist', ?, 'ISO 27001:2022', 'A.5.1 Políticas', 'Histórico 1')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('esc-pv1', ?, 'esc-hist', 1, 'Histórico 1', 'autor@exemplo.com.br')`).bind(PROJ),
    // só texto de catálogo
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('esc-cat', ?, 'ISO 27001:2022', 'A.5.2 Papéis', 'Descrição do catálogo')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('esc-tpl', ?, 'ISO 27001:2022', 'A.5.3 Segregação', 'Catálogo')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('esc-falha', ?, 'ISO 27001:2022', 'A.5.4 Falha', 'Catálogo')`).bind(PROJ),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('esc-gen', ?, 'ISO 27001:2022', 'A.5.5 Gerada', 'Catálogo')`).bind(PROJ),
  ]);
  h = await sessionFor({ id: 'u-esc', email: 'consultor-esc@ness.dev', role: 'platform_admin' });
});

describe('edição manual', () => {
  it('traz o histórico antigo para o documento e deixa o texto novo como vigente', async () => {
    const r = await req(`/api/v1/projects/${PROJ}/controls/esc-hist/policy`, { method: 'POST', body: JSON.stringify({ text: 'Política nova' }) }, h);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, version: 2 });
    expect(await descricao('esc-hist')).toBe('Política nova');
    const d = await versoesDoControle('esc-hist');
    expect(d?.documento.status).toBe('vigente');
    expect(d?.versoes.map((v) => [v.numero, v.estado, v.texto])).toEqual([[1, 'substituida', 'Histórico 1'], [2, 'vigente', 'Política nova']]);
  });

  it('o mesmo texto de novo não cria versão repetida no documento', async () => {
    await req(`/api/v1/projects/${PROJ}/controls/esc-hist/policy`, { method: 'POST', body: JSON.stringify({ text: 'Política nova' }) }, h);
    expect((await versoesDoControle('esc-hist'))?.versoes).toHaveLength(2);
  });

  it('controle só com texto de catálogo: a descrição de catálogo NÃO vira versão; a primeira é o texto novo', async () => {
    const r = await req(`/api/v1/projects/${PROJ}/controls/esc-cat/policy`, { method: 'POST', body: JSON.stringify({ text: 'Primeira política' }) }, h);
    expect(r.status).toBe(200);
    const d = await versoesDoControle('esc-cat');
    expect(d?.versoes.map((v) => [v.numero, v.estado, v.texto, v.origem])).toEqual([[1, 'vigente', 'Primeira política', 'humano']]);
  });
});

describe('restaurar versão', () => {
  it('restaurar uma versão antiga vira a vigente do documento', async () => {
    const r = await req(`/api/v1/projects/${PROJ}/controls/esc-hist/restore-version`, { method: 'POST', body: JSON.stringify({ version_id: 'esc-pv1' }) }, h);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await descricao('esc-hist')).toBe('Histórico 1');
    const d = await versoesDoControle('esc-hist');
    expect(d?.versoes.at(-1)).toMatchObject({ estado: 'vigente', texto: 'Histórico 1' });
    expect(d?.versoes.filter((v) => v.estado === 'vigente')).toHaveLength(1);
  });
});

describe('geração', () => {
  it('generate-policy deixa o texto gerado como versão vigente de origem gerador', async () => {
    const r = await req(`/api/v1/projects/${PROJ}/generate-policy`, { method: 'POST', body: JSON.stringify({ control_id: 'esc-gen' }) }, h);
    expect(r.status, await r.clone().text()).toBe(200);
    const d = await versoesDoControle('esc-gen');
    expect(d?.versoes).toHaveLength(1);
    expect(d?.versoes[0]).toMatchObject({ estado: 'vigente', origem: 'gerador' });
    expect(d?.versoes[0].texto).toContain('Política gerada');
  });

  it('generate-from-template idem', async () => {
    const nomes = await new PolicyGeneratorService('.', env.ASSETS).listAvailableTemplates('v2022');
    expect(nomes.length).toBeGreaterThan(0);
    const r = await req(`/api/v1/projects/${PROJ}/policies/generate-from-template`, { method: 'POST', body: JSON.stringify({ template_name: nomes[0], control_id: 'esc-tpl' }) }, h);
    expect(r.status, await r.clone().text()).toBe(200);
    const d = await versoesDoControle('esc-tpl');
    expect(d?.versoes).toHaveLength(1);
    expect(d?.versoes[0]).toMatchObject({ estado: 'vigente', origem: 'gerador' });
    expect(d?.versoes[0].texto).toBe(await descricao('esc-tpl'));
  });
});

describe('falha do espelho', () => {
  it('se gravar em documento_versoes falha, o escritor ainda responde 200 e grava o controle', async () => {
    const dbQuebrado = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (/INSERT INTO documento_versoes/.test(sql)) throw new Error('falha injetada');
            return alvo.prepare(sql);
          };
        }
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const r = await req(`/api/v1/projects/${PROJ}/controls/esc-falha/policy`, { method: 'POST', body: JSON.stringify({ text: 'Texto que fica' }) }, h, ambiente({ DB: dbQuebrado }));
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await descricao('esc-falha')).toBe('Texto que fica');
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM policy_versions WHERE control_id = 'esc-falha'`).first<{ n: number }>())?.n).toBe(1);
  });
});
