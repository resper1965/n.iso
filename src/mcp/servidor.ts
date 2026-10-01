import { createMcpHandler } from 'agents/mcp/server';
import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { TOOLS, ferramentaPermitida, executarFerramenta, type Transporte, type Ferramenta } from '../../mcp-server-niso/src/ferramentas';
import { concessaoValida, CABECALHO_CONFIRMADO, type PropsAgente } from '../middleware/agente';
import { INSTRUCOES, montarContexto } from './contexto';
import { SKILLS } from './skills-gerado';

type FetchHono = (r: Request, e: any, c?: any) => Response | Promise<Response>;

/** Fora do alcance do agente mesmo sendo do consultor: o servidor recusa de novo. */
const BLOQUEADAS = new Set(['niso_generate_policies_bulk', 'niso_create_audit_finding', 'niso_create_auditor_note']);

const CONTEXTO: Ferramenta = {
  name: 'niso_contexto',
  description: 'Comece por aqui. Diz o cliente desta conexão, o projectId a usar, o que você pode e não pode fazer, e os roteiros de trabalho.',
  inputSchema: { type: 'object', properties: {} },
};

const SKILL: Ferramenta = {
  name: 'niso_skill',
  description:
    'Traz o método de trabalho de uma skill do consultor (ex.: pré-avaliação de prontidão para certificação). Sem argumentos lista as skills; com nome traz o SKILL.md; com nome e arquivo traz uma referência ou script. Só leitura.',
  inputSchema: {
    type: 'object',
    properties: { nome: { type: 'string' }, arquivo: { type: 'string', description: 'Caminho dentro da skill, ex.: references/armadilhas-certificadora.md' } },
  },
};

const GENERICAS: Ferramenta[] = [
  {
    name: 'niso_ler',
    description:
      'Lê qualquer área do projeto desta conexão, como o consultor vê na interface. caminho começa com /api/v1/ — o mapa das áreas está em niso_contexto. Arquivo binário (PDF, planilha, imagem) volta só como metadados.',
    inputSchema: { type: 'object', properties: { caminho: { type: 'string' } }, required: ['caminho'] },
  },
  {
    name: 'niso_executar',
    description:
      'Grava no projeto desta conexão, como o consultor faria na interface: POST, PUT, PATCH ou DELETE em /api/v1/... Apagar e gerar em lote exigem confirmado_pelo_usuario: true — antes, mostre ao usuário o que será feito (nome e id) e espere o "sim".',
    inputSchema: {
      type: 'object',
      properties: {
        metodo: { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
        caminho: { type: 'string' },
        corpo: { type: 'object' },
        confirmado_pelo_usuario: { type: 'boolean' },
      },
      required: ['metodo', 'caminho'],
    },
  },
];
/** Teto do texto devolvido ao modelo: trilha e dossiê podem ter megabytes. */
const LIMITE_TEXTO = 100_000;

const DISPONIVEIS: Ferramenta[] = [
  CONTEXTO,
  SKILL,
  ...GENERICAS,
  ...TOOLS.filter((t) => ferramentaPermitida(t.name, 'consultant') && !BLOQUEADAS.has(t.name)),
];
const NOMES = new Set(DISPONIVEIS.map((f) => f.name));

/**
 * O caminho que chega ao Worker tem de ser exatamente o que a ferramenta montou.
 * Recusa `%` (o Hono decodificaria `%67` em `g` antes de rotear), `#` (o
 * `new Request` o descarta), `\`, segmento `.`/`..` (o `new Request` os
 * resolve) e qualquer caminho que o parser de URL reescreva. Id com caractere
 * que precise de codificação é recusado junto: os ids do n.iso não têm.
 */
function caminhoSeguro(base: string, path: string): boolean {
  const q = path.indexOf('?');
  const rota = q === -1 ? path : path.slice(0, q);
  if (!rota.startsWith('/api/v1/') || /[%#\\]/.test(rota) || path.includes('#')) return false;
  if (rota.split('/').some((s) => s === '.' || s === '..')) return false;
  return new URL(base + rota).pathname === rota;
}

type Bruto = (path: string, init: RequestInit) => Promise<Response>;

/**
 * Chama as rotas /api/v1 do próprio Worker como o agente — sem rede, sem
 * cabeçalho forjável. A identidade vai SÓ em `env.AGENTE`; o Authorization do
 * /mcp (token OAuth) não é repassado.
 */
function requisicaoInterna(origem: Request, env: any, ctx: any, props: PropsAgente, fetchHono: FetchHono): Bruto {
  const base = new URL(origem.url).origin;
  // Espalhar o env preserva os bindings (DB, SESSIONS, STORAGE...): são
  // propriedades próprias e enumeráveis do objeto env no workerd.
  const envAgente = { ...env, AGENTE: props };
  // Allowlist de IP do tenant avalia o IP real do cliente MCP.
  const ip = origem.headers.get('CF-Connecting-IP');
  return async (path, init) => {
    if (!caminhoSeguro(base, path)) throw new Error('caminho de API recusado: deve começar com /api/v1/ e não pode conter %, # ou segmentos . e ..');
    const headers = new Headers(init.headers);
    if (ip) headers.set('CF-Connecting-IP', ip);
    return fetchHono(new Request(base + path, { ...init, headers }), envAgente, ctx);
  };
}

function transporteInterno(bruto: Bruto): Transporte {
  const chamar = async (path: string, init: RequestInit) => {
    const r = await bruto(path, init);
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

/** Serve agent-skills/ (embutidas em skills-gerado.ts). Só lê do mapa: `nome` e `arquivo` nunca viram caminho de disco. */
function skill(args: any): CallToolResult {
  const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });
  const falha = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });
  const nome = typeof args?.nome === 'string' ? args.nome : '';
  if (!nome) {
    return ok(
      Object.entries(SKILLS)
        .map(([n, s]) => `- ${n}: ${s.descricao}\n  arquivos: ${Object.keys(s.arquivos).join(', ')}`)
        .join('\n')
    );
  }
  const s = Object.hasOwn(SKILLS, nome) ? SKILLS[nome] : undefined;
  if (!s) return falha(`Skill não encontrada. Disponíveis: ${Object.keys(SKILLS).join(', ')}`);
  const arquivo = typeof args?.arquivo === 'string' && args.arquivo ? args.arquivo : 'SKILL.md';
  const texto = Object.hasOwn(s.arquivos, arquivo) ? s.arquivos[arquivo] : undefined;
  if (texto === undefined) return falha(`Arquivo não encontrado nesta skill. Disponíveis: ${Object.keys(s.arquivos).join(', ')}`);
  const outros = Object.keys(s.arquivos).filter((a) => a !== 'SKILL.md').join(', ');
  return ok(arquivo === 'SKILL.md' ? `${texto}\n\n---\nOutros arquivos desta skill (peça com niso_skill nome=${nome} arquivo=...): ${outros}` : texto);
}

async function genericas(nome: string, args: any, bruto: Bruto): Promise<CallToolResult> {
  const falha = (texto: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: texto }] });
  const caminho = typeof args?.caminho === 'string' ? args.caminho : '';
  const metodo = nome === 'niso_ler' ? 'GET' : String(args?.metodo ?? '').toUpperCase();
  if (nome === 'niso_executar' && !['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
    return falha('metodo deve ser POST, PUT, PATCH ou DELETE (para ler, use niso_ler)');
  }
  const headers = new Headers();
  const temCorpo = nome === 'niso_executar' && args?.corpo !== undefined;
  if (temCorpo) headers.set('Content-Type', 'application/json');
  // Só o booleano true confirma: "true" em texto é engano do modelo, não o "sim" do usuário.
  if (args?.confirmado_pelo_usuario === true) headers.set(CABECALHO_CONFIRMADO, '1');
  const r = await bruto(caminho, { method: metodo, headers, body: temCorpo ? JSON.stringify(args.corpo) : undefined });
  const tipo = r.headers.get('Content-Type') ?? '';
  if (/json|^text\//i.test(tipo)) {
    let texto = await r.text();
    if (texto.length > LIMITE_TEXTO) texto = texto.slice(0, LIMITE_TEXTO) + `
[resposta cortada em ${LIMITE_TEXTO} caracteres: filtre ou peça por item]`;
    return { isError: !r.ok, content: [{ type: 'text', text: `HTTP ${r.status}
${texto}` }] };
  }
  // Só medir: com Content-Length não lê o corpo; sem ele, lê (não há outro jeito de saber).
  const declarado = Number(r.headers.get('Content-Length'));
  let tamanho: number;
  if (r.headers.get('Content-Length') !== null && Number.isFinite(declarado)) {
    tamanho = declarado;
    await r.body?.cancel();
  } else {
    tamanho = (await r.arrayBuffer()).byteLength;
  }
  return { isError: !r.ok, content: [{ type: 'text', text: JSON.stringify({ status: r.status, tipo, tamanho, observacao: 'binário: abra na interface' }) }] };
}

export async function handlerMcp(req: Request, env: any, ctx: any, fetchHono: FetchHono): Promise<Response> {
  const props = ctx.props as PropsAgente | undefined;
  // Token OAuth válido não basta: a concessão pode ter sido revogada, expirada
  // ou perdido a designação. 401 (e não isError num 200) é o que faz o cliente
  // MCP descartar o token e reabrir o fluxo OAuth.
  if (!props || !(await concessaoValida(env.DB, props))) {
    return new Response(JSON.stringify({ error: 'Acesso do agente revogado ou expirado: conecte de novo.' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer error="invalid_token", error_description="acesso do agente revogado ou expirado"',
      },
    });
  }
  const bruto = requisicaoInterna(req, env, ctx, props, fetchHono);
  const t = transporteInterno(bruto);

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
        if (name === 'niso_skill') return skill(args);
        if (name === 'niso_ler' || name === 'niso_executar') return await genericas(name, args, bruto);
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
