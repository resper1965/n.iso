// Gestão de usuários e API keys (src/views/admin.js). O menu por papel e os papéis oferecidos no
// modal já são cobertos por papeis-admin.test.js; aqui: a listagem (contagens, rótulos, escape,
// vazio, erro), exclusão, salvar usuário (validação e payload) e o ciclo da API key (acesso
// restrito a platform_admin, revogar só se ativa, expiração, chave exibida uma vez).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock, renderMock } = vi.hoisted(() => ({ apiMock: vi.fn(), renderMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ render: renderMock, navigate: vi.fn() }));

import '../src/ui.js';
import '../src/views/admin.js';
import { S } from '../src/state.js';

const $ = (id) => document.getElementById(id);
const dom = () => {
  document.body.innerHTML =
    '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="c"></div><h1 id="h"></h1><div id="a"></div>';
  return [$('c'), $('h'), $('a')];
};

beforeEach(() => {
  apiMock.mockReset();
  renderMock.mockReset();
  window.loadProjects = vi.fn(async () => {});
  S.user = { role: 'platform_admin', email: 'root@exemplo.test' };
  S.projects = [{ id: 'p1', client_name: 'Cliente Um' }];
  S.activeProject = null;
  S.apiKeysProjectId = null;
});

const USERS = [
  { id: 'u1', name: 'Ana <b id="nm">x</b>', email: 'ana@exemplo.test', role: 'platform_admin' },
  { id: 'u2', name: 'Caio', email: 'caio@exemplo.test', role: 'org_admin', client_project_id: 'p1' },
  { id: 'u3', name: 'Bia', email: 'bia@exemplo.test', role: 'org_user', client_project_id: 'pX' },
  { id: 'u4', name: 'Duda', email: 'duda@exemplo.test', role: 'consultant' },
];

describe('renderUsers', () => {
  it('lista com rótulo por papel, projeto resolvido (ou o id) e nome escapado', async () => {
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/users');
    expect(a.querySelector('[data-action="openUserModal"]')).toBeTruthy();
    expect($('nm')).toBeNull();
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(4);
    expect(linhas[0].textContent).toContain('Admin Plataforma');
    expect(linhas[1].textContent).toContain('Gestor Cliente');
    expect(linhas[1].textContent).toContain('Cliente Um');
    expect(linhas[2].textContent).toContain('Colaborador Cliente');
    expect(linhas[2].textContent).toContain('pX');
    expect(linhas[3].textContent).toContain('Consultor');
    expect(linhas[1].querySelector('[data-action="deleteUser"]').dataset.args).toBe('["u2"]');
    expect(linhas[1].querySelector('[data-action="openUserModal"]').dataset.args).toBe('["u2"]');
  });

  it('estado vazio e resposta que não é array', async () => {
    apiMock.mockResolvedValue({ erro: 'x' });
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.textContent).toMatch(/Nenhum usuário cadastrado/);
    expect(c.querySelector('table')).toBeNull();
  });

  it('carrega projetos quando S.projects está vazio', async () => {
    S.projects = [];
    apiMock.mockResolvedValue([]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(window.loadProjects).toHaveBeenCalledOnce();
  });

  it('falha ao carregar projetos: mensagem de erro escapada', async () => {
    S.projects = [];
    window.loadProjects = vi.fn(async () => { throw new Error('<i id="e">boom</i>'); });
    apiMock.mockResolvedValue([]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.textContent).toContain('Erro ao carregar usuários: <i id="e">boom</i>');
    expect($('e')).toBeNull();
  });

  // BUG (admin.js:136): "Administradores & Consultores" só conta platform_admin/admin/consultor;
  // consultoria_admin, comercial e o legado `consultant` caem em "Usuários de Clientes".
  it('equipe da consultoria não é contada como usuário de cliente (admin.js:136)', async () => {
    apiMock.mockResolvedValue([
      { id: 'a', name: 'A', email: 'a@x.test', role: 'consultoria_admin' },
      { id: 'b', name: 'B', email: 'b@x.test', role: 'comercial' },
      { id: 'c', name: 'C', email: 'c@x.test', role: 'consultant' },
    ]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    const txt = c.textContent;
    expect(txt).toMatch(/Usuários de Clientes\s*0/);
  });

  // BUG (admin.js:147-153): consultoria_admin não tem rótulo e aparece como "consultoria_admin" cru.
  it.fails('consultoria_admin tem rótulo legível (admin.js:147)', async () => {
    apiMock.mockResolvedValue([{ id: 'a', name: 'A', email: 'a@x.test', role: 'consultoria_admin' }]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.querySelector('tbody tr').textContent).not.toContain('consultoria_admin');
  });
});

describe('deleteUser', () => {
  it('sem confirmação não chama a API', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    await window.deleteUser('u1');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('confirmado: DELETE do id certo, toast e re-render', async () => {
    dom();
    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.mockResolvedValue({});
    await window.deleteUser('u7');
    expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/users/u7');
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('falha: não re-renderiza e mostra o erro', async () => {
    dom();
    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.mockRejectedValue(new Error('Proibido'));
    await window.deleteUser('u7');
    expect(renderMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Erro ao excluir usuário: Proibido');
  });
});

describe('saveUser', () => {
  function formulario({ name = 'Ana', email = 'ana@exemplo.test', password = 'senha-forte', role = 'org_user', projeto = '' } = {}) {
    dom();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<input id="user-m-name" value="${name}"><input id="user-m-email" value="${email}">
       <input id="user-m-password" value="${password}">
       <select id="user-m-role"><option value="${role}" selected>${role}</option></select>
       <select id="user-m-project"><option value="${projeto}" selected>${projeto}</option></select>`,
    );
  }

  it.each([
    ['sem nome', { name: '' }],
    ['sem e-mail', { email: '' }],
    ['sem papel', { role: '' }],
  ])('%s: não chama a API', async (_t, campos) => {
    formulario(campos);
    await window.saveUser('');
    expect(apiMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Preencha os campos obrigatórios');
  });

  it('usuário novo exige senha', async () => {
    formulario({ password: '' });
    await window.saveUser('');
    expect(apiMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('A senha é obrigatória para novos usuários.');
  });

  it('criar: POST com projeto nulo quando vazio, e re-render', async () => {
    formulario({ projeto: '' });
    apiMock.mockResolvedValue({});
    await window.saveUser('');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/users', {
      name: 'Ana', email: 'ana@exemplo.test', role: 'org_user', client_project_id: null, password: 'senha-forte',
    });
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('editar com senha em branco: PUT sem o campo password', async () => {
    formulario({ password: '', projeto: 'p1' });
    apiMock.mockResolvedValue({});
    await window.saveUser('u2');
    const [metodo, url, corpo] = apiMock.mock.calls[0];
    expect([metodo, url]).toEqual(['PUT', '/api/v1/users/u2']);
    expect(corpo).not.toHaveProperty('password');
    expect(corpo.client_project_id).toBe('p1');
  });

  it('erro do servidor: mostra e não re-renderiza', async () => {
    formulario();
    apiMock.mockRejectedValue(new Error('E-mail já existe'));
    await window.saveUser('');
    expect(renderMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Erro ao salvar usuário: E-mail já existe');
  });
});

describe('toggleUserProjectSelect', () => {
  function grupo() {
    dom();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="user-m-project-group"><select id="user-m-project"><option value="">-</option><option value="p1" selected>p1</option></select></div>',
    );
  }

  it('gestor de plataforma + papel de cliente: mostra o projeto', () => {
    grupo();
    window.toggleUserProjectSelect('org_admin');
    expect($('user-m-project-group').style.display).toBe('block');
  });

  it('papel de equipe: esconde e zera o projeto escolhido', () => {
    grupo();
    window.toggleUserProjectSelect('consultor');
    expect($('user-m-project-group').style.display).toBe('none');
    expect($('user-m-project').value).toBe('');
  });

  it('quem não é gestor do sistema nunca vê o seletor', () => {
    grupo();
    S.user = { role: 'org_admin' };
    window.toggleUserProjectSelect('org_user');
    expect($('user-m-project-group').style.display).toBe('none');
  });
});

describe('renderApiKeys', () => {
  it.each(['consultoria_admin', 'comercial', 'org_admin', 'consultor'])('%s: acesso restrito, sem chamar a API', async (papel) => {
    S.user = { role: papel };
    const [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(c.textContent).toBe('Acesso restrito ao Platform Admin.');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('platform_admin: seleciona o primeiro projeto, lista chaves e só oferece revogar a ativa', async () => {
    apiMock.mockResolvedValue({ keys: [
      { id: 'k1', name: '<b id="kn">x</b>', status: 'Active', permissions: 'consultant', created_at: '2026-10-01T10:00:00Z' },
      { id: 'k2', name: 'velha', status: 'Revoked', last_used_at: '2026-09-01' },
    ] });
    const [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(S.apiKeysProjectId).toBe('p1');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/api-keys');
    expect($('kn')).toBeNull();
    const linhas = c.querySelectorAll('tbody tr');
    expect(linhas).toHaveLength(2);
    expect(linhas[0].querySelector('[data-action="revokeApiKey"]').dataset.args).toBe('["k1"]');
    expect(linhas[0].textContent).toContain('2026-10-01');
    expect(linhas[1].querySelector('[data-action="revokeApiKey"]')).toBeNull();
    expect(linhas[1].textContent).toContain('2026-09-01');
  });

  it('sem chaves: linha de vazio; sem projetos: "Nova Chave" desabilitado e nenhuma chamada de chaves', async () => {
    apiMock.mockResolvedValue([]);
    let [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(c.textContent).toMatch(/Nenhuma chave para este projeto/);

    apiMock.mockReset();
    S.projects = [];
    S.apiKeysProjectId = null;
    [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(apiMock).not.toHaveBeenCalled();
    expect(c.querySelector('[data-action="openApiKeyModal"]').disabled).toBe(true);
  });

  it('erro da API não vira "sem chaves": mostra o erro', async () => {
    apiMock.mockRejectedValue(new Error('403 Forbidden'));
    const [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(c.textContent).toContain('Erro ao carregar API keys: 403 Forbidden');
    expect(c.querySelector('table')).toBeNull();
  });
});

describe('criar e revogar chave', () => {
  function abreModal() {
    dom();
    S.apiKeysProjectId = 'p1';
    window.openApiKeyModal();
  }

  it('sem projeto selecionado não abre o modal', () => {
    dom();
    S.apiKeysProjectId = null;
    window.openApiKeyModal();
    expect($('apikey-name')).toBeNull();
  });

  it('nome obrigatório', async () => {
    abreModal();
    $('apikey-name').value = '  ';
    await window.createApiKey();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('padrão de 90 dias: expires_at ~ agora + 90d, papel escolhido', async () => {
    abreModal();
    $('apikey-name').value = ' agente-x ';
    $('apikey-perm').value = 'auditor';
    apiMock.mockResolvedValue({ key: 'niso_abc<b id="kk">' });
    const antes = Date.now();
    await window.createApiKey();
    const [metodo, url, corpo] = apiMock.mock.calls[0];
    expect([metodo, url]).toEqual(['POST', '/api/v1/projects/p1/api-keys']);
    expect(corpo.name).toBe('agente-x');
    expect(corpo.permissions).toBe('auditor');
    const dias = (new Date(corpo.expires_at).getTime() - antes) / 86400000;
    expect(dias).toBeGreaterThan(89.99);
    expect(dias).toBeLessThan(90.01);
  });

  it('"sem expiração" não envia expires_at; a chave aparece escapada num campo somente leitura', async () => {
    abreModal();
    $('apikey-name').value = 'k';
    $('apikey-exp').value = '';
    apiMock.mockResolvedValue({ key: 'niso_abc"><b id="kk">' });
    await window.createApiKey();
    expect(apiMock.mock.calls[0][2]).not.toHaveProperty('expires_at');
    expect($('apikey-plain').value).toBe('niso_abc"><b id="kk">');
    expect($('apikey-plain').readOnly).toBe(true);
    expect($('kk')).toBeNull();
  });

  it('falha ao criar: nenhuma chave exibida', async () => {
    abreModal();
    $('apikey-name').value = 'k';
    apiMock.mockRejectedValue(new Error('limite'));
    await window.createApiKey();
    expect($('apikey-plain')).toBeNull();
    expect(document.body.textContent).toContain('Erro ao criar chave: limite');
  });

  it('revogar: só com confirmação, DELETE na rota certa e re-render', async () => {
    dom();
    vi.stubGlobal('confirm', vi.fn(() => false));
    await window.revokeApiKey('k1');
    expect(apiMock).not.toHaveBeenCalled();

    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.mockResolvedValue({});
    await window.revokeApiKey('k1');
    expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/api-keys/k1');
    expect(renderMock).toHaveBeenCalledOnce();
  });
});
