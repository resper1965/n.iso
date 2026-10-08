// Unidade de `renderDashboard` (src/views/dashboard.js). Dois caminhos reais:
// (1) onboarding do cliente — três cartões de fase cujo CTA muda conforme
// `S.clientAssessmentId`/`S.clientProposalId`; (2) visão do consultor — agrega
// leads/assessments/projects/controls da API (dublada) e calcula a taxa de
// conformidade (aprovados/total). A matemática de conformidade e a contagem de
// gaps é a lógica que mais importa aqui; o resto é layout. Os helpers de UI
// (renderStatCards/renderDataTable/renderStatusBadge) vêm de ui.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/dashboard.js';
import { S } from '../src/state.js';

function montaDom() {
  document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  return {
    c: document.getElementById('content'),
    h: document.getElementById('hdr'),
    a: document.getElementById('act'),
  };
}

beforeEach(() => {
  apiMock.mockReset();
  S.user = null;
  S.clientAssessmentId = null;
  S.clientProposalId = null;
  S.clientProposalStatus = null;
});

describe('renderDashboard — onboarding do cliente', () => {
  it('define título e ações e mostra "Aguardando Liberação" sem assessment', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'client' }; // sem client_project_id → caminho onboarding
    await window.renderDashboard(c, h, a);
    expect(h.textContent).toBe('Dashboard Executivo');
    expect(a.innerHTML).toContain('Novo Lead');
    expect(c.textContent).toContain('Bem-vindo ao n.iso');
    expect(c.textContent).toContain('Aguardando Liberação');
    // Não chamou API no caminho de onboarding.
    expect(apiMock).not.toHaveBeenCalled();
  });

  // O atalho mandava o id do assessment numa chave que o roteador não lia, e a rota pública exige
  // o token (e devolve 410 depois da venda). O questionário fica só no link público ?assessment=.
  it('assessment liberado: mostra "Em andamento", sem atalho para a tela self-service', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_admin' };
    S.clientAssessmentId = 'as-1';
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('Em andamento');
    expect(c.innerHTML).not.toContain('self-service');
  });

  it('marca a fase de assessment como Concluído quando já existe proposta', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_user' };
    S.clientAssessmentId = 'as-1';
    S.clientProposalId = 'pr-1';
    S.clientProposalStatus = 'Approved';
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('Concluído');
    // Proposta aprovada → badge "Assinado".
    expect(c.textContent).toContain('Assinado');
  });

  it('proposta em andamento: sem o link do gerador antigo (410), só o aviso de que o comercial envia', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_user' };
    S.clientAssessmentId = 'as-1';
    S.clientProposalId = 'pr-1';
    S.clientProposalStatus = 'Draft';
    await window.renderDashboard(c, h, a);
    expect(c.innerHTML).not.toContain('generate-proposal');
    expect(c.textContent).not.toContain('Revisar e Assinar');
    expect(c.textContent).toContain('Proposta enviada pelo comercial');
  });
});

describe('renderDashboard — visão do consultor', () => {
  it('agrega os contadores e calcula a taxa de conformidade', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'comercial' }; // comercial vê o funil → 4 chamadas
    // 4 chamadas na ordem: leads, assessments, projects, controls.
    apiMock
      .mockResolvedValueOnce([{ id: 'l1' }, { id: 'l2' }]) // leads
      .mockResolvedValueOnce([{ id: 'a1', client_name: 'ACME', status: 'completed' }]) // assessments
      .mockResolvedValueOnce([{ id: 'p1', project_name: 'Proj', progress: 40 }]) // projects
      .mockResolvedValueOnce([
        { status: 'APPROVED' },
        { status: 'implemented' },
        { status: 'draft' },
        { status: 'CONFORME' },
      ]); // controls: 3 de 4 conformes → 75%
    await window.renderDashboard(c, h, a);
    expect(apiMock).toHaveBeenCalledTimes(4);
    // 3/4 = 75% de conformidade aparece no burnup.
    expect(c.textContent).toContain('75%');
    // Controles implementados = 3, gaps = 1, total = 4.
    expect(c.textContent).toContain('Controles Implementados:');
    expect(c.innerHTML).toContain('3 de 4 controles');
    // Cartões de estatística renderizados.
    expect(c.textContent).toContain('Leads Ativos');
    expect(c.textContent).toContain('Taxa de Conformidade');
    // Tabelas com os dados dublados.
    expect(c.textContent).toContain('ACME');
    expect(c.textContent).toContain('Proj');
  });

  it('consultor não busca nem vê o funil de leads (área do comercial)', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'consultor' };
    // 3 chamadas: assessments, projects, controls — leads não é pedido.
    apiMock
      .mockResolvedValueOnce([{ id: 'a1', client_name: 'ACME', status: 'completed' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await window.renderDashboard(c, h, a);
    expect(apiMock).toHaveBeenCalledTimes(3);
    expect(apiMock.mock.calls.map((ch) => ch[1])).not.toContain('/api/v1/leads');
    expect(c.textContent).not.toContain('Leads Ativos');
    expect(c.textContent).toContain('ACME');
  });

  it('assume 93 controles quando a lista vem vazia (0% de conformidade)', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'consultor' };
    apiMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await window.renderDashboard(c, h, a);
    expect(c.innerHTML).toContain('0 de 93 controles');
    expect(c.textContent).toContain('Total do ISMS:');
  });

  it('mostra estado de erro quando a agregação falha', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'admin' };
    // Promise.all captura .catch por chamada; forçamos erro fora do catch fazendo
    // renderStatCards indisponível não é possível — em vez disso, rejeitamos a
    // Promise.all lançando na primeira sem catch interno: api rejeita e o .catch
    // devolve []. Para exercitar o catch externo, quebramos renderStatCards.
    const orig = window.renderStatCards;
    window.renderStatCards = () => { throw new Error('boom'); };
    apiMock.mockResolvedValue([]);
    await window.renderDashboard(c, h, a);
    expect(c.innerHTML).toContain('Erro ao carregar dashboard');
    window.renderStatCards = orig;
  });
});
