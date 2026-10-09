import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { situacaoDe, METODO_DO_TIPO } from '../src/services/terceiros';

/** Fatia 6: terceiros tipificados. O tipo define o método; a situação é derivada da validade; o DPA é um documento ligado. */
const P = 'tc-proj';
const OUTRO = 'tc-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let consultor: Record<string, string>, cliente: Record<string, string>;
const base = `/api/v1/projects/${P}/terceiros`;
type T = { id: string; terceiro_tipo: string | null; metodo: string | null; situacao: string; tratamentos: number; documentos: number; ultima_avaliacao: { resultado: string; valido_ate: string; metodo: string } | null };
const lista = async () => json<T[]>(await chamar(consultor, 'GET', base));
const achar = async (id: string) => (await lista()).find((t) => t.id === id)!;
const avaliar = (parte: string, corpo: object = {}) => chamar(consultor, 'POST', `${base}/${parte}/avaliacoes`, { resultado: 'aprovado', valido_ate: dias(90), ...corpo });

describe('situacaoDe', () => {
  it('sem avaliação é pendente; reprovada manda; vigente até o último dia; depois vencida', () => {
    expect(situacaoDe(null)).toBe('pendente');
    expect(situacaoDe({ resultado: 'reprovado', valido_ate: '2999-01-01' })).toBe('reprovada');
    expect(situacaoDe({ resultado: 'aprovado', valido_ate: '2026-10-09' }, '2026-10-09')).toBe('vigente');
    expect(situacaoDe({ resultado: 'com_ressalvas', valido_ate: '2026-10-09' }, '2026-10-10')).toBe('vencida');
  });
  it('o tipo define o método', () => {
    expect(METODO_DO_TIPO).toEqual({ grande_provedor: 'trust_center', medio: 'questionario', pequeno: 'questionario', critico: 'auditoria' });
  });
});

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('tc-a', ?1, 'organizacao', 'Nuvem Grande'), ('tc-b', ?1, 'organizacao', 'Fornecedor Médio'), ('tc-c', ?1, 'organizacao', 'Crítico SA'),
      ('tc-p', ?1, 'pessoa', 'Ana Pessoa'), ('tc-i', ?1, 'organizacao', 'Inativo'), ('tc-o', ?2, 'organizacao', 'Terceiro Alheio')`).bind(P, OUTRO),
    env.DB.prepare(`UPDATE partes SET status = 'inativa' WHERE id = 'tc-i'`),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('tc-d1', ?, 'DPA Nuvem'), ('tc-do', ?, 'Doc alheio')`).bind(P, OUTRO),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('lista e tipo', () => {
  it('lista só organização ativa do projeto, todas pendentes e sem tipo', async () => {
    const l = await lista();
    expect(l.map((t) => t.id).sort()).toEqual(['tc-a', 'tc-b', 'tc-c']);
    expect(l.every((t) => t.situacao === 'pendente' && t.terceiro_tipo === null && t.metodo === null && t.ultima_avaliacao === null)).toBe(true);
  });

  it('definir o tipo mostra o método; pessoa e parte de outro projeto não viram terceiro; valor fora da lista é 400; null limpa', async () => {
    expect((await chamar(consultor, 'PUT', `${base}/tc-a/tipo`, { terceiro_tipo: 'grande_provedor' })).status).toBe(200);
    expect(await achar('tc-a')).toMatchObject({ terceiro_tipo: 'grande_provedor', metodo: 'trust_center' });
    expect((await chamar(consultor, 'PUT', `${base}/tc-p/tipo`, { terceiro_tipo: 'medio' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base}/tc-o/tipo`, { terceiro_tipo: 'medio' })).status).toBe(404);
    expect((await chamar(consultor, 'PUT', `${base}/tc-a/tipo`, { terceiro_tipo: 'enorme' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base}/tc-a/tipo`, { terceiro_tipo: 'medio', extra: 1 })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base}/tc-b/tipo`, { terceiro_tipo: 'medio' })).status).toBe(200);
    expect((await chamar(consultor, 'PUT', `${base}/tc-c/tipo`, { terceiro_tipo: 'critico' })).status).toBe(200);
    expect((await chamar(consultor, 'PUT', `${base}/tc-c/tipo`, { terceiro_tipo: null })).status).toBe(200);
    expect((await achar('tc-c')).metodo).toBeNull();
    await chamar(consultor, 'PUT', `${base}/tc-c/tipo`, { terceiro_tipo: 'critico' });
  });

  it('papel só de leitura lê a lista mas não define tipo', async () => {
    expect((await chamar(cliente, 'GET', base)).status).toBe(200);
    expect((await chamar(cliente, 'PUT', `${base}/tc-a/tipo`, { terceiro_tipo: 'pequeno' })).status).toBe(403);
    expect((await achar('tc-a')).terceiro_tipo).toBe('grande_provedor');
  });
});

describe('avaliações', () => {
  it('o método vem do tipo, mesmo que o corpo mande outro (campo extra é 400); fica vigente com a validade', async () => {
    const r = await avaliar('tc-a', { evidencia_url: 'https://trust.exemplo.com/seguranca', observacao: 'SOC 2 vigente' });
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await json<{ metodo: string }>(r)).toMatchObject({ metodo: 'trust_center' });
    expect((await avaliar('tc-a', { metodo: 'auditoria' })).status).toBe(400);
    expect(await achar('tc-a')).toMatchObject({ situacao: 'vigente', ultima_avaliacao: { metodo: 'trust_center', valido_ate: dias(90) } });
    const crit = await avaliar('tc-c');
    expect(await json<{ metodo: string }>(crit)).toMatchObject({ metodo: 'auditoria' });
  });

  it('sem tipo definido, validade ausente, no passado ou impossível, resultado inválido e link perigoso: 400, e nada é gravado', async () => {
    const antes = (await env.DB.prepare('SELECT count(*) AS n FROM avaliacoes_terceiro').first<{ n: number }>())!.n;
    await chamar(consultor, 'PUT', `${base}/tc-b/tipo`, { terceiro_tipo: null });
    expect((await avaliar('tc-b')).status).toBe(400); // sem tipo
    await chamar(consultor, 'PUT', `${base}/tc-b/tipo`, { terceiro_tipo: 'medio' });
    for (const corpo of [{ valido_ate: dias(-1) }, { valido_ate: '31/12/2027' }, { valido_ate: '2027-02-30' }, { resultado: 'talvez' }, { evidencia_url: 'javascript:alert(1)' }, { evidencia_url: 'data:text/html,x' }]) {
      expect((await avaliar('tc-b', corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await chamar(consultor, 'POST', `${base}/tc-b/avaliacoes`, { resultado: 'aprovado' })).status).toBe(400); // sem validade
    expect((await env.DB.prepare('SELECT count(*) AS n FROM avaliacoes_terceiro').first<{ n: number }>())!.n).toBe(antes);
  });

  it('validade hoje vale; terceiro de outro projeto ou inexistente é 404', async () => {
    expect((await avaliar('tc-b', { valido_ate: dias(0) })).status).toBe(201);
    expect((await avaliar('tc-o')).status).toBe(404);
    expect((await avaliar('nao-existe')).status).toBe(404);
  });

  it('reprovada manda na situação; a avaliação nova substitui a leitura e o histórico fica', async () => {
    expect((await avaliar('tc-b', { resultado: 'reprovado' })).status).toBe(201);
    expect((await achar('tc-b')).situacao).toBe('reprovada');
    expect((await avaliar('tc-b', { resultado: 'com_ressalvas' })).status).toBe(201);
    expect((await achar('tc-b')).situacao).toBe('vigente');
    const ficha = await json<{ historico: { resultado: string }[] }>(await chamar(consultor, 'GET', `${base}/tc-b`));
    expect(ficha.historico.map((h) => h.resultado)).toEqual(['com_ressalvas', 'reprovado', 'aprovado']);
  });

  it('avaliação vencida deixa de ser vigente', async () => {
    await env.DB.prepare(`UPDATE avaliacoes_terceiro SET valido_ate = ? WHERE parte_id = 'tc-a'`).bind(dias(-1)).run();
    expect((await achar('tc-a')).situacao).toBe('vencida');
  });

  it('o cliente não registra avaliação', async () => {
    expect((await chamar(cliente, 'POST', `${base}/tc-a/avaliacoes`, { resultado: 'aprovado', valido_ate: dias(30) })).status).toBe(403);
  });
});

describe('documentos, tratamentos e ficha', () => {
  it('liga o DPA, não duplica o mesmo papel, recusa documento alheio, desliga', async () => {
    const lig = (doc: string, papel = 'dpa') => chamar(consultor, 'POST', `${base}/tc-a/documentos`, { documento_id: doc, papel });
    expect((await lig('tc-d1')).status).toBe(201);
    expect((await lig('tc-d1')).status).toBe(409);
    expect((await lig('tc-d1', 'contrato')).status).toBe(201);
    expect((await lig('tc-do')).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${base}/tc-o/documentos`, { documento_id: 'tc-d1' })).status).toBe(404);
    expect((await chamar(consultor, 'POST', `${base}/tc-a/documentos`, { documento_id: 'tc-d1', papel: 'brinde' })).status).toBe(400);
    expect((await achar('tc-a')).documentos).toBe(1);
    expect((await chamar(consultor, 'DELETE', `${base}/tc-a/documentos/tc-d1?papel=contrato`)).status).toBe(200);
    expect((await chamar(consultor, 'DELETE', `${base}/tc-a/documentos/tc-d1?papel=contrato`)).status).toBe(404);
    expect((await chamar(consultor, 'DELETE', `${base}/tc-a/documentos/tc-d1?papel=brinde`)).status).toBe(400);
    expect((await chamar(consultor, 'DELETE', `${base}/tc-a/documentos/tc-d1`)).status).toBe(200); // padrão dpa
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM documentos WHERE id = 'tc-d1'`).first()).toEqual({ n: 1 });
  });

  it('a ficha traz tratamentos afetados (partes ligadas ao registro) e suboperadores', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('tc-r1', ?, 'Folha de pagamento')`).bind(P),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('tc-v1', ?1, 'tc-a', 'operador', 'tratamento', 'tc-r1'), ('tc-v2', ?1, 'tc-b', 'suboperador', 'parte', 'tc-a')`).bind(P),
    ]);
    const ficha = await json<{ tratamentos: number; tratamentos_afetados: { id: string; finalidade: string }[]; suboperadores: { id: string; nome: string }[] }>(await chamar(consultor, 'GET', `${base}/tc-a`));
    expect(ficha.tratamentos).toBe(1);
    expect(ficha.tratamentos_afetados).toEqual([{ id: 'tc-r1', finalidade: 'Folha de pagamento' }]);
    expect(ficha.suboperadores).toEqual([{ id: 'tc-b', nome: 'Fornecedor Médio' }]);
  });

  it('ficha de terceiro alheio ou pessoa é 404', async () => {
    expect((await chamar(consultor, 'GET', `${base}/tc-o`)).status).toBe(404);
    expect((await chamar(consultor, 'GET', `${base}/tc-p`)).status).toBe(404);
  });
});

describe('sinalização no tratamento (spec 4.9)', () => {
  it('o tratamento mostra os terceiros ligados cuja avaliação mais recente venceu; vigente, pendente e reprovada não entram', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('tc-r9', ?, 'Cobrança')`).bind(P),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('tc-v', ?1, 'organizacao', 'Vigente', 'medio'), ('tc-x', ?1, 'organizacao', 'Vencido', 'medio'), ('tc-n', ?1, 'organizacao', 'Nunca avaliado', 'medio'), ('tc-r', ?1, 'organizacao', 'Reprovado antigo', 'medio')`).bind(P),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('tv1', ?1, 'tc-v', 'operador', 'tratamento', 'tc-r9'), ('tv2', ?1, 'tc-x', 'operador', 'tratamento', 'tc-r9'), ('tv3', ?1, 'tc-n', 'operador', 'tratamento', 'tc-r9'), ('tv4', ?1, 'tc-r', 'operador', 'tratamento', 'tc-r9')`).bind(P),
      env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, created_at) VALUES
        ('av-v', ?1, 'tc-v', 'questionario', 'aprovado', ?2, '2026-09-01 10:00:00'),
        ('av-x', ?1, 'tc-x', 'questionario', 'aprovado', '2020-01-01', '2026-09-01 10:00:00'),
        ('av-r', ?1, 'tc-r', 'questionario', 'reprovado', '2020-01-01', '2026-09-01 10:00:00')`).bind(P, dias(60)),
    ]);
    const l = await json<{ terceiros_com_avaliacao_vencida: { parte_id: string; nome: string }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/tc-r9/ligacoes`));
    expect(l.terceiros_com_avaliacao_vencida).toEqual([{ parte_id: 'tc-x', nome: 'Vencido' }]);
    // renovar a avaliação tira o sinal
    await env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, created_at) VALUES ('av-x2', ?, 'tc-x', 'questionario', 'aprovado', ?, '2026-10-01 10:00:00')`).bind(P, dias(60)).run();
    const l2 = await json<{ terceiros_com_avaliacao_vencida: unknown[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/tc-r9/ligacoes`));
    expect(l2.terceiros_com_avaliacao_vencida).toEqual([]);
  });
});
