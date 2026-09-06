/**
 * Avalia os SLOs de produção contra o Analytics Engine (item 3.5 do
 * `enterprise-grade-plan.md`).
 *
 * O `src/observability.ts` grava um ponto por requisição desde sempre —
 * `index1` = status, `blob1` = método, `blob2` = rota, `double1` = duração — e
 * até aqui **ninguém lia**. O runbook dizia isso com todas as letras: "o
 * Analytics Engine grava e ninguém lê".
 *
 * A sonda de `uptime.yml` pega o sistema FORA DO AR. Ela não pega o caso em que
 * o sistema responde: se 30% das requisições derem 500 e a sonda cair nos 70%
 * que respondem, ela passa. É esse buraco que este script fecha.
 *
 * Saída: JSON no stdout com as medidas e as violações. Código de saída 1 quando
 * há violação — é o que faz o workflow abrir a issue.
 *
 * Uso: `node scripts/slo.mjs` com `CLOUDFLARE_API_TOKEN` no ambiente.
 */

/** Teto de 5xx sobre o total, em 24h. */
const TAXA_5XX_MAX = 0.01;

/**
 * Teto de p95, em 24h, EXCLUINDO as rotas de IA.
 *
 * Rota de IA leva segundos por desenho — o modelo é que demora — e misturá-la
 * com o resto faria o p95 subir com a adoção do produto, não com degradação.
 * Alerta que dispara quando o produto é mais usado é alerta que se aprende a
 * ignorar.
 */
const P95_MAX_MS = 800;

/** Abaixo disto, p95 é ruído: uma requisição lenta domina a distribuição. */
const VOLUME_MINIMO_P95 = 20;

const ROTAS_DE_IA = ['/chat', '/generate', '/evaluate', '/ingest'];

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('CLOUDFLARE_API_TOKEN ausente.');
  process.exit(2);
}

/**
 * A conta sai do próprio token, e não de um secret separado: o token já dá
 * acesso a exatamente uma conta, e um id a menos no repositório é um id a menos
 * para vazar.
 */
async function idDaConta() {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  const contas = d?.result ?? [];
  if (!d?.success || contas.length !== 1) {
    throw new Error(`Não foi possível resolver a conta a partir do token (${contas.length} contas).`);
  }
  return contas[0].id;
}

async function consultar(conta, sql) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${conta}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: sql }
  );
  const texto = await r.text();
  if (!r.ok) throw new Error(`Analytics Engine devolveu ${r.status}: ${texto.slice(0, 300)}`);
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    // A API responde erro de SQL como TEXTO puro, com 200. Sem este ramo, um
    // erro de sintaxe viraria "sem dados" e o SLO passaria em silêncio.
    throw new Error(`Resposta não-JSON do Analytics Engine: ${texto.slice(0, 300)}`);
  }
  return json.data?.[0] ?? null;
}

const filtroSemIa = ROTAS_DE_IA.map((r) => `position('${r}' IN blob2) = 0`).join(' AND ');

const conta = await idDaConta();

const geral = await consultar(
  conta,
  `SELECT
     sum(_sample_interval) AS total,
     sum(if(toUInt32(index1) >= 500, _sample_interval, 0)) AS erros5xx,
     sum(if(toUInt32(index1) >= 400 AND toUInt32(index1) < 500, _sample_interval, 0)) AS erros4xx
   FROM niso_metrics
   WHERE timestamp > NOW() - INTERVAL '24' HOUR
   FORMAT JSON`
);

const latencia = await consultar(
  conta,
  `SELECT
     sum(_sample_interval) AS total,
     quantileWeighted(0.95)(double1, _sample_interval) AS p95_ms,
     quantileWeighted(0.99)(double1, _sample_interval) AS p99_ms
   FROM niso_metrics
   WHERE timestamp > NOW() - INTERVAL '24' HOUR AND ${filtroSemIa}
   FORMAT JSON`
);

if (!geral || !latencia) {
  console.error('Analytics Engine não devolveu linha — consulta ou dataset mudou de forma.');
  process.exit(2);
}

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const total = num(geral.total);
const erros5xx = num(geral.erros5xx);
const erros4xx = num(geral.erros4xx);
const totalSemIa = num(latencia.total);
const p95 = num(latencia.p95_ms);
const p99 = num(latencia.p99_ms);
const taxa5xx = total > 0 ? erros5xx / total : 0;

const violacoes = [];

// `erros5xx > 0` junto da taxa: num sistema de baixo volume, 1 erro em 30
// requisições estoura 1% e É para alertar — mas 0 erro nunca alerta, qualquer
// que seja o denominador.
if (erros5xx > 0 && taxa5xx > TAXA_5XX_MAX) {
  violacoes.push(
    `Taxa de 5xx em ${(taxa5xx * 100).toFixed(2)}% nas últimas 24h ` +
    `(${erros5xx} de ${total}), acima do teto de ${(TAXA_5XX_MAX * 100).toFixed(0)}%.`
  );
}

if (totalSemIa >= VOLUME_MINIMO_P95 && p95 > P95_MAX_MS) {
  violacoes.push(
    `p95 de latência em ${p95.toFixed(0)} ms nas últimas 24h (fora das rotas de IA), ` +
    `acima do teto de ${P95_MAX_MS} ms. p99: ${p99.toFixed(0)} ms.`
  );
}

const medidas = {
  janela: '24h',
  total,
  erros5xx,
  erros4xx,
  taxa_5xx_pct: Number((taxa5xx * 100).toFixed(3)),
  total_sem_ia: totalSemIa,
  p95_ms: Number(p95.toFixed(1)),
  p99_ms: Number(p99.toFixed(1)),
  tetos: { taxa_5xx_pct: TAXA_5XX_MAX * 100, p95_ms: P95_MAX_MS, volume_minimo_p95: VOLUME_MINIMO_P95 },
  p95_avaliado: totalSemIa >= VOLUME_MINIMO_P95,
  violacoes,
};

console.log(JSON.stringify(medidas, null, 2));
process.exit(violacoes.length ? 1 : 0);
