import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Rota, Obrigatorios } from "./contrato-gerado.js";
import {
  TOOLS,
  ferramentaPermitida,
  executarFerramenta,
  type Papel,
  type Transporte,
} from "./ferramentas.js";

const NISO_BASE_URL = process.env.NISO_BASE_URL || "https://niso.ness.com.br";
const NISO_API_KEY = process.env.NISO_API_KEY;

// Papel do agente: "consultant" | "auditor" | "" (todos). Cada papel só enxerga e
// executa o seu conjunto de ferramentas — o auditor nunca escreve implementação
// (política, SoA), o consultor nunca registra achado de auditoria. Independência
// estrutural (cláusula 9.2) na própria camada MCP.
const NISO_ROLE = (process.env.NISO_ROLE || "").toLowerCase();

// Trava dura opcional: só leitura, ignora qualquer escrita (observador puro).
const NISO_READONLY = /^(1|true|yes|on)$/i.test(process.env.NISO_READONLY || "");

// Pin de projeto: fixa a sessão num projeto — tools com projectId recusam outro.
const NISO_PROJECT_ID = process.env.NISO_PROJECT_ID || "";

if (!NISO_API_KEY) {
  console.error("Warning: NISO_API_KEY environment variable is not set.");
}

// ── Contexto do papel ────────────────────────────────────────────────────────
// Entregue ao cliente no handshake (campo `instructions` do initialize). Antes
// disto, o agente só descobria a própria fronteira por tentativa e erro: pedia
// uma ferramenta e recebia "indisponível para o papel configurado". Dizer em voz
// alta o que a filtragem já impõe em silêncio é mais barato que a descoberta.
//
// A separação não é preferência de produto: é a independência da cláusula 9.2 da
// ISO 27001 — quem implementa não audita o que implementou.
function contextoDoPapel(): string {
  const projeto = NISO_PROJECT_ID
    ? `

Projeto: você atua SOMENTE no projeto ${NISO_PROJECT_ID}. Chamada a outro projeto é recusada aqui e no servidor.`
    : `

Projeto: sua chave de API é vinculada a UM projeto. Você não alcança nenhum outro — o servidor recusa antes de ler o pedido.`;

  if (NISO_READONLY) {
    return (
      `Você é um OBSERVADOR do n.iso, sistema de adequação a ISO 27001 e 27701.

` +
      `Faz: lê o estado do SGSI.
` +
      `Não faz: nenhuma escrita, de nenhum tipo. NISO_READONLY está ligado.

` +
      `Postura: relate o que encontrar; não proponha gravar nada, porque não há como.` +
      projeto
    );
  }

  if (NISO_ROLE === "auditor") {
    return (
      `Você é o agente AUDITOR do n.iso, sistema de adequação a ISO 27001 e 27701.

` +
      `Faz: lê o estado do SGSI e registra achado e nota de auditoria
` +
      `(niso_create_audit_finding, niso_create_auditor_note).
` +
      `Não faz: política, SoA, evidência, controle, ativo, risco — nada de
` +
      `implementação. Essas ferramentas nem aparecem para você.
` +
      `Por quê: quem implementa não audita o que implementou (ISO 27001, 9.2).

` +
      `Postura:
` +
      `- Comece por niso_audit_pack e niso_coherence_check, não pela lista bruta:
` +
      `  eles já cruzam risco, controle e evidência.
` +
      `- Achado é fato observado com evidência apontada, não opinião. Sem a
` +
      `  evidência, é observação — registre como nota.
` +
      `- Uma pré-qualificação de IA NÃO é veredito de auditoria. O rótulo
` +
      `  CONFORME/PARCIAL/NÃO CONFORME que o sistema gera é rascunho de terceiro.` +
      projeto
    );
  }

  if (NISO_ROLE === "consultant") {
    return (
      `Você é o agente CONSULTOR do n.iso, sistema de adequação a ISO 27001 e 27701.

` +
      `Faz: implementa — política, SoA, evidência, controle, ativo, risco — e
` +
      `responde nota de auditoria (niso_respond_auditor_note).
` +
      `Não faz: registrar achado de auditoria. Essas ferramentas nem aparecem
` +
      `para você.
` +
      `Por quê: quem implementa não audita o que implementou (ISO 27001, 9.2).

` +
      `Postura:
` +
      `- Rascunho de IA é rascunho até revisão humana. Política gerada não é
` +
      `  política aprovada.
` +
      `- Geração em lote (niso_generate_policies_bulk) nunca roda sozinha:
` +
      `  exige aprovação humana explícita no contrato ativo.
` +
      `- niso_create_evidence aceita SÓ TEXTO. Transcrever um PDF não é o
` +
      `  documento — arquivo binário sobe pela interface web.
` +
      `- Escrita em projeto de cliente exige contrato ativo e aprovação humana
` +
      `  prévia.` +
      projeto
    );
  }

  return (
    `Você está conectado ao n.iso sem papel definido (NISO_ROLE vazio): as 23
` +
    `ferramentas estão disponíveis, de implementação E de auditoria.

` +
    `Isso mistura na mesma sessão os dois lados que a ISO 27001 separa na
` +
    `cláusula 9.2 — quem implementa não audita o que implementou. Para trabalho
` +
    `real, defina NISO_ROLE como "consultant" ou "auditor".` +
    projeto
  );
}

const server = new Server(
  {
    name: "niso-server",
    version: "1.4.0",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: contextoDoPapel(),
  }
);

async function nisoGet(path: string) {
  const response = await fetch(`${NISO_BASE_URL}${path}`, {
    headers: {
      "X-API-Key": NISO_API_KEY ?? ""
    },
  });
  const data = await response.json();
  return data;
}

/**
 * Chamada de escrita CONFERIDA CONTRA O CONTRATO da API (item 3.2 do
 * `enterprise-grade-plan.md`).
 *
 * A diferença para `nisoPost` não é de conveniência, é de momento em que o erro
 * aparece. `nisoPost` recebe uma string: método e caminho errados compilam,
 * publicam e só falham em produção, no 404 que ninguém liga ao commit que o
 * causou. Foi assim que `niso_respond_auditor_note` passou meses mandando POST
 * para uma rota que só aceita PUT.
 *
 * Aqui `rota` é uma chave de `ROTAS`, gerado de `docs/openapi.json`, que sai dos
 * schemas Zod do Worker. Rota removida, renomeada ou que troque de método deixa
 * de existir na união e a chamada **para de compilar**. O tipo do corpo exige os
 * campos que o schema marca como obrigatórios — faltar um também não compila.
 *
 * O que ele NÃO cobre, e por quê: as rotas de leitura e as de upload. O contrato
 * só descreve o que passa por `validateBody`, então GET não está lá — e inventar
 * entradas para GET seria descrever à mão o que ninguém valida.
 */
async function nisoContrato<R extends Rota>(
  rota: R,
  params: Record<string, string>,
  corpo: Record<Obrigatorios<R>, unknown> & Record<string, unknown>
) {
  const [metodo, molde] = rota.split(" ") as [string, string];

  const caminho = molde.replace(/\{(\w+)\}/g, (_todo, nome: string) => {
    const valor = params[nome];
    // Placeholder sem valor viraria o literal `{projectId}` na URL e um 404
    // silencioso. O tipo garante a ROTA; este erro garante os PARÂMETROS.
    if (valor === undefined || valor === "") {
      throw new Error(`Parâmetro de caminho ausente: ${nome} (rota ${rota})`);
    }
    return encodeURIComponent(valor);
  });

  const response = await fetch(`${NISO_BASE_URL}${caminho}`, {
    method: metodo,
    headers: {
      "X-API-Key": NISO_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  const data = await response.json();
  return data;
}

async function nisoPost(path: string, body?: unknown, method: "POST" | "PUT" | "PATCH" = "POST") {
  const response = await fetch(`${NISO_BASE_URL}${path}`, {
    method,
    headers: {
      "X-API-Key": NISO_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return data;
}

/**
 * Envia texto como `multipart/form-data` para o endpoint de upload que a UI já
 * usa (`POST /api/v1/projects/:projectId/evidence/upload`).
 *
 * O worker não ganhou rota nova para isto: o handler existente já calcula o
 * SHA-256, grava no R2, insere em `evidence` e registra na trilha de auditoria,
 * e `validateUpload` já impõe o teto de 25 MB e a allow-list de tipos. Reusar é
 * o que garante que evidência criada pelo agente e evidência criada por humano
 * sejam o MESMO registro, com o mesmo hash e a mesma validação — evidência de
 * segunda classe não serviria para auditoria.
 *
 * `Content-Type` NÃO é definido aqui de propósito: quem monta o boundary do
 * multipart é o fetch, a partir do FormData.
 */
async function nisoUploadText(
  path: string,
  campos: Record<string, string>,
  conteudo: string,
  nomeArquivo: string
) {
  const form = new FormData();
  form.append("file", new Blob([conteudo], { type: campos.contentType }), nomeArquivo);
  const { contentType: _tipo, ...resto } = campos;
  for (const [k, v] of Object.entries(resto)) form.append(k, v);

  const response = await fetch(`${NISO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": NISO_API_KEY ?? "",
    },
    body: form,
  });
  return response.json();
}


const PAPEL: Papel = NISO_READONLY ? "readonly" : (NISO_ROLE as Papel);

const transporteHttp: Transporte = {
  get: nisoGet,
  enviar: nisoPost,
  contrato: nisoContrato,
  uploadTexto: nisoUploadText,
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Cada papel enxerga só as suas ferramentas.
  return { tools: TOOLS.filter((t) => ferramentaPermitida(t.name, PAPEL)) };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Defesa em profundidade: o papel não executa ferramenta fora do seu conjunto.
  if (!ferramentaPermitida(name, PAPEL)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Error: Ferramenta ${name} indisponível para o papel configurado (NISO_ROLE=${NISO_ROLE || "—"}${NISO_READONLY ? ", NISO_READONLY" : ""}).`,
        },
      ],
    };
  }

  return (await executarFerramenta(name, args, transporteHttp, {
    projetoFixo: NISO_PROJECT_ID || undefined,
    papel: PAPEL,
  })) as CallToolResult;
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("nISO MCP Server running on stdio");
}

runServer().catch(console.error);
