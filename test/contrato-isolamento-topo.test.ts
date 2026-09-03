import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, pedir } from './helpers/d1';
import indexSrc from '../src/index.ts?raw';

/**
 * Contrato de isolamento das rotas de TOPO (`/api/v1/<coisa>/:id`).
 *
 * `test/idor-tenant.test.ts` prova o isolamento de uma LISTA de recursos. O
 * problema da lista é que ela não cresce sozinha: rota nova nasce descoberta, e
 * a omissão é silenciosa. Este teste ataca isso por outro lado — ele DESCOBRE
 * as rotas lendo o código-fonte, então uma rota nova entra no teste no mesmo
 * commit em que é escrita, sem ninguém lembrar de nada.
 *
 * A asserção é de COMPORTAMENTO, não de sintaxe, e a razão é concreta. Um teste
 * que só procurasse `requireResourceAccess` no corpo do handler teria aprovado
 * `PUT /api/v1/assets/:id`, onde a chamada existia — só que FORA do `try`, de
 * modo que a recusa virava 500 em vez de 403. A guarda ser convenção manual não
 * falha só por ausência; falha também por colocação. Só a resposta real
 * distingue as duas coisas.
 *
 * O QUE ESTE TESTE AFIRMA — e o que ele NÃO afirma.
 *
 * Afirma: (1) as rotas de topo são DESCOBERTAS do fonte, então uma rota nova não
 * escapa por esquecimento; (2) nenhuma delas responde sucesso ou erro de
 * servidor a um id inexistente vindo de um usuário escopado a outro projeto.
 *
 * NÃO afirma que existe guarda. Foi verificado por mutação: removida a chamada
 * de `requireResourceAccess` de um handler de `evidence.ts`, este teste
 * continuou VERDE — porque a rota sem guarda responde 404 para id inexistente, e
 * 404 satisfaz a asserção. A guarda só é detectada quando sua ausência produz
 * 2xx ou 5xx, que foi o caso dos dois handlers de webhooks (500).
 *
 * Detectar a ausência em geral exige semear um recurso REAL do outro tenant por
 * rota — aí a rota sem guarda devolve 200 com dado alheio, que é inconfundível.
 * É o que `idor-tenant.test.ts` faz à mão, recurso a recurso. Fechar essa lacuna
 * de forma automática está registrado no plano; até lá, este arquivo é rede de
 * descoberta e detector de 5xx, não prova de guarda — e dizer o contrário seria
 * exatamente o tipo de afirmação sem evidência que o `AGENTS.md` proíbe.
 *
 * Rotas sob `/api/v1/projects/:projectId/*` ficam de fora: ali quem responde é
 * o `projectAccessMiddleware`, e há teste próprio.
 */

const arquivos = import.meta.glob('../src/routes/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Exceções — cada uma com o motivo, não só o caminho.
 *
 * Entrada aqui é decisão consciente que aparece no diff do PR. Acrescentar uma
 * é barato de propósito; o que o teste impede é a rota nova passar sem que
 * ninguém tenha decidido nada sobre ela.
 */
const EXCECOES: Record<string, string> = {
  // O escopo desta rota não é o projeto, é o DONO da notificação, e o handler
  // responde 200 mesmo quando não altera nada — o filtro está no `WHERE ... AND
  // (user_id = ? OR user_id IS NULL)`. Aqui o status não prova coisa alguma; o
  // que prova é a linha, e isso está afirmado em `idor-tenant.test.ts`.
  'PUT /api/v1/notifications/:id/read':
    'escopo por dono, não por projeto; a asserção real é sobre a linha, em idor-tenant.test.ts',

  // Template de política é arquivo estático servido pelo binding ASSETS, que
  // não existe no ambiente de teste (`wrangler.test.jsonc` não o declara) — o
  // handler falha por falta de binding, não por falta de guarda. Não há dado de
  // tenant envolvido: o mesmo template serve a todos os clientes.
  //
  // O sweep expôs, de passagem, que nome de template inexistente devolve 500 em
  // vez de 404 (o `generate()` lança e o handler traduz tudo para `erro500`).
  // Não é falha de isolamento e não dá para verificar a correção sem o binding,
  // então está registrado no plano em vez de corrigido às cegas aqui.
  'GET /api/v1/policies/templates/:templateName':
    'arquivo estático, sem dado de tenant; depende do binding ASSETS, ausente no ambiente de teste',
};

type Rota = { metodo: string; caminho: string; origem: string };

/** Descobre as rotas de topo com parâmetro, compondo mount + caminho declarado. */
function rotasDeTopo(): Rota[] {
  // `app.route('<mount>', <var>)` no composition root.
  const mount: Record<string, string> = {};
  for (const m of indexSrc.matchAll(/app\.route\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g)) {
    mount[m[2]] = m[1];
  }

  // De qual arquivo veio cada router (nomeado ou default). Guardamos os DOIS
  // caminhos derivados do mesmo nome de módulo: a chave do glob (que é relativa
  // a este arquivo) e o caminho do repositório (que vai na mensagem de falha).
  // Derivar um do outro por `replace('../', '')` recortaria só a primeira
  // ocorrência e é frágil à toa — o nome do módulo já está em mãos aqui.
  const arquivoDe: Record<string, { chave: string; origem: string }> = {};
  for (const m of indexSrc.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'\.\/routes\/([\w-]+)'/g)) {
    const modulo = m[3];
    const par = { chave: `../src/routes/${modulo}.ts`, origem: `src/routes/${modulo}.ts` };
    if (m[1]) for (const v of m[1].split(',')) arquivoDe[v.trim()] = par;
    else arquivoDe[m[2]] = par;
  }

  const rotas: Rota[] = [];
  for (const [routerVar, { chave, origem }] of Object.entries(arquivoDe)) {
    if (!(routerVar in mount)) continue; // importado mas não montado
    const src = arquivos[chave];
    if (!src) continue;
    src.split('\n').forEach((linha, i) => {
      const m = linha.match(/^\s*(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'/);
      if (!m || m[1] !== routerVar) return;
      const caminho = (mount[routerVar] + m[3]).replace(/\/$/, '') || '/';
      if (!/:\w/.test(caminho)) return;                          // sem parâmetro: nada a forjar
      if (/^\/api\/v1\/projects\/:\w+\//.test(caminho)) return;   // coberto pelo middleware
      rotas.push({
        metodo: m[2].toUpperCase(),
        caminho,
        origem: `${origem}:${i + 1}`,
      });
    });
  }
  return rotas;
}

/** Troca cada `:param` por um valor que não existe no banco. */
function forjarCaminho(caminho: string): string {
  return caminho.replace(/:(\w+)/g, (_todo, nome: string) =>
    nome.toLowerCase().includes('token') ? 'token-forjado-inexistente' : 'id-forjado-inexistente'
  );
}

describe('Contrato de isolamento das rotas de topo', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('u-a', 'adm@a.com', senha, 'Admin do A', 'org_admin', 'proj-a'),
    ]);
    const sessao = await sessionFor({
      id: 'u-a', email: 'adm@a.com', role: 'org_admin', client_project_id: 'proj-a',
    });
    headers = { ...sessao, 'Content-Type': 'application/json' };
  });

  it('descobre as rotas de verdade (senão o teste passaria vazio)', () => {
    // Um parser que deixa de casar não FALHA — ele varre zero rota e o teste
    // fica verde sem ter testado nada. Este piso é o que impede isso; o número
    // é o levantamento de 2026-09 (77 rotas), com folga para remoção legítima.
    const rotas = rotasDeTopo();
    expect(rotas.length, 'o parser de rotas parou de casar — conferir os padrões').toBeGreaterThanOrEqual(70);
  });

  it('toda exceção declarada corresponde a uma rota que ainda existe', () => {
    // Exceção órfã é pior que exceção: dá a impressão de que alguém decidiu
    // algo sobre uma rota que já não está lá, e esconde que a lista envelheceu.
    const existentes = new Set(rotasDeTopo().map(r => `${r.metodo} ${r.caminho}`));
    for (const chave of Object.keys(EXCECOES)) {
      expect(existentes.has(chave), `exceção órfã: "${chave}" não corresponde a nenhuma rota`).toBe(true);
    }
  });

  it('id inexistente nunca responde sucesso nem erro de servidor', async () => {
    const rotas = rotasDeTopo().filter(r => !(`${r.metodo} ${r.caminho}` in EXCECOES));
    const falhas: string[] = [];

    for (const r of rotas) {
      const res = await pedir(worker, forjarCaminho(r.caminho), {
        method: r.metodo,
        headers,
        body: r.metodo === 'GET' ? undefined : '{}',
      });

      // 4xx é o resultado esperado, qualquer que seja: 403 (guarda de tenant ou
      // de papel), 404 (não existe), 400 (corpo vazio recusado). O que não pode
      // acontecer é sucesso — a rota entregou algo sem checar — nem 5xx, que
      // transforma recusa de rotina em erro de servidor e polui a taxa de 5xx.
      if (res.status < 400 || res.status >= 500) {
        falhas.push(`${res.status} ${r.metodo} ${r.caminho}  (${r.origem})`);
      }
    }

    expect(falhas, `rotas de topo sem guarda efetiva:\n  ${falhas.join('\n  ')}`).toEqual([]);
  });
});
