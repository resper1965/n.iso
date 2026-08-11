// Unit tests dos fluxos da jornada em `src/views/project.js` — questionário por
// fase (salvar), interpretação, dossiê e adequação de controles. Os módulos se
// penduram em `window`; importamos por efeito colateral e chamamos pelas globais,
// com `api()` dublado. Complementa os E2E (Playwright) no nível de unidade e
// tranca a lógica que mais dói se regredir (filtro de resposta vazia, corpo do
// PUT/POST, aterramento visual das sugestões).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/project.js';
import { S } from '../src/state.js';

function montaDom() {
  document.body.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" id="modal"><div id="modal-content"></div></div>
    </div>
    <div id="content"></div>`;
}
const modalText = () => document.getElementById('modal-content').textContent;
const ultimoToast = () => {
  const t = document.querySelectorAll('.toast');
  return t.length ? t[t.length - 1].textContent : null;
};

beforeEach(() => {
  montaDom();
  apiMock.mockReset();
});

describe('savePhaseQuestionnaire', () => {
  beforeEach(() => {
    S.phaseQuestions = { 1: [
      { key: 'p1_q1', type: 'select', question: 'Apetite?', options: ['Baixo', 'Alto'] },
      { key: 'p1_q2', type: 'text', question: 'Objetivos?' },
      { key: 'p1_q3', type: 'text', question: 'Vazia?' },
    ] };
    S.phaseAnswers = {};
    // Campos como o modal renderizaria.
    document.getElementById('content').innerHTML = `
      <select id="pq-p1_q1"><option value="Alto" selected>Alto</option></select>
      <textarea id="pq-p1_q2">Proteger receita</textarea>
      <textarea id="pq-p1_q3"></textarea>`;
  });

  it('envia o PUT com as respostas e reflete só as não-vazias em S.phaseAnswers', async () => {
    apiMock.mockResolvedValue({ ok: true, saved: 2 });
    await window.savePhaseQuestionnaire(1, 'proj-1');

    expect(apiMock).toHaveBeenCalledTimes(1);
    const [metodo, rota, corpo] = apiMock.mock.calls[0];
    expect(metodo).toBe('PUT');
    expect(rota).toBe('/api/v1/projects/proj-1/phase-answers');
    expect(corpo.phase_number).toBe(1);
    expect(corpo.answers.p1_q1).toBe('Alto');
    // O contador local não conta pergunta vazia (correção do F1).
    expect(S.phaseAnswers[1]).toEqual({ p1_q1: 'Alto', p1_q2: 'Proteger receita' });
    expect(S.phaseAnswers[1].p1_q3).toBeUndefined();
  });

  it('em falha do PUT, mostra toast de erro e não muda o estado', async () => {
    apiMock.mockRejectedValue(new Error('boom'));
    await window.savePhaseQuestionnaire(1, 'proj-1');
    expect(ultimoToast()).toMatch(/Falha ao salvar/i);
    expect(S.phaseAnswers[1]).toBeUndefined();
  });
});

describe('interpretPhaseAnswers', () => {
  it('renderiza prontidão, resumo e o ponto citando a pergunta', async () => {
    S.phaseQuestions = { 1: [{ key: 'p1_q1', type: 'select', question: 'Apetite de risco?', options: [] }] };
    apiMock.mockResolvedValue({
      titulo: 'Entrevista Executiva', clausula: '5.2', rotulo: 'revisar',
      cobertura: { total: 1, respondidas: 1, sem_resposta: [] },
      fonte: 'ia',
      interpretacao: {
        prontidao: 'critico', resumo: 'Base comprometida.',
        pontos: [{ severidade: 'alto', pergunta_key: 'p1_q1', observacao: 'Sem apetite declarado.' }],
        proximos_passos: ['Formalizar em ata.'],
      },
    });
    await window.interpretPhaseAnswers(1, 'proj-1');
    const txt = modalText();
    expect(txt).toContain('Crítico');
    expect(txt).toContain('Base comprometida');
    expect(txt).toContain('Apetite de risco?'); // pergunta resolvida pela key
    expect(txt).toContain('Sem apetite declarado');
    expect(txt).toContain('Formalizar em ata');
    expect(txt).toContain('1/1 perguntas respondidas');
  });

  it('sem interpretação (IA indisponível), mostra aviso e a cobertura', async () => {
    S.phaseQuestions = { 1: [] };
    apiMock.mockResolvedValue({
      titulo: 'X', clausula: '', rotulo: 'r',
      cobertura: { total: 4, respondidas: 0, sem_resposta: [{ pergunta_key: 'p1_q1', pergunta: 'Q?' }] },
      fonte: 'indisponivel', interpretacao: null,
    });
    await window.interpretPhaseAnswers(1, 'proj-1');
    expect(modalText()).toContain('indisponível');
    expect(modalText()).toContain('0/4 perguntas respondidas');
  });
});

describe('generateJourneyDossier / printDossie', () => {
  it('monta o dossiê com cabeçalho, seção e resposta consolidada', async () => {
    apiMock.mockResolvedValue({
      generated_at: new Date().toISOString(), rotulo: 'não é parecer',
      projeto: { client_name: 'ACME', scope: 'Nuvem', standards: 'ISO 27001', org_role: 'controller', status: 'Active' },
      resumo: { fases_iniciadas: 1, respondidas: 1 },
      secoes: [{
        phase: 1, titulo: 'Entrevista', clausula: '5.2', status: 'Em andamento',
        cobertura: { total: 2, respondidas: 1 },
        respostas: [
          { pergunta_key: 'p1_q1', pergunta: 'Apetite?', tipo: 'select', resposta: 'Alto' },
          { pergunta_key: 'p1_q2', pergunta: 'Objetivos?', tipo: 'text', resposta: null },
        ],
      }],
    });
    await window.generateJourneyDossier('proj-1');
    const txt = modalText();
    expect(txt).toContain('Dossiê da Jornada — ACME');
    expect(txt).toContain('Fase 1 — Entrevista');
    expect(txt).toContain('Alto');
    expect(txt).toContain('— sem resposta —');
    // O container imprimível existe para o printDossie.
    expect(document.getElementById('dossie-print')).not.toBeNull();
  });

  it('printDossie sem pop-up permitido cai em toast, não quebra', () => {
    // jsdom: window.open devolve null.
    vi.spyOn(window, 'open').mockReturnValue(null);
    document.getElementById('modal-content').innerHTML = '<div id="dossie-print">x</div>';
    window.printDossie();
    expect(ultimoToast()).toMatch(/pop-?ups/i);
  });
});

describe('suggestControlAdequacao / applyControlAdequacao', () => {
  it('renderiza a sugestão com antes→depois e aplica com o corpo correto', async () => {
    apiMock.mockResolvedValueOnce({
      titulo: 'Controles', clausula: 'A.5', rotulo: 'aprovar',
      fonte: 'ia',
      sugestoes: [{
        control_id: 'A.5.1', control_title: 'Políticas', status_atual: 'Missing', maturidade_atual: 0,
        sugestao_status: 'In Progress', sugestao_maturidade: 2, pergunta_key: 'p15_q1',
        justificativa: 'Política em elaboração.', origem: 'ia',
      }],
    });
    await window.suggestControlAdequacao(15, 'proj-1');
    const txt = modalText();
    expect(txt).toContain('A.5.1 — Políticas');
    expect(txt).toContain('status: In Progress');
    expect(txt).toContain('Política em elaboração');

    apiMock.mockResolvedValueOnce({ ok: true, control_id: 'A.5.1' });
    await window.applyControlAdequacao(0, 'proj-1');
    const [metodo, rota, corpo] = apiMock.mock.calls[1];
    expect(metodo).toBe('POST');
    expect(rota).toBe('/api/v1/projects/proj-1/control-adequacao/apply');
    expect(corpo).toMatchObject({ control_id: 'A.5.1', status: 'In Progress', maturity: 2, pergunta_key: 'p15_q1' });
    expect(modalText()).toContain('✓ Aplicado');
  });

  it('sem sugestões, mostra a mensagem vazia', async () => {
    apiMock.mockResolvedValue({ titulo: 'X', clausula: '', rotulo: 'r', fonte: 'indisponivel', sugestoes: [] });
    await window.suggestControlAdequacao(15, 'proj-1');
    expect(modalText()).toMatch(/Sem sugestões de adequação/i);
  });
});
