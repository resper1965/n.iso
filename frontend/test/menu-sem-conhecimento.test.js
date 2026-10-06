// A tela "Knowledge Base" saiu com a vetorização (2026-10-06): chamava rotas que
// nunca existiram no backend. Fixa que o menu e o roteador não a trazem de volta.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(), API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

const lido = (glob) => Object.values(glob)[0];
const html = lido(import.meta.glob('../login.html', { query: '?raw', import: 'default', eager: true }));
const router = lido(import.meta.glob('../src/router.js', { query: '?raw', import: 'default', eager: true }));

describe('menu sem a base de conhecimento', () => {
  it('login.html não tem o item de conhecimento', () => {
    expect(html).not.toContain('nav-knowledge');
    expect(html).not.toContain('Knowledge Base');
    expect(html).not.toContain(`data-args='["knowledge"]'`);
    // O chat continua no grupo Inteligência.
    expect(html).toContain('id="nav-ai"');
  });

  it('o roteador não despacha mais a view knowledge', () => {
    expect(router).not.toContain("'knowledge'");
    expect(router).not.toContain('renderKnowledge');
  });

  it('ai.js não pendura mais as funções de conhecimento em window', async () => {
    await import('../src/views/ai.js');
    expect(window.renderAIChat).toBeTypeOf('function');
    for (const f of ['renderKnowledge', 'searchKnowledge', 'openIngestModal', 'doIngest']) {
      expect(window[f], f).toBeUndefined();
    }
  });
});
