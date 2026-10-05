import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';

describe('niso_ler / niso_executar', () => {
  let token: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Cliente A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-b','Cliente B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-c','cons@ness.lat',?,'Cons','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer) VALUES ('i-1','p-a','governanca','Existe PSI?','Sim, v2')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-a','p-a','Servidor','Queda'), ('r-b','p-b','Segredo de B','Vazamento')`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-txt','p-a','nota.md','evidence/p-a/nota.md','h','x'), ('ev-pdf','p-a','laudo.pdf','evidence/p-a/laudo.pdf','h','x')`),
    ]);
    await env.STORAGE.put('evidence/p-a/nota.md', 'Texto da evidência');
    await env.STORAGE.put('evidence/p-a/laudo.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), { httpMetadata: { contentType: 'application/pdf' } });
    token = await tokenDoAgente('cons@ness.lat', 'p-a');
  });

  it('lê trilha de entrevista e conteúdo de evidência de texto', async () => {
    const trilha = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/projects/p-a/interviews/governanca' });
    expect(trilha.isError).toBeFalsy();
    expect(trilha.content[0].text).toContain('Existe PSI?');
    const ev = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/evidence/ev-txt/content' });
    expect(ev.content[0].text).toContain('Texto da evidência');
  });

  it('binário volta como metadados, não bytes', async () => {
    const r = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/evidence/ev-pdf/download' });
    expect(r.content[0].text).toContain('binário');
    expect(r.content[0].text).not.toContain('%PDF');
  });

  it('não lê outro projeto', async () => {
    const r = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/projects/p-b/risks' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).not.toContain('Segredo de B');
  });

  it('apagar exige confirmado_pelo_usuario booleano', async () => {
    const semConfirmar = await chamarFerramenta(token, 'niso_executar', { metodo: 'DELETE', caminho: '/api/v1/risks/r-a' });
    expect(semConfirmar.isError).toBe(true);
    const string = await chamarFerramenta(token, 'niso_executar', { metodo: 'DELETE', caminho: '/api/v1/risks/r-a', confirmado_pelo_usuario: 'true' });
    expect(string.isError).toBe(true);
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a'`).first()).not.toBeNull();
    const ok = await chamarFerramenta(token, 'niso_executar', { metodo: 'DELETE', caminho: '/api/v1/risks/r-a', confirmado_pelo_usuario: true });
    expect(ok.isError, ok.content[0].text).toBeFalsy();
    expect(await env.DB.prepare(`SELECT 1 FROM risks WHERE id='r-a'`).first()).toBeNull();
  });

  it('grava com POST', async () => {
    const r = await chamarFerramenta(token, 'niso_executar', { metodo: 'POST', caminho: '/api/v1/projects/p-a/risks', corpo: { asset: 'Rede', threat: 'Intrusão' } });
    expect(r.isError, r.content[0].text).toBeFalsy();
  });

  it('caminho fora de /api/v1/ diz o que está errado, não "id com caractere inválido"', async () => {
    for (const caminho of ['/health', 'api/v1/projects', '/api/v2/x', '']) {
      const r = await chamarFerramenta(token, 'niso_ler', { caminho });
      expect(r.isError, JSON.stringify(caminho)).toBe(true);
      expect(r.content[0].text, JSON.stringify(caminho)).toContain('deve começar com /api/v1/');
      expect(r.content[0].text).not.toContain('id com caractere');
    }
  });

  it('método inválido é recusado sem chamar a API', async () => {
    const r = await chamarFerramenta(token, 'niso_executar', { metodo: 'GET', caminho: '/api/v1/projects/p-a/risks' });
    expect(r.isError).toBe(true);
  });

  it('resposta enorme é cortada com aviso', async () => {
    const grande = 'x'.repeat(150_000);
    await env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer) VALUES ('i-g','p-a','grande','Q',?)`).bind(grande).run();
    const r = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/projects/p-a/interviews/grande' });
    expect(r.content[0].text.length).toBeLessThan(101_000);
    expect(r.content[0].text).toContain('cortada');
  });
});
