// Governança: quem edita/designa (alinhado ao servidor), aviso de autoridade de assinatura e contato do aceite.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ({})), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/monitor.js';

const CARGO_ACEITE = 'Contato do cliente (aceite da proposta)';
const m = (id, job_title, extra = {}) => ({ id, name: 'N' + id, email: id + '@c.com', role_category: 'executivo', job_title, is_primary: 0, ...extra });
const modal = () => {
  document.body.innerHTML = '<div id="gov-modal-body"></div>';
  window.renderGovernanceModalContent('p1', []);
};
const tela = (papel, membros) => {
  S.user = { role: papel, email: 'x@n.com' };
  document.body.innerHTML = window.renderProjectGovernance(membros, 'p1');
  return document.body.textContent;
};

describe('consultoria_admin na governança', () => {
  it('vê Gerenciar governança e pode designar consultor', () => {
    tela('consultoria_admin', [m('a', 'CEO')]);
    expect(document.querySelector('[data-action="openGovernanceModal"]')).not.toBeNull();
    S.user = { role: 'consultoria_admin' };
    modal();
    expect(document.body.innerHTML).toContain('value="consultor"');
    expect(document.body.textContent).not.toContain('Designar consultor é feito');
    expect(document.body.textContent).toContain('Cargo / Função');
  });
  it('consultor edita mas não designa consultor, e o texto diz quem pode', () => {
    S.user = { role: 'consultor' };
    modal();
    expect(document.body.innerHTML).not.toContain('value="consultor"');
    expect(document.body.textContent).toContain('administrador do cliente ou da consultoria');
  });
});

describe('autoridade de assinatura', () => {
  it('a ajuda do Cargo traz as palavras que valem', () => {
    S.user = { role: 'platform_admin' };
    modal();
    const t = document.body.textContent;
    expect(t).toContain("'CEO', 'Diretor(a)' ou 'Executivo' assina como Direção");
    expect(t).toContain("'Líder SGSI', 'CISO' ou 'DPO' assina como Líder SGSI");
  });
  it('avisa Direção e Líder SGSI ausentes, e o aviso fala do cargo, não do checkbox', () => {
    const t = tela('org_admin', [m('a', 'Analista')]);
    expect(t).toContain('Nenhum membro tem cargo de Direção');
    expect(t).toContain('Nenhum membro tem cargo de Líder SGSI');
    expect(t).not.toMatch(/Marque o responsável/);
  });
  it('sem aviso quando os dois existem; avisa só o que falta', () => {
    expect(tela('org_admin', [m('a', 'CEO'), m('b', 'DPO')])).not.toContain('Nenhum membro tem cargo');
    const t = tela('org_admin', [m('a', 'Diretora financeira')]);
    expect(t).not.toContain('cargo de Direção');
    expect(t).toContain('cargo de Líder SGSI');
  });
  it('o texto do Líder não designado aponta para o cargo', () => {
    expect(tela('org_admin', [m('a', 'CEO')])).toContain('cargo');
  });
});

describe('contato do aceite', () => {
  it('mostra que o e-mail não foi verificado, só nesse cartão', () => {
    const t = tela('org_admin', [m('a', CARGO_ACEITE), m('b', 'CEO')]);
    expect(t.match(/e-mail informado no aceite da proposta, não verificado/g)).toHaveLength(1);
  });
  it('escapa o texto vindo do banco', () => {
    tela('org_admin', [m('a', '<img src=x onerror=alert(1)>')]);
    expect(document.querySelector('img')).toBeNull();
  });
});
