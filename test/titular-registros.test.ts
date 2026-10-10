import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { somarPrazo } from '../src/services/parametros-legais';
import { situacaoDoPrazo } from '../src/services/titular-pedidos';
import { situacaoDaComunicacao } from '../src/services/incidentes';

/** Fatia 7: pedido do titular, incidente e consentimento (interno). Nenhum prazo legal mora no código: tudo vem de parametros_legais. */
const P = 'tr-proj';
const OUTRO = 'tr-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const hoje = () => new Date().toISOString().slice(0, 10);
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let admin: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-tr' };
const B = `/api/v1/projects/${P}`;
const par = (chave: string, valor: number, unidade: string) => chamar(admin, 'PUT', `/api/v1/parametros-legais/${chave}`, { valor, unidade, fonte: 'Fonte de teste', revisado_em: '2026-10-01', revisado_por: 'Dra. Teste' });
const limparParametros = () => env.DB.prepare('DELETE FROM parametros_legais').run();

describe('somarPrazo', () => {
  it('horas e dias corridos somam direto; dias úteis pulam sábado e domingo', () => {
    expect(somarPrazo('2026-10-09T10:00:00Z', 72, 'horas')).toBe('2026-10-12T10:00:00.000Z');
    expect(somarPrazo('2026-10-09', 15, 'dias_corridos')).toBe('2026-10-24T00:00:00.000Z');
    // sexta 2026-10-09 + 1 dia útil = segunda; + 5 = sexta seguinte
    expect(somarPrazo('2026-10-09', 1, 'dias_uteis')).toBe('2026-10-12T00:00:00.000Z');
    expect(somarPrazo('2026-10-09', 5, 'dias_uteis')).toBe('2026-10-16T00:00:00.000Z');
    expect(somarPrazo('2026-10-10', 1, 'dias_uteis')).toBe('2026-10-12T00:00:00.000Z'); // base num sábado
  });
  it('data inválida estoura', () => {
    expect(() => somarPrazo('ontem', 1, 'horas')).toThrow();
  });
});

describe('situações derivadas', () => {
  it('pedido: sem prazo, encerrado, no prazo, vence hoje, atrasado', () => {
    expect(situacaoDoPrazo({ prazo_em: null, status: 'recebido' })).toBe('sem_prazo');
    expect(situacaoDoPrazo({ prazo_em: '2026-10-01', status: 'respondido' })).toBe('encerrado');
    expect(situacaoDoPrazo({ prazo_em: '2026-10-20', status: 'recebido' }, '2026-10-09')).toBe('no_prazo');
    expect(situacaoDoPrazo({ prazo_em: '2026-10-09T15:00:00.000Z', status: 'em_andamento' }, '2026-10-09')).toBe('vence_hoje');
    expect(situacaoDoPrazo({ prazo_em: '2026-10-01', status: 'recebido' }, '2026-10-09')).toBe('atrasado');
  });
  it('comunicação: feita vale mais que o prazo', () => {
    expect(situacaoDaComunicacao('2026-10-01', '2026-10-02')).toBe('comunicado');
    expect(situacaoDaComunicacao(null, null)).toBe('sem_prazo');
    expect(situacaoDaComunicacao('2026-10-01', null, '2026-10-09')).toBe('atrasado');
  });
});

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-adm', 'adm@ness.lat', 'x', 'Adm', 'platform_admin', NULL, 'org_ness'), ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tr', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-tr', 'u-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('tr-pa', ?1, 'pessoa', 'Ana'), ('tr-pa-o', ?2, 'pessoa', 'Alheia')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('tr-r1', ?1, 'Marketing'), ('tr-r-o', ?2, 'Do outro')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('prazos legais (parâmetros)', () => {
  it('nasce vazio: as três chaves aparecem como não definidas, para qualquer papel', async () => {
    for (const h of [admin, consultor, cliente]) {
      const l = await json<{ chave: string; definido: boolean }[]>(await chamar(h, 'GET', '/api/v1/parametros-legais'));
      expect(l.map((x) => [x.chave, x.definido])).toEqual([['titular.resposta', false], ['incidente.comunicacao_anpd', false], ['incidente.comunicacao_titular', false]]);
    }
  });

  it('só o platform_admin escreve; cliente, consultor e agente recebem 403; o agente lê', async () => {
    const corpo = { valor: 15, unidade: 'dias_corridos', fonte: 'F', revisado_em: '2026-10-01', revisado_por: 'X' };
    for (const h of [cliente, consultor]) {
      expect((await chamar(h, 'PUT', '/api/v1/parametros-legais/titular.resposta', corpo)).status).toBe(403);
      expect((await chamar(h, 'DELETE', '/api/v1/parametros-legais/titular.resposta')).status).toBe(403);
    }
    expect((await chamar({}, 'PUT', '/api/v1/parametros-legais/titular.resposta', corpo, { AGENTE })).status).toBe(403);
    expect((await chamar({}, 'GET', '/api/v1/parametros-legais', undefined, { AGENTE })).status).toBe(200);
  });

  it('valida: chave desconhecida 404; valor, unidade, fonte, revisor e data obrigatórios e válidos; trilha com fonte e revisor', async () => {
    expect((await par('chave.inventada', 5, 'horas')).status).toBe(404);
    const base = { valor: 5, unidade: 'horas', fonte: 'F', revisado_em: '2026-10-01', revisado_por: 'X' };
    for (const mud of [{ valor: 0 }, { valor: 1.5 }, { unidade: 'semanas' }, { fonte: ' ' }, { revisado_por: '' }, { revisado_em: '01/10/2026' }, { extra: 1 }]) {
      expect((await chamar(admin, 'PUT', '/api/v1/parametros-legais/titular.resposta', { ...base, ...mud })).status, JSON.stringify(mud)).toBe(400);
    }
    expect((await par('titular.resposta', 15, 'dias_corridos')).status).toBe(200);
    const log = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'parametro_legal.salvo' ORDER BY rowid DESC LIMIT 1`).first<{ actor: string; details: string }>();
    expect(log!.actor).toBe('adm@ness.lat');
    expect(log!.details).toContain('Fonte de teste');
    expect(log!.details).toContain('Dra. Teste');
    expect((await chamar(admin, 'DELETE', '/api/v1/parametros-legais/titular.resposta')).status).toBe(200);
    expect((await chamar(admin, 'DELETE', '/api/v1/parametros-legais/titular.resposta')).status).toBe(404);
  });
});

describe('pedido do titular', () => {
  const criar = (corpo: object = {}, h = consultor) => chamar(h, 'POST', `${B}/titular-pedidos`, { tipo: 'acesso', ...corpo });
  const ler = async (id: string) => json<Record<string, any>>(await chamar(consultor, 'GET', `${B}/titular-pedidos/${id}`));

  it('sem parâmetro cadastrado o prazo é "não calculado" e nada quebra; protocolo sequencial', async () => {
    await limparParametros();
    const a = await json<{ id: string; protocolo: string; prazo_em: string | null }>(await criar({ canal: 'email', titular_nome: 'Fulano Exemplo' }));
    const b = await json<{ protocolo: string }>(await criar());
    const ano = new Date().getUTCFullYear();
    expect(a.protocolo).toBe(`PT-${ano}-0001`);
    expect(b.protocolo).toBe(`PT-${ano}-0002`);
    expect(a.prazo_em).toBeNull();
    expect((await ler(a.id)).situacao_prazo).toBe('sem_prazo');
  });

  it('com o parâmetro, o prazo é calculado e CONGELADO: mudar o parâmetro depois não reescreve', async () => {
    await par('titular.resposta', 15, 'dias_corridos');
    const a = await json<{ id: string; prazo_em: string }>(await criar({ recebido_em: hoje() }));
    expect(a.prazo_em.slice(0, 10)).toBe(dias(15));
    await par('titular.resposta', 5, 'dias_corridos');
    expect((await ler(a.id)).prazo_em.slice(0, 10)).toBe(dias(15));
    const b = await json<{ prazo_em: string }>(await criar());
    expect(b.prazo_em.slice(0, 10)).toBe(dias(5));
    expect((await ler((await json<{ id: string }>(await criar())).id)).situacao_prazo).toBe('no_prazo');
  });

  it('valida: tipo/canal fora da lista, data futura ou impossível, campo extra, responsável de outro projeto: 400', async () => {
    for (const corpo of [{ tipo: 'pedir_desconto' }, { canal: 'pombo' }, { recebido_em: dias(2) }, { recebido_em: '2026-02-30' }, { extra: 1 }, { responsavel_parte_id: 'tr-pa-o' }]) {
      expect((await criar(corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await criar({ responsavel_parte_id: 'tr-pa' })).status).toBe(201);
  });

  it('responder exige o texto e guarda a data; respondido não muda, só arquiva; arquivado não reabre', async () => {
    const id = (await json<{ id: string }>(await criar())).id;
    const put = (corpo: object) => chamar(consultor, 'PUT', `${B}/titular-pedidos/${id}`, corpo);
    expect((await put({ status: 'em_andamento' })).status).toBe(200);
    expect((await put({ status: 'respondido' })).status).toBe(400); // sem texto
    expect((await put({ status: 'respondido', resposta_texto: 'Segue o relatório.' })).status).toBe(200);
    const p = await ler(id);
    expect(p).toMatchObject({ status: 'respondido', resposta_texto: 'Segue o relatório.', situacao_prazo: 'encerrado' });
    expect(p.respondido_em).toBeTruthy();
    expect((await put({ resposta_texto: 'Outra' })).status).toBe(409);
    expect((await put({ status: 'recebido' })).status).toBe(409);
    expect((await put({ status: 'arquivado' })).status).toBe(200);
    expect((await put({ status: 'em_andamento' })).status).toBe(409);
  });

  it('prazo editado à mão entra na trilha; data inválida é 400; o atrasado aparece como atrasado', async () => {
    const id = (await json<{ id: string }>(await criar())).id;
    expect((await chamar(consultor, 'PUT', `${B}/titular-pedidos/${id}`, { prazo_em: '31/12/2026' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${B}/titular-pedidos/${id}`, { prazo_em: dias(-3) })).status).toBe(200);
    expect((await ler(id)).situacao_prazo).toBe('atrasado');
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular.pedido_atualizado' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<{ details: string }>();
    expect(log!.details).toContain('prazo alterado à mão');
  });

  it('isolamento e papéis: pedido de outro projeto é 404; cliente lê mas não grava', async () => {
    await env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em) VALUES ('tr-p-o', ?, 'PT-2026-0001', 'acesso', '2026-10-01')`).bind(OUTRO).run();
    expect((await chamar(consultor, 'GET', `${B}/titular-pedidos/tr-p-o`)).status).toBe(404);
    expect((await chamar(consultor, 'PUT', `${B}/titular-pedidos/tr-p-o`, { status: 'em_andamento' })).status).toBe(404);
    const lista = await json<{ id: string }[]>(await chamar(cliente, 'GET', `${B}/titular-pedidos`));
    expect(lista.some((x) => x.id === 'tr-p-o')).toBe(false);
    expect((await criar({}, cliente)).status).toBe(403);
  });
});

describe('incidente', () => {
  const criar = (corpo: object = {}) => chamar(consultor, 'POST', `${B}/incidentes`, { titulo: 'Acesso indevido', ciencia_em: new Date(Date.now() - 3_600_000).toISOString(), ...corpo });
  const novo = async () => (await json<{ id: string }>(await criar())).id;
  const ler = async (id: string) => json<Record<string, any>>(await chamar(consultor, 'GET', `${B}/incidentes/${id}`));

  it('protocolo IN-AAAA-NNNN; sem parâmetros os dois prazos ficam nulos; com eles contam da ciência e ficam congelados', async () => {
    await limparParametros();
    const a = await json<{ id: string; protocolo: string; prazo_anpd_em: string | null; prazo_titular_em: string | null }>(await criar());
    expect(a.protocolo).toMatch(/^IN-\d{4}-0001$/);
    expect(a.prazo_anpd_em).toBeNull();
    expect((await ler(a.id)).situacao_anpd).toBe('sem_prazo');
    await par('incidente.comunicacao_anpd', 72, 'horas');
    await par('incidente.comunicacao_titular', 3, 'dias_uteis');
    const ciencia = '2026-10-09T10:00:00Z';
    const b = await json<{ prazo_anpd_em: string; prazo_titular_em: string }>(await criar({ ciencia_em: ciencia }));
    expect(b.prazo_anpd_em).toBe('2026-10-12T10:00:00.000Z');
    expect(b.prazo_titular_em).toBe('2026-10-14T10:00:00.000Z');
    await par('incidente.comunicacao_anpd', 24, 'horas');
    const refeito = (await json<{ prazo_anpd_em: string }[]>(await chamar(consultor, 'GET', `${B}/incidentes`))).find((i) => i.prazo_anpd_em === '2026-10-12T10:00:00.000Z');
    expect(refeito).toBeTruthy();
  });

  it('valida: título e ciência obrigatórios, ciência futura ou malformada, responsável de outro projeto, campo extra: 400', async () => {
    for (const corpo of [{ titulo: ' ' }, { ciencia_em: undefined }, { ciencia_em: new Date(Date.now() + 86_400_000).toISOString() }, { ciencia_em: 'ontem' }, { ocorrido_em: 'x' }, { responsavel_parte_id: 'tr-pa-o' }, { extra: 1 }]) {
      expect((await criar(corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it('avaliar o risco muda para avaliado; comunicar registra a data (não no futuro) e vira comunicado', async () => {
    const id = await novo();
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'altissimo' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'relevante', avaliacao_texto: 'Dados de saúde' })).status).toBe(200);
    expect((await ler(id)).status).toBe('avaliado');
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd', em: new Date(Date.now() + 86_400_000).toISOString() })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'imprensa' })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd' })).status).toBe(200);
    const i = await ler(id);
    expect(i.status).toBe('comunicado');
    expect(i.situacao_anpd).toBe('comunicado');
  });

  it('encerrar: sem risco avaliado 409; risco relevante sem ANPD 409; com tudo, 200 e depois não muda', async () => {
    const id = await novo();
    const enc = () => chamar(consultor, 'POST', `${B}/incidentes/${id}/encerrar`);
    expect((await enc()).status).toBe(409);
    await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'relevante' });
    const r = await enc();
    expect(r.status).toBe(409);
    expect((await json<{ error: string }>(r)).error).toContain('ANPD');
    await chamar(consultor, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd' });
    expect((await enc()).status).toBe(200);
    expect((await enc()).status).toBe(409);
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'sem_risco' })).status).toBe(409);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'titular' })).status).toBe(409);
  });

  it('risco sem_risco encerra sem comunicação', async () => {
    const id = await novo();
    await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'sem_risco' });
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/encerrar`)).status).toBe(200);
  });

  it('o agente registra e avalia, mas não encerra; incidente de outro projeto é 404', async () => {
    const id = await novo();
    const ag = (m: string, p: string, b?: unknown) => chamar({}, m, p, b, { AGENTE });
    expect((await ag('POST', `${B}/incidentes`, { titulo: 'Do agente', ciencia_em: new Date().toISOString() })).status).toBe(201);
    expect((await ag('PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'sem_risco' })).status).toBe(200);
    expect((await ag('POST', `${B}/incidentes/${id}/encerrar`)).status).toBe(403);
    await env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em) VALUES ('tr-i-o', ?, 'IN-2026-0001', 'Alheio', '2026-10-01')`).bind(OUTRO).run();
    expect((await chamar(consultor, 'GET', `${B}/incidentes/tr-i-o`)).status).toBe(404);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/tr-i-o/encerrar`)).status).toBe(404);
  });
});

describe('consentimento', () => {
  const criar = (corpo: object = {}, h = consultor) => chamar(h, 'POST', `${B}/consentimentos`, { ropa_id: 'tr-r1', titular_ref: 'ref-001', finalidade: 'Marketing por e-mail', versao_aviso: 'Aviso v3', obtido_em: hoje(), ...corpo });

  it('registra a prova ligada ao tratamento e lista com o nome dele; filtra por tratamento', async () => {
    const r = await criar({ canal: 'site' });
    expect(r.status, await r.clone().text()).toBe(201);
    const l = await json<{ tratamento: string; titular_ref: string; vigente: boolean; versao_aviso: string }[]>(await chamar(consultor, 'GET', `${B}/consentimentos?ropa_id=tr-r1`));
    expect(l).toMatchObject([{ tratamento: 'Marketing', titular_ref: 'ref-001', vigente: true, versao_aviso: 'Aviso v3' }]);
    expect((await json<unknown[]>(await chamar(consultor, 'GET', `${B}/consentimentos?ropa_id=nao-existe`)))).toEqual([]);
  });

  it('valida: tratamento de outro projeto 404; sem versão do aviso, data futura, campo extra: 400', async () => {
    expect((await criar({ ropa_id: 'tr-r-o' })).status).toBe(404);
    for (const corpo of [{ versao_aviso: ' ' }, { obtido_em: dias(3) }, { obtido_em: '01/10/2026' }, { extra: 1 }, { titular_ref: '' }]) {
      expect((await criar(corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it('revogar não apaga: a prova fica como revogada; revogar de novo é 409; agente não revoga', async () => {
    const id = (await json<{ id: string }>(await criar({ titular_ref: 'ref-002' }))).id;
    expect((await chamar({}, 'POST', `${B}/consentimentos/${id}/revogar`, {}, { AGENTE })).status).toBe(403);
    expect((await chamar(consultor, 'POST', `${B}/consentimentos/${id}/revogar`)).status).toBe(200);
    expect((await chamar(consultor, 'POST', `${B}/consentimentos/${id}/revogar`)).status).toBe(409);
    const item = (await json<{ id: string; vigente: boolean; revogado_por: string }[]>(await chamar(consultor, 'GET', `${B}/consentimentos`))).find((x) => x.id === id)!;
    expect(item).toMatchObject({ vigente: false, revogado_por: 'cons@ness.lat' });
  });

  it('cliente lê mas não registra; apagar o tratamento leva o consentimento', async () => {
    expect((await criar({}, cliente)).status).toBe(403);
    expect((await chamar(cliente, 'GET', `${B}/consentimentos`)).status).toBe(200);
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('tr-r2', ?, 'Efêmero')`).bind(P).run();
    await criar({ ropa_id: 'tr-r2', titular_ref: 'ref-003' });
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'tr-r2'`).run();
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM consentimentos WHERE titular_ref = 'ref-003'`).first()).toEqual({ n: 0 });
  });
});
