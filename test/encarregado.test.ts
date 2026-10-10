import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';

/** Fatia 8: a visão do encarregado é só consulta. Funciona com tudo vazio e não mistura projetos. */
const db = () => env.DB;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Visao = {
  prioridades: { nivel: string; texto: string; tela: string }[];
  pedidos_titular: { abertos: number; atrasados: number; vencem_em_7_dias: number; sem_prazo: number; itens: { protocolo: string }[] };
  incidentes: { abertos: number; comunicacoes_atrasadas: number; comunicacoes_pendentes: number; sem_avaliacao_de_risco: number };
  tratamentos: { total: number; sem_base_legal: number; dpia_pendente: number; lia_pendente: number; sem_responsavel: number; com_terceiro_vencido: number };
  terceiros: { total: number; sem_tipo: number; pendentes: number; vencidos: number; reprovados: number };
  documentos: { revisao_vencida: number };
  evidencias: { vencidas: number; vencem_em_7_dias: number };
  lgpd: { carregada: boolean; total?: number; cobertos?: number; parciais?: number; lacunas?: number };
  prazos_legais: { nao_definidos: string[] };
};
let consultor: Record<string, string>, cliente: Record<string, string>;
const ver = async (h = consultor, projeto = 'e1') => json<Visao>(await chamar(h, `/api/v1/projects/${projeto}/encarregado`));

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('e1', 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), ('e2', 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', 'e1', 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('ge1', 'e1', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
  ]);
  await habilitarPrivacy('e1', 'e2');
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: 'e1' });
});

describe('projeto vazio', () => {
  it('tudo zerado, LGPD "não carregada", e a única prioridade é cadastrar os prazos legais', async () => {
    const v = await ver();
    expect(v.pedidos_titular).toMatchObject({ abertos: 0, atrasados: 0, vencem_em_7_dias: 0, sem_prazo: 0, itens: [] });
    expect(v.incidentes).toMatchObject({ abertos: 0, comunicacoes_atrasadas: 0, comunicacoes_pendentes: 0 });
    expect(v.tratamentos).toEqual({ total: 0, sem_base_legal: 0, dpia_pendente: 0, lia_pendente: 0, sem_responsavel: 0, com_terceiro_vencido: 0 });
    expect(v.terceiros).toMatchObject({ total: 0, vencidos: 0 });
    expect(v.evidencias).toEqual({ vencidas: 0, vencem_em_7_dias: 0 });
    expect(v.lgpd).toEqual({ carregada: false });
    expect(v.prazos_legais.nao_definidos).toEqual(['titular.resposta', 'incidente.comunicacao_anpd', 'incidente.comunicacao_titular']);
    expect(v.prioridades.map((p) => p.texto)).toEqual(['3 prazos legais ainda não cadastrados (os prazos ficam "não calculados")']);
  });
  it('o cliente lê a visão; projeto inexistente não devolve dado', async () => {
    expect((await chamar(cliente, '/api/v1/projects/e1/encarregado')).status).toBe(200);
    expect((await chamar(cliente, '/api/v1/projects/e2/encarregado')).status).toBe(403);
  });
});

describe('projeto com pendências', () => {
  it('conta e prioriza: pedidos atrasados, incidentes, tratamentos, terceiros, evidências e documentos', async () => {
    await db().batch([
      db().prepare(`INSERT INTO parametros_legais (chave, valor, unidade, fonte, revisado_em, revisado_por) VALUES ('titular.resposta', 15, 'dias_corridos', 'F', '2026-10-01', 'X'), ('incidente.comunicacao_anpd', 72, 'horas', 'F', '2026-10-01', 'X'), ('incidente.comunicacao_titular', 72, 'horas', 'F', '2026-10-01', 'X')`),
      // pedidos: um atrasado, um que vence em 3 dias, um sem prazo, um respondido (não conta)
      db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status, respondido_em) VALUES
        ('a1', 'e1', 'PT-1', 'acesso', '2026-09-01', ?1, 'recebido', NULL), ('a2', 'e1', 'PT-2', 'acesso', '2026-09-20', ?2, 'em_andamento', NULL),
        ('a3', 'e1', 'PT-3', 'acesso', '2026-09-20', NULL, 'recebido', NULL), ('a4', 'e1', 'PT-4', 'acesso', '2026-09-01', ?1, 'respondido', '2026-09-05')`).bind(dias(-5), dias(3)),
      // incidentes: um com comunicações atrasadas, um sem avaliação
      db().prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, prazo_anpd_em, prazo_titular_em, status, risco_titular) VALUES
        ('i1', 'e1', 'IN-1', 'Atrasado', '2026-09-01', ?1, ?1, 'avaliado', 'relevante'), ('i2', 'e1', 'IN-2', 'Sem risco avaliado', '2026-10-01', NULL, NULL, 'aberto', NULL)`).bind(dias(-2)),
      // tratamentos: sem base, com DPIA exigida sem DPIA, legítimo interesse sem LIA, sem responsável
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, dpia_required, owner) VALUES
        ('t1', 'e1', 'Sem base', NULL, 0, 'DPO'), ('t2', 'e1', 'DPIA', 'Execução de contrato', 1, 'DPO'), ('t3', 'e1', 'Fraude', 'Legítimo interesse', 0, 'DPO')`),
      // terceiros: um vencido, um nunca avaliado, ligado a t1
      db().prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('p1', 'e1', 'organizacao', 'Vencido', 'medio'), ('p2', 'e1', 'organizacao', 'Nunca', 'medio'), ('p3', 'e1', 'organizacao', 'Sem tipo', NULL)`),
      db().prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES ('av1', 'e1', 'p1', 'questionario', 'aprovado', '2020-01-01')`),
      db().prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v1', 'e1', 'p1', 'operador', 'tratamento', 't1')`),
      // evidências e documento
      db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate) VALUES ('ev1', 'e1', 'a.pdf', 'k', 'h', 'u', ?1), ('ev2', 'e1', 'b.pdf', 'k', 'h', 'u', ?2)`).bind(dias(-1), dias(4)),
      db().prepare(`INSERT INTO documentos (id, project_id, titulo, status, revisar_ate) VALUES ('d1', 'e1', 'Política', 'vigente', ?1)`).bind(dias(-10)),
    ]);
    const v = await ver();
    expect(v.pedidos_titular).toMatchObject({ abertos: 3, atrasados: 1, vencem_em_7_dias: 1, sem_prazo: 1 });
    expect(v.pedidos_titular.itens.map((i) => i.protocolo).sort()).toEqual(['PT-1', 'PT-2', 'PT-3']);
    expect(v.incidentes).toMatchObject({ abertos: 2, comunicacoes_atrasadas: 2, sem_avaliacao_de_risco: 1 });
    expect(v.tratamentos).toEqual({ total: 3, sem_base_legal: 1, dpia_pendente: 1, lia_pendente: 1, sem_responsavel: 0, com_terceiro_vencido: 1 });
    expect(v.terceiros).toEqual({ total: 3, sem_tipo: 1, pendentes: 1, vencidos: 1, reprovados: 0 });
    expect(v.evidencias).toEqual({ vencidas: 1, vencem_em_7_dias: 1 });
    expect(v.documentos.revisao_vencida).toBe(1);
    expect(v.prazos_legais.nao_definidos).toEqual([]);
    const textos = v.prioridades.map((p) => `${p.nivel}: ${p.texto}`);
    expect(textos).toContain('alta: 1 pedido do titular atrasado');
    expect(textos).toContain('alta: 2 comunicações de incidente atrasadas');
    expect(textos).toContain('alta: 1 incidente sem avaliação de risco');
    expect(textos).toContain('alta: 1 terceiro com avaliação vencida');
    expect(textos).toContain('alta: 1 tratamento exige DPIA e não tem');
    expect(textos).toContain('alta: 1 tratamento por legítimo interesse sem LIA');
    expect(textos).toContain('media: 1 pedido do titular vence em até 7 dias');
    expect(textos).toContain('media: 1 evidência vencida');
    expect(textos).toContain('media: 1 documento com revisão vencida');
    expect(textos).toContain('media: 1 terceiro nunca avaliado');
    expect(textos).toContain('media: 1 tratamento sem base legal');
    // a alta vem antes da média
    expect(v.prioridades.findIndex((p) => p.nivel === 'media')).toBeGreaterThan(v.prioridades.map((p) => p.nivel).lastIndexOf('alta') - 1);
  });

  it('a DPIA ligada e a LIA feita tiram as pendências; a base legal do catálogo conta como base', async () => {
    await db().batch([
      db().prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
      db().prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:ix', 'lgpd', 'art. 7, IX', 'Legítimo interesse')`),
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, base_legal_id, dpia_required, owner) VALUES ('t1', 'e1', 'Tudo certo', NULL, 'lgpd:ix', 1, 'DPO')`),
      db().prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name) VALUES ('dp1', 'e1', 't1', 'DPIA')`),
      db().prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id) VALUES ('l1', 'e1', 't1')`),
    ]);
    const v = await ver();
    expect(v.tratamentos).toMatchObject({ total: 1, sem_base_legal: 0, dpia_pendente: 0, lia_pendente: 0 });
    expect(v.lgpd).toMatchObject({ carregada: true, total: 1, lacunas: 1 }); // o catálogo da LGPD existe e o artigo ainda não tem cobertura
  });

  it('não mistura projetos', async () => {
    await db().batch([
      db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status) VALUES ('x1', 'e2', 'PT-9', 'acesso', '2026-09-01', ?1, 'recebido')`).bind(dias(-5)),
      db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate) VALUES ('x2', 'e2', 'z.pdf', 'k', 'h', 'u', ?1)`).bind(dias(-1)),
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('x3', 'e2', 'Do outro')`),
    ]);
    const v = await ver();
    expect(v.pedidos_titular.abertos).toBe(0);
    expect(v.evidencias.vencidas).toBe(0);
    expect(v.tratamentos.total).toBe(0);
  });
});
