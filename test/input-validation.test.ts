import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';
import { MAX_JSON_BYTES } from '../src/middleware/body-guard';

/**
 * Validação de entrada: guarda global de corpo + schemas por rota.
 *
 * O que se afirma aqui é o contrato de erro: entrada inválida responde 400 (ou
 * 413), não 500. A diferença importa — 500 é erro do servidor, aparece no log
 * como incidente e esconde abuso no meio do ruído.
 */
describe('Guarda global de corpo', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','admin@ness.io',?,'Admin','platform_admin')`).bind(hash),
    ]);
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'admin@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function post(path: string, body: string) {
    return app.fetch(new Request(`http://localhost${path}`, { method: 'POST', headers, body }), env as any);
  }

  it('recusa corpo acima de 1 MB com 413', async () => {
    const gigante = JSON.stringify({ processing_purpose: 'x'.repeat(MAX_JSON_BYTES + 100) });
    const res = await post('/api/v1/projects/p1/ropa', gigante);
    expect(res.status).toBe(413);
  });

  it('recusa poluição de protótipo', async () => {
    const res = await post('/api/v1/projects/p1/ropa', '{"__proto__":{"admin":true},"processing_purpose":"x"}');
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('não permitida');
  });

  it('recusa poluição de protótipo aninhada', async () => {
    const res = await post('/api/v1/projects/p1/ropa', '{"a":{"b":{"constructor":{"x":1}}}}');
    expect(res.status).toBe(400);
  });

  it('recusa corpo que não é objeto', async () => {
    expect((await post('/api/v1/projects/p1/ropa', '[1,2,3]')).status).toBe(400);
    expect((await post('/api/v1/projects/p1/ropa', '"texto"')).status).toBe(400);
  });

  it('recusa JSON malformado com 400, não 500', async () => {
    const res = await post('/api/v1/projects/p1/ropa', '{isso nao e json');
    expect(res.status).toBe(400);
  });

  it('corta o corpo grande SEM Content-Length, sem bufferizar tudo', async () => {
    // Achado P1 do Codex: a versão anterior usava c.req.text(), que bufferiza o
    // corpo INTEIRO antes da checagem de tamanho. Numa requisição chunked o teto
    // não protegia nada. Aqui o stream é enviado sem Content-Length.
    const pedaco = new TextEncoder().encode('x'.repeat(64 * 1024));
    let enviados = 0;
    const stream = new ReadableStream({
      pull(ctrl) {
        if (enviados >= 32) return ctrl.close(); // 2 MB no total
        enviados++;
        ctrl.enqueue(pedaco);
      },
    });
    const res = await app.fetch(
      new Request('http://localhost/api/v1/projects/p1/ropa', {
        method: 'POST', headers, body: stream, duplex: 'half',
      } as any),
      env as any
    );
    expect(res.status).toBe(413);
  });

  it('não confia no Content-Type declarado para decidir se inspeciona', async () => {
    // Achado P1 do Codex: os handlers chamam c.req.json() independentemente do
    // cabeçalho. Se a guarda só agisse com application/json, bastaria declarar
    // text/plain para escapar de todas as verificações.
    const res = await app.fetch(
      new Request('http://localhost/api/v1/projects/p1/ropa', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: '{"__proto__":{"admin":true},"processing_purpose":"x"}',
      }),
      env as any
    );
    expect(res.status).toBe(400);
  });

  it('deixa passar corpo vazio — rota de ação não recebe corpo', async () => {
    // Se a guarda recusasse isto, quebraria toda rota de "executar" sem payload.
    const res = await post('/api/v1/projects/p1/generate-soa', '');
    expect(res.status).not.toBe(400);
  });
});

describe('Schemas por rota', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const hash = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','admin@ness.io',?,'Admin','platform_admin')`).bind(hash),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, maturity) VALUES ('c1','p1','ISO 27001:2022','T','Missing',0)`),
      env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token, expires_at) VALUES ('at1','p1','tok-valido','2099-01-01T00:00:00Z')`),
    ]);
    headers = {
      ...(await sessionFor({ id: 'u1', email: 'admin@ness.io', role: 'platform_admin', iat: Date.now() })),
      'Content-Type': 'application/json',
    };
  });

  async function req(path: string, metodo: string, body: unknown) {
    return app.fetch(
      new Request(`http://localhost${path}`, { method: metodo, headers, body: JSON.stringify(body) }),
      env as any
    );
  }

  it('ROPA sem a finalidade responde 400, não 500', async () => {
    // Antes: erro do banco -> 500, ou seja, erro de cliente virando incidente.
    // Só `processing_purpose` é obrigatório — ver o teste do payload real da UI.
    const res = await req('/api/v1/projects/p1/ropa', 'POST', { data_categories: 'CPF' });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('Payload inválido');
  });

  it('ROPA completo é aceito', async () => {
    const res = await req('/api/v1/projects/p1/ropa', 'POST', {
      processing_purpose: 'Folha de pagamento',
      data_categories: 'Nome, CPF',
      data_subjects: 'Empregados',
      legal_basis: 'Obrigação legal',
      retention_period: '5 anos',
      recipients: 'Contabilidade',
      international_transfers: 'Não',
      owner: 'DPO',
    });
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it('maturidade fora da escala CMM 0-5 é recusada', async () => {
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: 9 })).status).toBe(400);
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: -1 })).status).toBe(400);
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: 'alta' })).status).toBe(400);

    // E o valor válido continua passando — senão o teste só prova que quebrei tudo.
    expect((await req('/api/v1/controls/c1/maturity', 'PUT', { maturity: 3 })).status).toBe(200);
    const ctrl = await env.DB.prepare("SELECT maturity FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.maturity).toBe(3);
  });

  it('token de auditor com prazo aberto é recusado', async () => {
    // days_valid sem teto é acesso perpétuo de terceiro a evidência do cliente.
    expect((await req('/api/v1/projects/p1/auditor-token', 'POST', { days_valid: 99999 })).status).toBe(400);
    expect((await req('/api/v1/projects/p1/auditor-token', 'POST', { days_valid: 0 })).status).toBe(400);
  });

  it('texto acima do teto de campo é recusado', async () => {
    const res = await req('/api/v1/projects/p1/ropa', 'POST', {
      processing_purpose: 'x'.repeat(600), // curto = max 500
      data_categories: 'a', data_subjects: 'a', legal_basis: 'a',
      retention_period: 'a', recipients: 'a', international_transfers: 'a', owner: 'a',
    });
    expect(res.status).toBe(400);
  });

  it('CNPJ com formato inválido é recusado antes de chamar a API externa', async () => {
    const res = await req('/api/v1/leads/qualquer/enrich-cnpj', 'POST', { cnpj: '123' });
    expect(res.status).toBe(400);
  });

  // Os casos abaixo vêm da revisão do Codex no PR #27: a primeira versão dos
  // schemas foi escrita contra a MINHA suposição do payload, não contra o que a
  // UI manda. Cada um destes teria quebrado um fluxo que já funcionava.

  it('aceita exatamente o payload que o formulário de ROPA envia', async () => {
    // privacy.js manda international_transfers como 0/1 numérico (a coluna é
    // INTEGER) e só barra a ausência de processing_purpose. A versão anterior
    // do schema exigia string e mais seis campos: TODA criação pela UI dava 400.
    const res = await req('/api/v1/projects/p1/ropa', 'POST', {
      processing_purpose: 'Folha de pagamento',
      data_categories: '', data_subjects: '', legal_basis: '',
      retention_period: '', recipients: '', transfer_safeguards: '',
      owner: '', status: 'Draft',
      international_transfers: 0,
      dpia_required: 1,
    });
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it('ROPA ainda exige a finalidade do tratamento', async () => {
    // O que continua obrigatório: sem finalidade, o registro não serve de ROPA.
    expect((await req('/api/v1/projects/p1/ropa', 'POST', { data_categories: 'CPF' })).status).toBe(400);
  });

  it('aceita CNPJ com pontuação, como o usuário digita', async () => {
    // O handler normaliza com replace(/\D/g,'') logo depois; recusar o formato
    // pontuado antes disso quebraria cliente que sempre funcionou.
    const formatado = await req('/api/v1/leads/x/enrich-cnpj', 'POST', { cnpj: '12.345.678/0001-90' });
    expect(formatado.status).not.toBe(400);
    const limpo = await req('/api/v1/leads/x/enrich-cnpj', 'POST', { cnpj: '12345678000190' });
    expect(limpo.status).not.toBe(400);
    // Mas 13 dígitos continua sendo recusado.
    expect((await req('/api/v1/leads/x/enrich-cnpj', 'POST', { cnpj: '1234567800019' })).status).toBe(400);
  });

  it('aceita membro de governança sem e-mail — o campo é opcional no formulário', async () => {
    // monitor.js manda string vazia quando o campo não é preenchido, a coluna é
    // nullable e o handler grava `email || null`.
    const vazio = await req('/api/v1/projects/p1/governance', 'POST', {
      name: 'Ricardo', email: '', role_category: 'executivo', job_title: 'CEO',
    });
    // O handler faz upsert e responde 200, não 201.
    expect(vazio.status, await vazio.clone().text()).toBe(200);

    // E-mail malformado continua recusado.
    expect((await req('/api/v1/projects/p1/governance', 'POST', {
      name: 'X', email: 'nao-e-email', role_category: 'tech', job_title: 'CTO',
    })).status).toBe(400);
  });

  it('"false" e "0" como string NÃO viram verdadeiro no banco', async () => {
    // Achado do CodeRabbit: boolLike aceitava string sem normalizar, e todo
    // consumidor faz `valor ? 1 : 0`. Como "false" e "0" são strings NÃO-VAZIAS,
    // eram truthy — quem respondeu "não" ficava gravado como "sim".
    for (const [entrada, esperado] of [['false', 0], ['0', 0], ['true', 1], ['1', 1]] as const) {
      const res = await req('/api/v1/projects/p1/ropa', 'POST', {
        processing_purpose: `Teste ${entrada}`,
        dpia_required: entrada,
      });
      expect(res.status, `${entrada}: ${await res.clone().text()}`).toBe(201);
      const { id } = await res.json() as any;
      const linha = await env.DB.prepare('SELECT dpia_required FROM ropa_records WHERE id = ?').bind(id).first<any>();
      expect(linha.dpia_required, `entrada "${entrada}"`).toBe(esperado);
    }
  });

  it('employee_count 0 é gravado como 0, não como null', async () => {
    // Achado do CodeRabbit: `employee_count ? parseInt(...) : null` tratava o
    // zero como ausência. Empresa sem funcionários declarados virava "não sei".
    const res = await req('/api/v1/projects/p1/company-profile', 'PUT', { employee_count: 0 });
    expect(res.status, await res.clone().text()).toBe(200);
    const p = await env.DB.prepare("SELECT employee_count FROM projects WHERE id='p1'").first<any>();
    expect(p.employee_count).toBe(0);
  });

  it('nota de auditor externo vazia é recusada', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auditor/tok-valido/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '   ' }),
      }),
      env as any
    );
    expect(res.status).toBe(400);
  });
});
