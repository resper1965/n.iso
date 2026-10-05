// Cartão "Agentes com acesso" (src/views/monitor.js): F3 do plano de fechamento. Dois defeitos reais:
// (1) o "último uso" só mudava se a página fosse recarregada, e isso fez parecer que o agente tinha
//     parado; (2) as datas vêm do banco em UTC e a tela as mostrava cruas ("20:49" quando eram 17:49).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/monitor.js';
import { S } from '../src/state.js';

const agente = (extra = {}) => ({
  id: 'a1', consultor: 'cons@ness.lat', cliente_mcp: 'Claude Code (localhost:1)',
  criado_em: '2026-09-30 12:53:43', ultimo_uso_em: '2026-09-30 22:58:05', expira_em: '2026-10-30 12:53:43', revogado_em: null,
  ...extra,
});

const cartao = () => document.getElementById('gov-agentes');
const montaCartao = () => { document.body.innerHTML = '<div id="gov-agentes"></div>'; };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T23:00:05Z')); // 2 min depois do último uso
  apiMock.mockReset();
  apiMock.mockResolvedValue([agente()]);
  S.user = { role: 'platform_admin', email: 'adm@ness.lat' };
  window.pararAgentesAoVivo?.();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  window.pararAgentesAoVivo?.();
  vi.useRealTimers();
});

describe('horário do cartão de agentes', () => {
  it('mostra o último uso no horário LOCAL, com "há quanto tempo"', async () => {
    montaCartao();
    await window.carregarAgentesDoProjeto('p1');
    const t = cartao().textContent;
    // o texto cru do banco ("2026-09-30 22:58") não pode aparecer
    expect(t).not.toContain('2026-09-30 22:58');
    expect(t).toMatch(/último uso \d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/);
    expect(t).toContain('há 2 min');
  });

  it('o relativo cresce com o tempo: minutos, horas e dias', async () => {
    montaCartao();
    vi.setSystemTime(new Date('2026-09-30T22:58:30Z'));
    await window.carregarAgentesDoProjeto('p1');
    expect(cartao().textContent).toContain('há menos de 1 min');
    vi.setSystemTime(new Date('2026-10-01T02:58:05Z'));
    await window.carregarAgentesDoProjeto('p1');
    expect(cartao().textContent).toContain('há 4 h');
    vi.setSystemTime(new Date('2026-10-04T22:58:05Z'));
    await window.carregarAgentesDoProjeto('p1');
    expect(cartao().textContent).toContain('há 4 d');
  });

  it('agente que nunca foi usado mostra "nunca", sem inventar data', async () => {
    montaCartao();
    apiMock.mockResolvedValue([agente({ ultimo_uso_em: null })]);
    await window.carregarAgentesDoProjeto('p1');
    expect(cartao().textContent).toMatch(/último uso nunca/);
  });
});

describe('atualização ao vivo', () => {
  it('recarrega o cartão a cada intervalo, sem precisar recarregar a página', async () => {
    montaCartao();
    window.agentesAoVivo('p1', 60000);
    expect(apiMock).not.toHaveBeenCalled(); // a primeira carga é de quem abre a tela
    await vi.advanceTimersByTimeAsync(60000);
    expect(apiMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(cartao().textContent).toContain('Agentes com acesso');
  });

  it('para sozinho quando a pessoa sai da tela (o cartão some do DOM)', async () => {
    montaCartao();
    window.agentesAoVivo('p1', 60000);
    expect(vi.getTimerCount()).toBe(1);
    document.body.innerHTML = '<div>outra tela</div>';
    await vi.advanceTimersByTimeAsync(60000);
    expect(apiMock).not.toHaveBeenCalled();
    // O que importa é o temporizador NÃO ficar vivo (vazamento): sem a parada automática, a API
    // também não seria chamada (a carga ignora o cartão ausente), e o teste passaria à toa.
    expect(vi.getTimerCount(), 'temporizador continuou vivo depois de sair da tela').toBe(0);
  });

  it('não consulta enquanto a aba está em segundo plano, e atualiza na hora ao voltar', async () => {
    montaCartao();
    window.agentesAoVivo('p1', 60000);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await vi.advanceTimersByTimeAsync(180000);
    expect(apiMock).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('chamar de novo (re-renderizar a tela) não empilha temporizadores', async () => {
    montaCartao();
    window.agentesAoVivo('p1', 60000);
    window.agentesAoVivo('p1', 60000);
    window.agentesAoVivo('p1', 60000);
    await vi.advanceTimersByTimeAsync(60000);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('falha de rede num ciclo NÃO apaga o cartão que já está na tela', async () => {
    montaCartao();
    await window.carregarAgentesDoProjeto('p1');
    const antes = cartao().textContent;
    expect(antes).toContain('cons@ness.lat');
    apiMock.mockRejectedValue(new Error('rede'));
    window.agentesAoVivo('p1', 60000);
    await vi.advanceTimersByTimeAsync(60000);
    expect(cartao().textContent).toBe(antes);
  });

  it('já a primeira carga com erro segue escondendo o cartão (sem rota ou sem permissão)', async () => {
    montaCartao();
    apiMock.mockRejectedValue(new Error('403'));
    await window.carregarAgentesDoProjeto('p1');
    expect(cartao().innerHTML).toBe('');
  });
});
