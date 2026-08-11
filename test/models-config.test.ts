import { describe, it, expect } from 'vitest';
import { DEFAULT_MODELS, reasoningModel, gatewayModel, chatModel } from '../src/config/models';

// Config central de modelos (dívida #4): defaults preservam o comportamento
// anterior; `NISO_MODEL_*` no ambiente sobrepõe sem mudar código.
describe('config de modelos', () => {
  it('sem env, devolve os defaults (mesmos ids de antes)', () => {
    expect(reasoningModel(undefined)).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(gatewayModel(undefined)).toBe('openai/gpt-4.1');
    expect(chatModel(undefined)).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(reasoningModel({})).toBe(DEFAULT_MODELS.reasoning);
  });

  it('NISO_MODEL_* sobrepõe o default', () => {
    expect(reasoningModel({ NISO_MODEL_REASONING: '@cf/x/y' })).toBe('@cf/x/y');
    expect(gatewayModel({ NISO_MODEL_GATEWAY: 'openai/gpt-5' })).toBe('openai/gpt-5');
    expect(chatModel({ NISO_MODEL_CHAT: '@cf/z/w' })).toBe('@cf/z/w');
  });

  it('valor vazio no env cai no default (não vira string vazia)', () => {
    expect(reasoningModel({ NISO_MODEL_REASONING: '' })).toBe(DEFAULT_MODELS.reasoning);
  });
});
