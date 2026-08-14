// Contrato de dados de `window.PHASE_PLAYBOOKS` (src/globals.js) e a invariante
// que ele mantém com as 6 jornadas do projeto (as faixas de fase renderizadas em
// src/views/project.js). Nada valida em runtime que TODA fase do projeto tem um
// playbook, nem que as jornadas cobrem exatamente as 41 fases sem buraco nem
// sobreposição — `refreshDoDDrawer`/`openDoDDrawer` leem `PHASE_PLAYBOOKS[phase]`
// direto e imprimem `undefined` na tela se a fase não existir. Estes testes são a
// barreira que falta.
//
// globals.js chama `window.initApp()` no topo do módulo, que toca o DOM
// (`login-overlay`). Montamos os elementos ANTES do import dinâmico para o módulo
// avaliar sem estourar.
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ({})), API_BASE: 'http://localhost' }));

let PHASE_PLAYBOOKS;

beforeAll(async () => {
  // globals.js instala um MutationObserver global que nunca é desconectado e, no
  // teardown do jsdom, referencia `document` já removido → erro solto. Um observer
  // no-op antes do import neutraliza esse efeito colateral.
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  // initApp() sem token só remove a classe hidden do overlay; o elemento precisa
  // existir para o módulo não lançar TypeError na avaliação.
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
  PHASE_PLAYBOOKS = window.PHASE_PLAYBOOKS;
});

// As 6 jornadas exatamente como project.js as define (faixas [ini, fim]).
const JOURNEYS = [
  { name: 'Jornada 1: Mobilização e Diagnóstico', range: [0, 6] },
  { name: 'Jornada 2: Mapeamento e Riscos', range: [7, 13] },
  { name: 'Jornada 3: Implementação SGSI (ISO 27001)', range: [14, 20] },
  { name: 'Jornada 4: Implementação SGPI (ISO 27701)', range: [21, 28] },
  { name: 'Jornada 5: Operação e Auditoria', range: [29, 33] },
  { name: 'Jornada 6: Certificação Oficial', range: [34, 40] },
];

describe('PHASE_PLAYBOOKS — contrato de dados', () => {
  it('tem exatamente 41 fases (0 a 40)', () => {
    const keys = Object.keys(PHASE_PLAYBOOKS).map(Number).sort((a, b) => a - b);
    expect(keys.length).toBe(41);
    expect(keys[0]).toBe(0);
    expect(keys[keys.length - 1]).toBe(40);
  });

  it('as chaves são contíguas — nenhuma fase pulada entre 0 e 40', () => {
    const buracos = [];
    for (let i = 0; i <= 40; i++) {
      if (!Object.prototype.hasOwnProperty.call(PHASE_PLAYBOOKS, String(i))) buracos.push(i);
    }
    expect(buracos).toEqual([]);
  });

  it('toda fase tem obj e guideline não vazios', () => {
    const infratores = [];
    for (const [k, v] of Object.entries(PHASE_PLAYBOOKS)) {
      if (typeof v.obj !== 'string' || v.obj.trim() === '') infratores.push(`${k}.obj`);
      if (typeof v.guideline !== 'string' || v.guideline.trim() === '') infratores.push(`${k}.guideline`);
    }
    expect(infratores).toEqual([]);
  });

  it('nenhum objetivo se repete entre fases (cada fase é distinta)', () => {
    const objs = Object.values(PHASE_PLAYBOOKS).map((v) => v.obj);
    const unicos = new Set(objs);
    expect(unicos.size).toBe(objs.length);
  });
});

describe('PHASE_PLAYBOOKS × Jornadas — invariante de cobertura', () => {
  it('as 6 jornadas cobrem exatamente 0..40, contíguas e sem sobreposição', () => {
    // As faixas encostam: fim[i]+1 === ini[i+1]; começam em 0; terminam em 40.
    expect(JOURNEYS[0].range[0]).toBe(0);
    expect(JOURNEYS[JOURNEYS.length - 1].range[1]).toBe(40);
    for (let i = 1; i < JOURNEYS.length; i++) {
      expect(JOURNEYS[i].range[0]).toBe(JOURNEYS[i - 1].range[1] + 1);
    }
  });

  it('toda fase de toda jornada tem um playbook correspondente com título (obj)', () => {
    const semPlaybook = [];
    for (const j of JOURNEYS) {
      for (let ph = j.range[0]; ph <= j.range[1]; ph++) {
        const pb = PHASE_PLAYBOOKS[ph];
        if (!pb || typeof pb.obj !== 'string' || pb.obj.trim() === '') {
          semPlaybook.push(`${j.name} → fase ${ph}`);
        }
      }
    }
    expect(semPlaybook).toEqual([]);
  });

  it('a união das faixas das jornadas é idêntica ao conjunto de chaves do playbook', () => {
    const cobertas = new Set();
    for (const j of JOURNEYS) {
      for (let ph = j.range[0]; ph <= j.range[1]; ph++) cobertas.add(ph);
    }
    const chaves = new Set(Object.keys(PHASE_PLAYBOOKS).map(Number));
    expect([...cobertas].sort((a, b) => a - b)).toEqual([...chaves].sort((a, b) => a - b));
  });
});
