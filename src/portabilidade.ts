import { log } from './observability';
import type { Bindings } from './index';

/**
 * Portabilidade do tenant — export do cliente inteiro (item 4.6 do
 * `enterprise-grade-plan.md`).
 *
 * O gatilho é legal antes de ser técnico: a LGPD, art. 18, V, dá ao titular o
 * direito à portabilidade, e o cliente deste produto é controlador dos dados que
 * põe aqui. Sem um caminho de saída, "seus dados são seus" é uma frase de
 * contrato sem implementação — e é exatamente o tipo de coisa que uma auditoria
 * de fornecedor pergunta.
 *
 * DERIVADO DO BANCO, NÃO DE UMA LISTA. As tabelas exportadas são descobertas em
 * tempo de execução (`sqlite_master` + `PRAGMA table_info`): toda tabela que tem
 * coluna `project_id` entra, filtrada por ela. Uma lista escrita à mão daria
 * export incompleto no dia em que alguém criasse uma tabela — e export
 * incompleto é pior que nenhum, porque parece completo.
 *
 * O que NÃO vai no JSON, e está declarado no manifesto:
 *
 *   - os ARQUIVOS de evidência, que vivem no R2. Vão as chaves, os hashes e os
 *     tamanhos; o conteúdo sai por download individual. Embutir binário em
 *     base64 multiplicaria o tamanho por 1,33 e faria um export de 500 MB
 *     estourar o limite de resposta do Worker;
 *   - os vetores do Vectorize, que são derivados dos documentos e reconstruíveis
 *     por reingestão. Exportar embedding é exportar um artefato do modelo, não
 *     dado do cliente.
 */

/** Tabelas cujo conteúdo é da PLATAFORMA, não do cliente, mesmo tendo project_id. */
const NAO_EXPORTAR = new Set([
  // Segredo em repouso: hash de chave de API e token de auditor autenticam
  // acesso. Exportá-los transformaria o arquivo de portabilidade numa cópia de
  // credenciais viva — e o titular não precisa delas para levar seus dados.
  'api_keys',
  'auditor_tokens',
]);

export type Manifesto = {
  projeto: string;
  gerado_em: string;
  versao_formato: number;
  tabelas: Record<string, number>;
  total_linhas: number;
  sha256: string;
  assinatura: string | null;
  /** Por que não há assinatura, quando não há. Nunca fica em branco em silêncio. */
  assinatura_ausente?: string;
  nao_incluido: string[];
};

export type Export = {
  manifesto: Manifesto;
  dados: Record<string, unknown[]>;
};

/** Hex de um ArrayBuffer, sem depender de Buffer (que não existe no workerd). */
function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

/**
 * HMAC-SHA256 sobre o payload canônico.
 *
 * Chave PRÓPRIA (`EXPORT_SIGNING_KEY`), e não a `TOKEN_ENC_KEY` que já existe:
 * reusar uma chave para cifrar token e para assinar export junta dois domínios
 * de comprometimento que não têm por que se tocar.
 *
 * Sem a chave o export continua saindo — com `assinatura: null` e o motivo
 * escrito no manifesto. Recusar o export por falta de assinatura transformaria
 * um direito do titular em refém de configuração; mentir dizendo que está
 * assinado seria pior. Fica explícito.
 */
async function assinar(env: Bindings, payload: string): Promise<{ assinatura: string | null; motivo?: string }> {
  const segredo = (env as any).EXPORT_SIGNING_KEY as string | undefined;
  if (!segredo) {
    return {
      assinatura: null,
      motivo:
        'EXPORT_SIGNING_KEY não configurada — o sha256 abaixo prova INTEGRIDADE do arquivo, ' +
        'não ORIGEM. Para export assinado, configure o segredo (ver docs/portabilidade.md).',
    };
  }
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return { assinatura: hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(payload))) };
}

/** Tabelas com coluna `project_id`, descobertas do próprio banco. */
export async function tabelasExportaveis(env: Bindings): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name"
  ).all<{ name: string }>();

  const comProjeto: string[] = [];
  for (const { name } of results) {
    if (NAO_EXPORTAR.has(name)) continue;
    const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${name}")`).all<any>();
    if ((cols as any[]).some((c) => c.name === 'project_id')) comProjeto.push(name);
  }
  return comProjeto;
}

export async function exportarProjeto(env: Bindings, projectId: string): Promise<Export> {
  const tabelas = await tabelasExportaveis(env);

  const dados: Record<string, unknown[]> = {};
  const contagem: Record<string, number> = {};
  let total = 0;

  for (const t of tabelas) {
    // Nome de tabela vem de `sqlite_master`, não do chamador; o `project_id` vai
    // por bind. Interpolar o nome é inevitável (SQLite não aceita bind de
    // identificador) e seguro por essa procedência.
    const { results } = await env.DB.prepare(
      `SELECT * FROM "${t}" WHERE project_id = ? ORDER BY rowid`
    ).bind(projectId).all();
    dados[t] = results ?? [];
    contagem[t] = dados[t].length;
    total += dados[t].length;
  }

  // O projeto em si não tem `project_id` — tem `id`. Sem esta linha o export
  // sairia com todo o conteúdo e nenhuma identificação do cliente.
  const projeto = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  dados['projects'] = projeto ? [projeto] : [];
  contagem['projects'] = dados['projects'].length;
  total += contagem['projects'];

  const payload = JSON.stringify(dados);
  const digest = await sha256(payload);
  const { assinatura, motivo } = await assinar(env, payload);

  const manifesto: Manifesto = {
    projeto: projectId,
    gerado_em: new Date().toISOString(),
    versao_formato: 1,
    tabelas: contagem,
    total_linhas: total,
    sha256: digest,
    assinatura,
    ...(motivo ? { assinatura_ausente: motivo } : {}),
    nao_incluido: [
      'Arquivos de evidência (R2): vão as chaves, os hashes e os tamanhos na tabela `evidence`; o conteúdo sai por download individual.',
      'Vetores do Vectorize: derivados dos documentos e reconstruíveis por reingestão.',
      'Chaves de API e tokens de auditor: são credenciais de acesso, não dado do titular.',
    ],
  };

  log('info', {
    msg: 'export_projeto',
    projeto: projectId,
    tabelas: tabelas.length,
    linhas: total,
    assinado: assinatura !== null,
  });

  return { manifesto, dados };
}
