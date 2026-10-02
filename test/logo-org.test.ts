import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import JSZip from 'jszip';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Fatia 5, tarefa 6: logo da organização. Upload de arquivo de usuário que vai parar dentro de
 * documento enviado a cliente: só PNG/JPEG conferidos pelos BYTES, com teto, e embutido como
 * `data:` URI na geração (documento congelado não depende de URL).
 */

// PNG 1x1 real (assinatura + IHDR + IDAT + IEND).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
// JPEG mínimo: SOI + APP0 JFIF + EOI.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>');
const HTML = new TextEncoder().encode('<!doctype html><html><body><script>alert(1)</script></body></html>');
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00;');
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

const enviar = (h: Record<string, string>, corpo: BodyInit | null, tipo?: string, e: any = workerEnv()) =>
  app.fetch(new Request('http://localhost/api/v1/org/logo', {
    method: 'POST', headers: { ...h, ...(tipo ? { 'Content-Type': tipo } : {}) }, body: corpo,
  }), e);
const ler = (h: Record<string, string>, sufixo = '') =>
  app.fetch(new Request('http://localhost/api/v1/org/logo' + sufixo, { headers: h }), workerEnv() as any);
const json = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown, e: any = workerEnv()) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), e);

describe('logo da organização', () => {
  let pa: Record<string, string>, cadm: Record<string, string>, cadmB: Record<string, string>;
  let consultor: Record<string, string>, com: Record<string, string>, cliente: Record<string, string>;
  let srv: string;

  const proposta = async () => {
    const r = await json('POST', '/api/v1/propostas', com, { leadId: 'lead-l', itens: [{ servicoId: srv }] });
    expect(r.status, await r.clone().text()).toBe(201);
    return (await r.json<any>()).id as string;
  };
  const gerar = async (id: string, e: any = workerEnv()) => {
    const r = await json('POST', `/api/v1/propostas/${id}/gerar`, com, {}, e);
    expect(r.status, await r.clone().text()).toBe(200);
    return r.json<any>();
  };
  const documento = (id: string) => json('GET', `/api/v1/propostas/${id}/documento`, com);
  const word = async (id: string) => {
    const r = await json('GET', `/api/v1/propostas/${id}/docx`, com);
    expect(r.status).toBe(200);
    return JSZip.loadAsync(new Uint8Array(await r.arrayBuffer()));
  };
  const chaveDe = async (org: string) =>
    (await env.DB.prepare('SELECT logo_chave FROM organizations WHERE id = ?').bind(org).first<any>())?.logo_chave ?? null;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, status) VALUES ('org_b', 'Consultoria B', 'b', 'Active')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name) VALUES ('lead-l', 'Cliente do Logo')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-l','L','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-con','con@ness.lat','x','Con','consultor','org_ness')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-l','Con','con@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-x','u-con','p-l', datetime('now','+30 days'))`),
    ]);
    pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
    cadm = await sessionFor({ id: 'u-cadm', email: 'cadm@ness.lat', role: 'consultoria_admin', org_id: 'org_ness' });
    cadmB = await sessionFor({ id: 'u-cadmb', email: 'cadm@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
    consultor = await sessionFor({ id: 'u-con', email: 'con@ness.lat', role: 'consultor', org_id: 'org_ness' });
    com = await sessionFor({ id: 'u-com', email: 'com@ness.lat', role: 'comercial', org_id: 'org_ness' });
    cliente = await sessionFor({ id: 'u-cli', email: 'cli@x.com', role: 'org_admin', client_project_id: 'p-l' });
    const s = await json('POST', '/api/v1/servicos', com, {
      nome: 'Treinamento LGPD', tipo: 'avulso', formaPreco: 'fixo', valorFixo: 8200, entregaveis: ['Turma'], criterioAceite: 'Feita.',
    });
    srv = (await s.json<any>()).id;
  }, 60_000);

  it('sem logo: GET → 404 e o documento gerado não tem <img> nem logo no conteúdo', async () => {
    expect((await ler(cadm)).status).toBe(404);
    const id = await proposta();
    await gerar(id);
    const html = await (await documento(id)).text();
    expect(html).not.toContain('<img');
    const linha = await env.DB.prepare('SELECT documento_conteudo FROM propostas WHERE id = ?').bind(id).first<any>();
    expect(JSON.parse(linha.documento_conteudo).org).not.toHaveProperty('logo');
  }, 30_000);

  it('PNG válido → 200: grava no R2 com tipo fixo, atualiza logo_chave e registra trilha', async () => {
    const r = await enviar(cadm, PNG, 'image/png');
    expect(r.status, await r.clone().text()).toBe(200);
    const chave = await chaveDe('org_ness');
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', PNG))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(chave).toBe(`logos/org_ness/${sha}.png`);
    const obj = await env.STORAGE.get(chave);
    expect(obj).not.toBeNull();
    expect(obj!.httpMetadata?.contentType).toBe('image/png');
    expect(new Uint8Array(await obj!.arrayBuffer())).toEqual(PNG);
    const trilha = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'org.logo_atualizado' ORDER BY rowid DESC`).first<any>();
    expect(trilha.actor).toBe('cadm@ness.lat');
    expect(trilha.details).toContain(chave);
    expect(trilha.details).toContain(String(PNG.byteLength));

    const g = await ler(consultor);
    expect(g.status).toBe(200);
    expect(g.headers.get('Content-Type')).toBe('image/png');
    expect(g.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(g.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(g.headers.get('Content-Disposition')).toBe('inline');
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(PNG);
  });

  it('JPEG válido → 200 (platform_admin, na organização do X-Org-Id)', async () => {
    const r = await enviar({ ...pa, 'X-Org-Id': 'org_b' }, JPEG, 'image/jpeg');
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await chaveDe('org_b')).toMatch(/^logos\/org_b\/[0-9a-f]{64}\.jpg$/);
    const g = await ler(cadmB);
    expect(g.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(JPEG);
    // devolve ao estado sem logo para o teste de isolamento
    await env.DB.prepare(`UPDATE organizations SET logo_chave = NULL WHERE id = 'org_b'`).run();
  });

  it('recusa com 400 tudo que não é PNG/JPEG de verdade, e nada muda', async () => {
    const antes = await chaveDe('org_ness');
    const casos: [string, BodyInit | null, string | undefined][] = [
      ['SVG com tipo png', SVG, 'image/png'],
      ['SVG declarado', SVG, 'image/svg+xml'],
      ['HTML com tipo png', HTML, 'image/png'],
      ['GIF', GIF, 'image/gif'],
      ['GIF com tipo png', GIF, 'image/png'],
      ['PNG declarado como jpeg', PNG, 'image/jpeg'],
      ['JPEG declarado como png', JPEG, 'image/png'],
      ['sem Content-Type', PNG, undefined],
      ['corpo vazio', new Uint8Array(0), 'image/png'],
      ['só a assinatura', PNG.slice(0, 4), 'image/png'],
    ];
    for (const [nome, corpo, tipo] of casos) {
      const r = await enviar(cadm, corpo, tipo);
      expect(r.status, nome).toBe(400);
    }
    expect(await chaveDe('org_ness')).toBe(antes);
  });

  it('acima de 200 KB → 400, sem ler o corpo inteiro (stream cancelado no teto)', async () => {
    const grande = new Uint8Array(201 * 1024);
    grande.set(PNG.slice(0, 8));
    expect((await enviar(cadm, grande, 'image/png')).status).toBe(400);

    // corpo em stream, sem Content-Length: o leitor para logo depois do teto
    let lidos = 0;
    const pedaco = new Uint8Array(64 * 1024);
    pedaco.set(PNG.slice(0, 8));
    const corpo = new ReadableStream<Uint8Array>({
      pull(ctl) { lidos += pedaco.byteLength; if (lidos > 10 * 1024 * 1024) ctl.close(); else ctl.enqueue(pedaco); },
    });
    const r = await app.fetch(new Request('http://localhost/api/v1/org/logo', {
      method: 'POST', headers: { ...cadm, 'Content-Type': 'image/png' }, body: corpo, duplex: 'half',
    } as any), workerEnv());
    expect([400, 413]).toContain(r.status);
    expect(lidos).toBeLessThan(2 * 1024 * 1024);
  });

  it('só consultoria_admin e platform_admin gravam: consultor, comercial, cliente e agente → 403', async () => {
    const antes = await chaveDe('org_ness');
    for (const h of [consultor, com, cliente]) expect((await enviar(h, PNG, 'image/png')).status).toBe(403);
    const ag = await enviar({ 'X-Agente-Confirmado': '1' }, PNG, 'image/png', {
      ...workerEnv(), AGENTE: { userId: 'u-con', email: 'con@ness.lat', projectId: 'p-l', concessaoId: 'c-x' },
    });
    expect(ag.status).toBe(403);
    expect((await ler(cliente)).status).toBe(403);
    expect(await chaveDe('org_ness')).toBe(antes);
  });

  it('outra organização não lê o logo alheio, mesmo sabendo a chave; X-Org-Id de quem não é platform_admin é ignorado', async () => {
    const chaveNess = await chaveDe('org_ness');
    expect(chaveNess).not.toBeNull();
    expect((await ler(cadmB)).status).toBe(404);
    expect((await ler(cadmB, `?chave=${encodeURIComponent(chaveNess)}`)).status).toBe(404);
    expect((await ler({ ...cadmB, 'X-Org-Id': 'org_ness' })).status).toBe(404);
    // gravar com X-Org-Id da ness. grava na PRÓPRIA organização
    expect((await enviar({ ...cadmB, 'X-Org-Id': 'org_ness' }, JPEG, 'image/jpeg')).status).toBe(200);
    expect(await chaveDe('org_ness')).toBe(chaveNess);
    expect(await chaveDe('org_b')).toMatch(/^logos\/org_b\//);
    expect(new Uint8Array(await (await ler(cadmB)).arrayBuffer())).toEqual(JPEG);
  });

  it('documento gerado com logo: data: URI exato, nenhuma imagem externa, CSP com img-src data:; o Word traz a imagem', async () => {
    const id = await proposta();
    await gerar(id);
    const doc = await documento(id);
    expect(doc.headers.get('Content-Security-Policy')).toContain('img-src data:');
    expect(doc.headers.get('Content-Security-Policy')).toMatch(/^default-src 'none'/);
    const html = await doc.text();
    expect(html).toContain(`src="data:image/png;base64,${PNG_B64}"`);
    expect(html).toContain('alt="ness."');
    expect(html).not.toMatch(/<img[^>]+src="https?:/i);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
    const zip = await word(id);
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    expect(await zip.file('word/document.xml')!.async('string')).toMatch(/<w:drawing>/);
  }, 30_000);

  it('trocar o logo depois NÃO muda o HTML, o hash nem o Word da proposta já gerada', async () => {
    const id = await proposta();
    const g = await gerar(id);
    const html = await (await documento(id)).text();
    const z1 = await word(id);
    const xml1 = await z1.file('word/document.xml')!.async('string');
    const midia1 = await Promise.all(Object.keys(z1.files).filter((f) => f.startsWith('word/media/') && !z1.files[f].dir).map((f) => z1.file(f)!.async('base64')));

    expect((await enviar(cadm, JPEG, 'image/jpeg')).status).toBe(200);
    expect(await chaveDe('org_ness')).toMatch(/\.jpg$/);

    expect(await (await documento(id)).text()).toBe(html);
    expect((await (await json('GET', `/api/v1/propostas/${id}`, com)).json<any>()).documento_hash).toBe(g.documento_hash);
    const z2 = await word(id);
    expect(await z2.file('word/document.xml')!.async('string')).toBe(xml1);
    const midia2 = await Promise.all(Object.keys(z2.files).filter((f) => f.startsWith('word/media/') && !z2.files[f].dir).map((f) => z2.file(f)!.async('base64')));
    expect(midia2).toEqual(midia1);
    expect(midia1.join()).toContain(b64(PNG).slice(0, 20));
    // a próxima proposta já sai com o novo
    const id2 = await proposta();
    await gerar(id2);
    expect(await (await documento(id2)).text()).toContain(`src="data:image/jpeg;base64,${b64(JPEG)}"`);
  }, 30_000);

  it('falha do R2 na geração → gera sem logo e registra o erro', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const id = await proposta();
      const quebrado = { ...workerEnv(), STORAGE: { get: async () => { throw new Error('R2 fora do ar'); } } };
      await gerar(id, quebrado);
      const html = await (await documento(id)).text();
      expect(html).not.toContain('<img');
      expect(erro).toHaveBeenCalled();
      expect(erro.mock.calls.flat().join(' ')).toMatch(/logo/i);
    } finally { erro.mockRestore(); }
  }, 30_000);
});
