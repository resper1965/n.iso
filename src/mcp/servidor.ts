import { createMcpHandler } from 'agents/mcp/server';
import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { TOOLS, ferramentaPermitida, executarFerramenta, type Transporte, type Ferramenta } from '../../mcp-server-niso/src/ferramentas';
import type { PropsAgente } from '../middleware/agente';
import { INSTRUCOES, montarContexto } from './contexto';

type FetchHono = (r: Request, e: any, c?: any) => Response | Promise<Response>;

/** Fora do alcance do agente mesmo sendo do consultor: o servidor recusa de novo. */
const BLOQUEADAS = new Set(['niso_generate_policies_bulk', 'niso_create_audit_finding', 'niso_create_auditor_note']);

const CONTEXTO: Ferramenta = {
  name: 'niso_contexto',
  description: 'Comece por aqui. Diz o cliente desta conexão, o projectId a usar, o que você pode e não pode fazer, e os roteiros de trabalho.',
  inputSchema: { type: 'object', properties: {} },
};

const DISPONIVEIS: Ferramenta[] = [
  CONTEXTO,
  ...TOOLS.filter((t) => ferramentaPermitida(t.name, 'consultant') && !BLOQUEADAS.has(t.name)),
];
const NOMES = new Set(DISPONIVEIS.map((f) => f.name));

/**
 * Chama as rotas /api/v1 do próprio Worker como o agente — sem rede, sem
 * cabeçalho forjável. A identidade vai SÓ em `env.AGENTE`; o Authorization do
 * /mcp (token OAuth) não é repassado.
 */
function transporteInterno(origem: Request, env: any, ctx: any, props: PropsAgente, fetchHono: FetchHono): Transporte {
  const base = new URL(origem.url).origin;
  // Espalhar o env preserva os bindings (DB, SESSIONS, STORAGE...): são
  // propriedades próprias e enumeráveis do objeto env no workerd.
  const envAgente = { ...env, AGENTE: props };
  // Allowlist de IP do tenant avalia o IP real do cliente MCP.
  const ip = origem.headers.get('CF-Connecting-IP');
  const chamar = async (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    if (ip) headers.set('CF-Connecting-IP', ip);
    const r = await fetchHono(new Request(base + path, { ...init, headers }), envAgente, ctx);
    const texto = await r.text();
    let corpo: any = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      // Resposta não-JSON (página, erro do runtime): não repassa o corpo ao modelo.
      throw new Error(`HTTP ${r.status}: resposta inesperada da API`);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof corpo?.error === 'string' ? corpo.error : 'falha na API'}`);
    return corpo;
  };
  return {
    get: (path) => chamar(path, { method: 'GET' }),
    enviar: (path, corpo, method = 'POST') =>
      chamar(path, { method, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    contrato: (rota, params, corpo) => {
      const [method, modelo] = rota.split(' ') as [string, string];
      const path = modelo.replace(/\{(\w+)\}/g, (_, k: string) => {
        // Mesma guarda do nisoContrato local: placeholder vazio viraria `{x}` literal e um 404 silencioso.
        if (!params[k]) throw new Error(`Parâmetro de caminho ausente: ${k} (rota ${rota})`);
        return encodeURIComponent(params[k]);
      });
      return chamar(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    },
    // Espelha nisoUploadText (mcp-server-niso/src/index.ts): o arquivo leva o
    // contentType; os demais campos (control_id) vão como campo do form.
    uploadTexto: (path, campos, conteudo, nomeArquivo) => {
      const fd = new FormData();
      fd.append('file', new Blob([conteudo], { type: campos.contentType }), nomeArquivo);
      const { contentType: _tipo, ...resto } = campos;
      for (const [k, v] of Object.entries(resto)) fd.append(k, v);
      return chamar(path, { method: 'POST', body: fd });
    },
  };
}

export async function handlerMcp(req: Request, env: any, ctx: any, fetchHono: FetchHono): Promise<Response> {
  const props = ctx.props as PropsAgente;
  const t = transporteInterno(req, env, ctx, props, fetchHono);

  const criar = () => {
    const server = new Server({ name: 'niso', version: '2.0.0' }, { capabilities: { tools: {} }, instructions: INSTRUCOES });
    server.setRequestHandler('tools/list', async () => ({ tools: DISPONIVEIS as any }));
    server.setRequestHandler('tools/call', async (r) => {
      const { name, arguments: args } = r.params;
      try {
        if (name === 'niso_contexto') {
          // GET /projects/:id devolve o projeto na raiz (redactProject), sem envelope.
          const projeto = (await t.get(`/api/v1/projects/${encodeURIComponent(props.projectId)}`)) as any;
          return { content: [{ type: 'text', text: montarContexto({ ...projeto, id: props.projectId }, props.email) }] };
        }
        if (!NOMES.has(name)) {
          return { isError: true, content: [{ type: 'text', text: `Ferramenta ${name} indisponível para o agente consultor` }] };
        }
        // projetoFixo: projectId de outro cliente é recusado antes de qualquer chamada.
        return (await executarFerramenta(name, args, t, { projetoFixo: props.projectId, papel: 'consultant' })) as CallToolResult;
      } catch (e: any) {
        return { isError: true, content: [{ type: 'text', text: `Erro: ${e?.message ?? 'falha interna'}` }] };
      }
    });
    return server;
  };

  return createMcpHandler(criar, {
    route: '/mcp',
    responseMode: 'json',
    allowedHostnames: ['niso.ness.com.br', 'n-iso.ness.com.br', 'niso.ness.workers.dev', 'localhost', '127.0.0.1'],
  })(req, env, ctx);
}
