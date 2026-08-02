import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { rateLimit } from '../helpers';

/**
 * Rate limit para as rotas caras.
 *
 * Antes disto o limite existia só no login. Tudo o que custa dinheiro ou banda
 * — inferência de IA, upload para o R2, export de CSV — ficava aberto a quem
 * tivesse uma sessão válida. Um cliente legítimo em loop derruba a cota de IA
 * de todos os outros.
 *
 * O limite é por USUÁRIO, não por IP: um escritório inteiro sai pelo mesmo IP,
 * e é o custo por conta que interessa. Chave de API entra como `apikey:<id>`,
 * então uma integração também é contada separadamente.
 */

type Regra = { teste: (p: string) => boolean; max: number; janelaSec: number; nome: string };

const REGRAS: Regra[] = [
  // Inferência custa por token e é o caminho mais caro do produto.
  { nome: 'ia', teste: p => /\/(chat|generate-policy|generate-policies-bulk|generate-soa|migrate-27701|evaluate|ingest)$/.test(p), max: 30, janelaSec: 3600 },
  // Upload: o teto de tamanho já existe por arquivo; isto limita o volume.
  { nome: 'upload', teste: p => p.endsWith('/upload'), max: 100, janelaSec: 3600 },
  // Export varre tabelas inteiras.
  { nome: 'export', teste: p => p.includes('/export/') || p.endsWith('/audit-pack'), max: 60, janelaSec: 3600 },
];

export const rateLimitMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const regra = REGRAS.find(r => r.teste(path));
  if (!regra) return next();

  // Roda depois do authMiddleware, então o usuário já está no contexto.
  const ator = c.get('user')?.id ?? c.get('user')?.email ?? 'anon';
  if (!(await rateLimit(c.env.SESSIONS, `${regra.nome}:${ator}`, regra.max, regra.janelaSec))) {
    return c.json(
      { error: 'Limite de requisições excedido. Tente novamente mais tarde.' },
      429,
      { 'Retry-After': String(regra.janelaSec) }
    );
  }
  return next();
});
