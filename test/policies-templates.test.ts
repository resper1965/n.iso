import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';
import { PolicyGeneratorService } from '../src/services/policy-generator';

/**
 * Templates de política (`GET /api/v1/policies/templates[/:nome]`).
 *
 * Duas coisas que ninguém verificava, e que só ficaram verificáveis quando o
 * `wrangler.test.jsonc` passou a declarar o binding ASSETS:
 *
 * 1. **O catálogo não mente.** `listAvailableTemplates()` é uma lista escrita à
 *    mão no código. Nome que entra na lista sem o arquivo correspondente vira
 *    erro na tela do consultor, e a lista é exatamente o tipo de coisa que
 *    envelhece em silêncio. Aqui cada nome dela é buscado de verdade.
 *
 * 2. **Nome inexistente é 404, não 500.** Antes, `generate()` lançava `Error`
 *    para tudo e o handler traduzia o conjunto inteiro em 500 — pedido inválido
 *    virava erro de servidor, poluindo a taxa de 5xx que é justamente o sinal
 *    que a onda 3 quer usar para alertar.
 */

describe('Templates de política', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-c', 'consultor@ness.com', senha, 'Consultor', 'consultor', null),
    ]);
    headers = {
      ...(await sessionFor({ id: 'u-c', email: 'consultor@ness.com', role: 'consultor' })),
      'Content-Type': 'application/json',
    };
  });

  it('todo template anunciado no catálogo existe de fato', async () => {
    const nomes = await new PolicyGeneratorService('.', env.ASSETS).listAvailableTemplates('v2022');
    expect(nomes.length, 'o catálogo veio vazio — o teste passaria sem testar nada').toBeGreaterThan(10);

    const quebrados: string[] = [];
    for (const nome of nomes) {
      const res = await pedir(worker, `/api/v1/policies/templates/${nome}`, { headers });
      if (res.status !== 200) quebrados.push(`${res.status} ${nome}`);
    }
    expect(quebrados, `o catálogo anuncia template que não existe:\n  ${quebrados.join('\n  ')}`).toEqual([]);
  });

  it('template inexistente responde 404, não 500', async () => {
    const res = await pedir(worker, '/api/v1/policies/templates/politica-que-nao-existe', { headers });
    expect(res.status).toBe(404);
  });

  it('nome fora do charset aceito também é 404 (e não vaza o caminho tentado)', async () => {
    // `..%2f..%2fetc%2fpasswd` chega ao handler como `../../etc/passwd`. A
    // recusa é a mesma de qualquer nome inexistente — de propósito: resposta
    // diferente para caminho traversal confirma ao atacante que ele acertou a
    // forma do ataque.
    const res = await pedir(worker, '/api/v1/policies/templates/..%2f..%2fetc%2fpasswd', { headers });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('passwd');
  });

  it('template real volta com o nome da organização já substituído', async () => {
    const res = await pedir(worker, '/api/v1/policies/templates/isms-policy', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.markdown).toContain('[Nome da Organização]');
    expect(body.markdown, 'o placeholder do template não foi substituído').not.toContain('[Organization Name]');
  });
});
