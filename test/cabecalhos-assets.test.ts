// Os cabeçalhos de segurança do HTML estático têm de ser os MESMOS que o Worker
// envia nas rotas dele.
//
// Por que existem dois lugares: o Workers Assets responde a arquivo estático
// ANTES de o Worker rodar (`assets.run_worker_first` ausente, que é o padrão),
// então o `secureHeaders` de src/index.ts nunca vê essas requisições; e o
// `_headers`, por decisão da plataforma, não se aplica a resposta gerada por
// Worker. Nenhum dos dois alcança o lado do outro — não há fonte única possível,
// só a obrigação de não divergirem. É o que este teste cobra.
//
// O modo de falha que isto previne é silencioso: alguém aperta o CSP no Worker,
// o teste de segurança passa (ele mede a resposta do Worker), e o HTML continua
// servido com a política velha. Foi exatamente assim que o S2 — treze PRs para
// tirar `unsafe-inline` de script-src — acabou valendo só para as respostas JSON
// da API, onde script injetado não executa de qualquer maneira.
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
// @ts-expect-error — `?raw` é resolvido pelo Vite; o arquivo não tem extensão.
import bruto from '../frontend/public/_headers?raw';

/** Nomes que este teste considera cabeçalho de segurança. */
const E_SEGURANCA =
  /^(content-security-policy|strict-transport-security|referrer-policy|origin-agent-cluster|permissions-policy|x-|cross-origin-)/i;

/**
 * Lê o bloco `/*` do `_headers`. Formato: a linha da URL sem indentação, os
 * cabeçalhos indentados abaixo dela. Comentário começa com `#`.
 */
function declaradosNoHeaders(): Map<string, string> {
  const mapa = new Map<string, string>();
  let dentroDoBloco = false;
  for (const linha of bruto.split('\n')) {
    const semComentario = linha.replace(/^\s*#.*$/, '');
    if (!semComentario.trim()) continue;
    if (!/^\s/.test(semComentario)) {
      dentroDoBloco = semComentario.trim() === '/*';
      continue;
    }
    if (!dentroDoBloco) continue;
    const i = semComentario.indexOf(':');
    if (i === -1) continue;
    mapa.set(semComentario.slice(0, i).trim().toLowerCase(), semComentario.slice(i + 1).trim());
  }
  return mapa;
}

/** Cabeçalhos de segurança que o Worker devolve de fato, numa rota pública. */
async function enviadosPeloWorker(): Promise<Map<string, string>> {
  const res = await app.fetch(new Request('http://localhost/health'), env as any);
  const mapa = new Map<string, string>();
  res.headers.forEach((valor, nome) => {
    if (E_SEGURANCA.test(nome)) mapa.set(nome.toLowerCase(), valor);
  });
  return mapa;
}

describe('cabeçalhos de segurança: assets estáticos x Worker', () => {
  it('o _headers foi lido e tem o bloco /*', () => {
    // Piso: se a importação do arquivo parar de resolver, os dois testes abaixo
    // comparariam conjuntos vazios e passariam sem ter olhado nada.
    expect(bruto, 'o arquivo frontend/public/_headers não foi encontrado').toBeTruthy();
    expect(declaradosNoHeaders().size).toBeGreaterThan(5);
  });

  it('todo cabeçalho de segurança do Worker está no _headers, com o mesmo valor', async () => {
    const doWorker = await enviadosPeloWorker();
    const doArquivo = declaradosNoHeaders();

    const divergentes: string[] = [];
    for (const [nome, valor] of doWorker) {
      const declarado = doArquivo.get(nome);
      if (declarado === undefined) {
        divergentes.push(`${nome}: o Worker envia, o _headers não declara`);
      } else if (declarado !== valor) {
        divergentes.push(`${nome}:\n    worker  = ${valor}\n    _headers = ${declarado}`);
      }
    }

    expect(
      divergentes,
      `o HTML estático sairia com cabeçalho diferente do que o Worker promete:\n  ${divergentes.join('\n  ')}`
    ).toEqual([]);
  });

  it('o _headers não inventa cabeçalho que o Worker não envia', async () => {
    // A direção oposta importa igual: um cabeçalho só no estático significa que
    // a API está mais frouxa que o HTML, e ninguém foi avisado.
    const doWorker = await enviadosPeloWorker();
    const sobrando = [...declaradosNoHeaders().keys()].filter((n) => !doWorker.has(n));
    expect(
      sobrando,
      `declarados no _headers mas ausentes na resposta do Worker: ${sobrando.join(', ')}`
    ).toEqual([]);
  });
});
