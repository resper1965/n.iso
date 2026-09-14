// GET /api/v1/leads/consulta-cnpj/:cnpj — o preview de CNPJ que saiu do
// navegador para o servidor quando o CSP passou a valer na página.
//
// O `fetch` de saída é trocado por um dublê: teste que chama a brasilapi ao vivo
// quebra no dia em que a API deles oscila — lição que o CI já levou no #116. O
// dublê também registra a URL pedida, que é como se prova que a limpeza do CNPJ
// aconteceu antes de montar o caminho.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, sessionFor } from './helpers/d1';

const CNPJ_VALIDO = '11222333000181';

/** URLs que o handler pediu ao `fetch`, na ordem. */
let pedidas: string[] = [];

/** Troca o fetch de saída por um que responde `corpo` e anota a URL. */
function dubleDeFetch(corpo: unknown, ok = true) {
  pedidas = [];
  vi.stubGlobal('fetch', async (entrada: any) => {
    pedidas.push(typeof entrada === 'string' ? entrada : entrada.url);
    return new Response(JSON.stringify(corpo), {
      status: ok ? 200 : 404,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

async function consulta(cnpj: string, headers: Record<string, string>) {
  return app.fetch(
    new Request(`http://localhost/api/v1/leads/consulta-cnpj/${cnpj}`, { headers }),
    env as any
  );
}

describe('consulta de CNPJ para preview', () => {
  let ness: Record<string, string>;
  let cliente: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await resetData();
    await resetSessions();
    ness = await sessionFor({ id: 'u-ness', email: 'c@ness.lat', role: 'consultor' });
    cliente = await sessionFor({
      id: 'u-cli', email: 'a@cliente.com', role: 'org_admin', client_project_id: 'p1',
    });
  });

  it('recusa CNPJ com formato errado ANTES de sair para a rede', async () => {
    // Importa que seja antes: é o que garante que o caminho montado com o
    // parâmetro só tem dígito, e em quantidade fixa.
    dubleDeFetch({ razao_social: 'nao deveria ser chamado' });
    for (const ruim of ['123', 'abcdefghijklmn', '112223330001812']) {
      const res = await consulta(ruim, ness);
      expect(res.status, `aceitou "${ruim}"`).toBe(400);
    }
    expect(pedidas, 'saiu para a rede com CNPJ inválido').toEqual([]);
  });

  it('máscara com pontuação é limpa antes de virar caminho', async () => {
    dubleDeFetch({ razao_social: 'ACME LTDA', municipio: 'São Paulo', uf: 'SP' });
    const res = await consulta('11.222.333%2F0001-81', ness);

    expect(res.status).toBe(200);
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]).toBe(`https://brasilapi.com.br/api/cnpj/v1/${CNPJ_VALIDO}`);
  });

  it('devolve só os campos do preview — não repassa o cadastro inteiro', async () => {
    // O enrich é quem grava o cadastro completo. Repassar tudo aqui vazaria
    // quadro societário e endereço para uma tela que só mostra três linhas.
    dubleDeFetch({
      razao_social: 'ACME LTDA',
      municipio: 'São Paulo',
      uf: 'SP',
      descricao_situacao_cadastral: 'ATIVA',
      qsa: [{ nome_socio: 'Fulano' }],
      capital_social: 1000,
    });
    const corpo = await (await consulta(CNPJ_VALIDO, ness)).json() as Record<string, unknown>;

    expect(corpo.razao_social).toBe('ACME LTDA');
    expect(Object.keys(corpo).sort()).toEqual([
      'descricao_situacao_cadastral', 'municipio', 'nome_fantasia', 'ok', 'razao_social', 'uf',
    ]);
  });

  it('CNPJ que a fonte não conhece vira 404, não 500', async () => {
    dubleDeFetch({ message: 'não encontrado' }, false);
    expect((await consulta(CNPJ_VALIDO, ness)).status).toBe(404);
  });

  it('sessão de cliente não usa a rota como proxy de consulta', async () => {
    // `somenteNess` vale para todo o roteador de leads. Sem isto, mover a
    // consulta para o servidor teria transformado um fetch do navegador do
    // consultor num serviço de consulta aberto a qualquer tenant.
    const res = await consulta(CNPJ_VALIDO, cliente);
    expect(res.status).toBe(403);
  });

  it('sem sessão não passa', async () => {
    const res = await consulta(CNPJ_VALIDO, {});
    expect(res.status).toBe(401);
  });
});
