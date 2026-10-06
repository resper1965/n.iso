// O botão "IA" da Central de Evidências apontava para uma função que não existia. A rota
// POST /api/v1/evidence/:id/evaluate exige o texto do documento, então o clique abre um
// modal para colar o texto; o resultado volta escapado.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/ui.js';
import '../src/views/compliance.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
});

describe('evaluateEvidenceAI', () => {
  it('existe e abre o modal com o campo de texto', () => {
    expect(typeof window.evaluateEvidenceAI).toBe('function');
    window.evaluateEvidenceAI('ev-1');
    expect(document.getElementById('eval-text')).not.toBeNull();
    expect(document.querySelector('[data-action="enviarAvaliacaoEvidencia"]').getAttribute('data-args')).toContain('ev-1');
  });

  it('sem texto nenhuma chamada sai', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    window.evaluateEvidenceAI('ev-1');
    await window.enviarAvaliacaoEvidencia('ev-1');
    expect(f).not.toHaveBeenCalled();
  });

  it('chama a rota com o id e o texto e mostra o resultado escapado', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, evaluation_status: 'partial', evaluation_markdown: '<img src=x onerror=alert(1)> PARCIAL' }), { headers: { 'Content-Type': 'application/json' } }));
    window.evaluateEvidenceAI('ev-1');
    document.getElementById('eval-text').value = 'conteúdo do documento';
    await window.enviarAvaliacaoEvidencia('ev-1');
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/evidence\/ev-1\/evaluate$/);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ text: 'conteúdo do documento' });
    const r = document.getElementById('eval-result');
    expect(r.querySelector('img')).toBeNull();
    expect(r.textContent).toContain('PARCIAL');
  });
});
