import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, seedTwoProjects } from './helpers/d1';

/**
 * Isolamento multi-tenant nas rotas de PROJETO dos routers montados na raiz
 * (`risks`, `policies`, `integrations`).
 *
 * Estas rotas são protegidas pelo `projectAccessMiddleware`, registrado em
 * `/api/v1/projects/:projectId/*` — mas elas se declaravam com `:id`. A
 * proteção funcionava porque o Hono resolve o parâmetro por handler, então o
 * middleware lia o `:projectId` do SEU próprio padrão. Nada no repositório
 * travava isso: nenhum teste cobria estas rotas cross-tenant, e o
 * `idor-tenant.test.ts` cobre só os routers de topo (`/api/v1/<coisa>/:id`).
 * Uma rota nova com o nome errado — ou uma mudança na resolução de parâmetro do
 * Hono — abriria o buraco em silêncio.
 *
 * Cada caso tem as duas metades, como o resto da suíte de isolamento:
 *   - ATAQUE: ator do projeto A sobre rota do projeto B → 403;
 *   - LEGÍTIMO: o mesmo ator no PRÓPRIO projeto → qualquer coisa menos 403.
 * Sem a segunda metade não dá para distinguir "fechou o buraco" de "trancou a
 * porta para todos".
 */

const A = 'proj-a';
const B = 'proj-b';

// As rotas de projeto dos três routers. O corpo é o mínimo que passa pela
// validação de cada handler: o teste é sobre QUEM pode entrar, não sobre o
// que o handler faz depois.
//
// `/api/v1/projects/:projectId/api-keys` fica de fora de propósito: o handler
// exige `platform_admin` antes de qualquer coisa, então a metade legítima
// responderia 403 por PAPEL, não por tenant — o par deixaria de provar
// isolamento. Um ator platform_admin também não serve: staff atravessa a
// checagem de tenant por desenho.
const ROTAS: Array<[metodo: string, caminho: (p: string) => string, corpo?: unknown]> = [
  ['GET', p => `/api/v1/projects/${p}/risks`],
  ['GET', p => `/api/v1/projects/${p}/risks/history`],
  ['POST', p => `/api/v1/projects/${p}/risks`, { asset: 'Ativo', threat: 'Ameaça', impact: 3, probability: 3 }],
  ['GET', p => `/api/v1/projects/${p}/webhooks`],
  ['GET', p => `/api/v1/projects/${p}/export/risks`],
  ['GET', p => `/api/v1/projects/${p}/export/audit-log`],
  ['GET', p => `/api/v1/projects/${p}/controls/ctl-1/versions`],
];

function testEnv() {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) } } as any;
}

describe('IDOR cross-tenant nas rotas de projeto (risks/policies/integrations)', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await seedTwoProjects();
    // Ator preso ao projeto A: papel de cliente, não de staff — staff
    // (consultor/platform_admin) atravessa a checagem por desenho.
    headers = {
      ...(await sessionFor({ id: 'u-adm-a', email: 'adm@a.com', role: 'org_admin', client_project_id: A })),
      'Content-Type': 'application/json',
    };
  });

  async function req(caminho: string, metodo: string, corpo?: unknown) {
    return worker.fetch(
      new Request(`http://localhost${caminho}`, {
        method: metodo,
        headers,
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      }),
      testEnv()
    );
  }

  for (const [metodo, caminho, corpo] of ROTAS) {
    it(`${metodo} ${caminho(':projectId')} nega o projeto alheio`, async () => {
      const res = await req(caminho(B), metodo, corpo);
      expect(res.status).toBe(403);
    });

    it(`${metodo} ${caminho(':projectId')} não bloqueia o próprio projeto`, async () => {
      const res = await req(caminho(A), metodo, corpo);
      expect(res.status).not.toBe(403);
    });
  }
});
