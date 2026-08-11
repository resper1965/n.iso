// Config central dos modelos de IA. Antes cada agente/serviço embutia o id do
// modelo (`@cf/meta/llama-3.3-70b...`, `openai/gpt-4.1`, `@cf/meta/llama-3.1-8b`)
// espalhado — trocar de modelo exigia caçar string por arquivo, e a escolha
// divergia sem querer entre agentes. Aqui ficam os defaults num lugar só, com
// override por ambiente (o "toggle" sem redeploy de código).
//
// Papéis:
// - reasoning: análise/diagnóstico dos agentes (Workers AI, 70B). Capaz, on-CF.
// - gateway:   primário via AI Gateway (roteável), quando há AI_GATEWAY_TOKEN.
// - chat:      assistente/knowledge, mais barato e rápido (8B).
// (embeddings tem o seu próprio constante em services/embeddings.ts.)

export const DEFAULT_MODELS = {
  reasoning: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  gateway: 'openai/gpt-4.1',
  chat: '@cf/meta/llama-3.1-8b-instruct',
} as const;

// Override por ambiente: `NISO_MODEL_*` vence o default quando presente. Sem o
// binding, o comportamento é idêntico ao anterior (mesmos ids).
export function reasoningModel(env?: any): string {
  return env?.NISO_MODEL_REASONING || DEFAULT_MODELS.reasoning;
}
export function gatewayModel(env?: any): string {
  return env?.NISO_MODEL_GATEWAY || DEFAULT_MODELS.gateway;
}
export function chatModel(env?: any): string {
  return env?.NISO_MODEL_CHAT || DEFAULT_MODELS.chat;
}
