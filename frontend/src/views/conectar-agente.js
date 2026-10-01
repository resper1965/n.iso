import { escapeHTML } from '../ui.js';

const URL_MCP = 'https://niso.ness.com.br/mcp';

// aConfirmar: só o Claude Code foi exercitado contra a produção (30/09/2026). Os outros três têm
// a configuração, mas o login OAuth deles não foi visto funcionar: não prometer o que não se viu.
const CLIENTES = [
    { id: 'claude', nome: 'Claude Code', onde: 'Terminal', aConfirmar: false,
      trecho: `claude mcp add --transport http niso ${URL_MCP}` },
    { id: 'cursor', nome: 'Cursor', onde: 'Arquivo .cursor/mcp.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "url": "${URL_MCP}" } } }` },
    { id: 'codex', nome: 'Codex', onde: 'Terminal', aConfirmar: true,
      trecho: `codex mcp add niso --url ${URL_MCP}\ncodex mcp login niso` },
    { id: 'antigravity', nome: 'Antigravity', onde: 'Arquivo ~/.gemini/config/mcp_config.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "serverUrl": "${URL_MCP}" } } }` },
];

const PASSOS = [
    { titulo: 'Adicione o servidor', texto: 'Copie o comando do seu cliente, na aba acima, e rode-o. O endereço já vai dentro dele.' },
    { titulo: 'Entre e escolha o cliente', texto: 'Na primeira chamada o navegador abre. Entre no n.iso e escolha um cliente: é um por conexão.' },
    { titulo: 'Chame niso_contexto', texto: 'Peça ao agente para começar por niso_contexto: ela diz o cliente, o mapa da app e os roteiros (diagnóstico, fechar lacuna, responder auditoria e a pré-avaliação de prontidão, que só lê).' },
];

// O que o agente faz hoje (docs/agente/README.md). Mudou o alcance? Mude aqui, no consentimento
// da tela OAuth (src/routes/oauth-autorizacao.ts) e no niso_contexto.
const ALCANCE = [
    { titulo: 'Lê', texto: 'Tudo o que você lê neste cliente: controles, riscos, evidências em texto, políticas, entrevistas, ROPA, DPIA, governança.' },
    { titulo: 'Grava', texto: 'Adequação, como você grava na interface: políticas, SoA, evidências em texto, controles, ativos e riscos.' },
    { titulo: 'Pede o seu "sim"', sim: true, texto: 'Apagar, gerar políticas em lote, eliminar dados de titular e revogar aprovações de controle. Ele mostra o que vai fazer antes.' },
    { titulo: 'Não faz', texto: 'Usuários, SSO, chaves de API, webhooks, sua conta pessoal, criar projeto e registrar achado de auditoria (quem implementa não audita: ISO 27001, 9.2).' },
];

let selecionado = 'claude';
let ultimo = null; // { c, h, a } da última renderização, para trocar de aba sem perder o contêiner

// "Copiado" só depois que a área de transferência aceitou; senão, diz que falhou.
window.__copiarTrecho = async (id) => {
    const el = document.getElementById('trecho-' + id);
    try {
        await navigator.clipboard.writeText(el.textContent);
        window.showToast('Copiado');
    } catch (e) {
        window.showToast('Não foi possível copiar — selecione o texto e copie manualmente', 'error');
    }
};

const bloco = (id, texto) => `
    <div class="ca-bloco">
        <pre id="trecho-${id}" class="ca-pre">${escapeHTML(texto)}</pre>
        <button class="btn btn-secondary" data-action="__copiarTrecho" data-args='["${id}"]' aria-label="Copiar">Copiar</button>
    </div>`;

const selo = (aConfirmar) => aConfirmar
    ? '<span class="ca-selo">A confirmar</span>'
    : '<span class="ca-selo ca-selo-ok">Verificado</span>';

function desenhar() {
    const { c, h, a } = ultimo;
    h.textContent = 'Conectar agente';
    a.innerHTML = '';
    const atual = CLIENTES.find(cl => cl.id === selecionado) || CLIENTES[0];

    const abas = CLIENTES.map(cl => {
        const ativa = cl.id === atual.id;
        return `<button type="button" role="tab" id="aba-${cl.id}" class="ca-aba" aria-selected="${ativa}" aria-controls="painel-cliente" tabindex="${ativa ? 0 : -1}" data-action="__selecionarCliente" data-args='["${cl.id}"]'>${escapeHTML(cl.nome)} ${selo(cl.aConfirmar)}</button>`;
    }).join('');

    const estado = atual.aConfirmar
        ? 'A configuração está pronta, mas o login deste cliente ainda não foi confirmado. Se falhar, avise a ness. dizendo em que etapa.'
        : 'Exercitado em produção em 30/09/2026: conexão, leitura e escrita.';

    const passos = PASSOS.map((p, i) => `
        <li class="ca-passo">
            <span class="ca-num">0${i + 1}</span>
            <div class="ca-passo-corpo">
                <div class="ca-passo-titulo">${escapeHTML(p.titulo)}</div>
                <p class="ca-passo-txt">${escapeHTML(p.texto)}</p>
            </div>
        </li>`).join('');

    const alcance = ALCANCE.map(x => `
        <article class="ca-alc${x.sim ? ' ca-alc-sim' : ''}">
            <h3 class="ca-alc-titulo">${escapeHTML(x.titulo)}</h3>
            <p class="ca-alc-txt">${escapeHTML(x.texto)}</p>
        </article>`).join('');

    c.innerHTML = `
        <div class="ca fade-in">
            <div class="ca-main">
                <section aria-label="Seu cliente MCP">
                    <h2 class="ca-titulo">Conectar o seu cliente</h2>
                    <p class="ca-nota">O endereço do servidor é o mesmo para todos. O login define quem é o agente e em qual cliente ele atua: ele age em nome de você, só nos clientes em que você é consultor, e a trilha registra o seu e-mail.</p>
                    <div class="ca-abas" role="tablist" aria-label="Cliente MCP" data-action-keydown="__abaTecla" data-arg-event>${abas}</div>
                    <div class="ca-painel" role="tabpanel" id="painel-cliente" aria-labelledby="aba-${atual.id}">
                        <div class="ca-painel-cab">
                            <span class="ca-onde">${escapeHTML(atual.onde)}</span>
                            <span class="ca-estado">${escapeHTML(estado)}</span>
                        </div>
                        ${bloco(atual.id, atual.trecho)}
                    </div>
                </section>
                <section aria-label="Como conectar">
                    <h2 class="ca-titulo">Em três passos</h2>
                    <ol class="ca-passos">${passos}</ol>
                </section>
            </div>
            <aside class="ca-lado" aria-label="O que o agente faz">
                <h2 class="ca-titulo">O que o agente faz</h2>
                <div class="ca-alcance">${alcance}</div>
                <p class="ca-rodape">O MCP remoto só funciona em niso.ness.com.br. O administrador do cliente vê este acesso em Governança e pode revogá-lo; ele também cai quando você troca a senha ou sai da governança do projeto.</p>
            </aside>
        </div>`;
}

function renderConectarAgente(c, h, a) {
    selecionado = 'claude';
    ultimo = { c, h, a };
    desenhar();
}

window.__selecionarCliente = (id) => {
    if (!ultimo || !CLIENTES.some(cl => cl.id === id)) return;
    selecionado = id;
    desenhar();
};

// Setas, Home e End movem a seleção e dão a volta (padrão WAI-ARIA de abas). O foco acompanha,
// porque redesenhar troca o botão no DOM.
window.__abaTecla = (e) => {
    const i = CLIENTES.findIndex(cl => cl.id === selecionado);
    const n = CLIENTES.length;
    const destino = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    window.__selecionarCliente(CLIENTES[destino].id);
    document.getElementById('aba-' + CLIENTES[destino].id)?.focus();
};

export { renderConectarAgente };
window.renderConectarAgente = renderConectarAgente;
