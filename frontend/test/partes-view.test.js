// Tela de Partes e departamentos (fatia 1.4): lista, importa, concilia e escapa o que vem do banco.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/partes.js';

const PARTES = [
  { id: 'pt1', tipo: 'pessoa', nome: 'Ana Exemplo', email: 'ana@exemplo.com.br', status: 'ativa' },
  { id: 'pt2', tipo: 'organizacao', nome: '<img src=x onerror=alert(1)>', email: null, status: 'inativa' },
];

function montar() {
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="h"></h1><div id="a"></div><div id="c"></div>';
  return [document.getElementById('c'), document.getElementById('h'), document.getElementById('a')];
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((m, url) => {
    if (url.endsWith('/partes')) return Promise.resolve(PARTES);
    if (url.endsWith('/departamentos')) return Promise.resolve([{ id: 'd1', nome: 'TI', status: 'ativo' }]);
    return Promise.resolve({});
  });
  window.render = vi.fn();
  S.activeProject = { id: 'p1' };
  S.user = { role: 'consultor' };
});

describe('tela de Partes', () => {
  it('lista partes e departamentos e escapa o nome', async () => {
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect(h.textContent).toBe('Partes e departamentos');
    expect(c.textContent).toContain('Ana Exemplo');
    expect(c.textContent).toContain('TI');
    expect(c.querySelector('img')).toBeNull(); // nome de parte não vira HTML
    expect(a.querySelectorAll('button').length).toBe(4);
  });

  it('papel só de leitura não vê os botões de escrita', async () => {
    S.user = { role: 'org_user' };
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect(a.innerHTML).toBe('');
  });

  it('importar chama a rota do projeto e avisa o resumo', async () => {
    montar();
    apiMock.mockImplementation(() => Promise.resolve({ ok: true, criadas: 4, reaproveitadas: 1, vinculos: 5 }));
    await window.importarPartes('p1');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/partes/importar');
    expect(document.querySelector('.toast').textContent).toContain('4 criadas');
  });

  it('conciliar mostra o que não casou e o que é ambíguo, sem interpretar HTML', async () => {
    montar();
    apiMock.mockImplementation(() => Promise.resolve({
      ok: true, casados: { risks: 2, itens: 1 },
      sem_correspondencia: [{ tabela: 'risks', coluna: 'owner', texto: '<b>TI</b>', n: 3 }],
      ambiguos: [{ tabela: 'risks', coluna: 'owner', texto: 'Duplicada', n: 1 }],
    }));
    await window.conciliarPartes('p1');
    const m = document.getElementById('modal-content').innerHTML;
    expect(m).toContain('<strong>3</strong>');
    expect(m).toContain('Sem correspondência (1)');
    expect(m).toContain('Ambíguos (1)');
    expect(m).not.toContain('<b>TI</b>');
  });

  it('criar parte manda tipo, nome e e-mail', async () => {
    const [c, h, a] = montar();
    window.openNovaParteModal('p1');
    document.getElementById('parte-tipo').value = 'organizacao';
    document.getElementById('parte-nome').value = '  Fornecedora Exemplo ';
    await window.criarParte('p1');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/partes', { tipo: 'organizacao', nome: 'Fornecedora Exemplo', email: null });
  });
});
