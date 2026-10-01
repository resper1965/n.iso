import { escapeHTML } from '../ui.js';

const URL_MCP = 'https://niso.ness.com.br/mcp';

// aConfirmar: só o Claude Code foi exercitado contra a produção (30/09/2026). Os outros três têm
// a configuração, mas o login OAuth deles não foi visto funcionar: não prometer o que não se viu.
const CLIENTES = [
    { id: 'claude', nome: 'Claude Code', onde: 'Terminal', aConfirmar: false,
      trecho: `claude mcp add --transport http niso ${URL_MCP}` },
    { id: 'cursor', nome: 'Cursor', onde: '.cursor/mcp.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "url": "${URL_MCP}" } } }` },
    { id: 'codex', nome: 'Codex', onde: 'Terminal', aConfirmar: true,
      trecho: `codex mcp add niso --url ${URL_MCP}\ncodex mcp login niso` },
    { id: 'antigravity', nome: 'Antigravity', onde: '~/.gemini/config/mcp_config.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "serverUrl": "${URL_MCP}" } } }` },
];

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
    <div style="display:flex;gap:8px;align-items:stretch">
        <pre id="trecho-${id}" style="flex:1;min-width:0;margin:0;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;font-family:var(--font-mono);font-size:13px;white-space:pre-wrap;word-break:break-all">${escapeHTML(texto)}</pre>
        <button class="btn btn-secondary" data-action="__copiarTrecho" data-args='["${id}"]' aria-label="Copiar">Copiar</button>
    </div>`;

// O que o agente faz hoje (docs/agente/README.md). Mudou o alcance? Mude aqui, no consentimento
// da tela OAuth (src/routes/oauth-autorizacao.ts) e no niso_contexto.
const ALCANCE = [
    { titulo: 'Lê', texto: 'Tudo o que você lê neste cliente: controles, riscos, evidências em texto, políticas, entrevistas, ROPA, DPIA, governança.' },
    { titulo: 'Grava', texto: 'Adequação, como você grava na interface: políticas, SoA, evidências em texto, controles, ativos e riscos.' },
    { titulo: 'Pede o seu "sim"', texto: 'Apagar, gerar políticas em lote, eliminar dados de titular e revogar aprovações. Ele mostra o que vai fazer antes.' },
    { titulo: 'Não faz', texto: 'Usuários, SSO, chaves de API, webhooks, sua conta pessoal, criar projeto e registrar achado de auditoria (quem implementa não audita: ISO 27001, 9.2).' },
];

function renderConectarAgente(c, h, a) {
    h.textContent = 'Conectar agente';
    a.innerHTML = '';
    const selo = (aConfirmar) => aConfirmar
        ? '<span class="org-badge" style="color:var(--text-dim);border-color:var(--border)" title="Login OAuth deste cliente ainda não verificado">A confirmar</span>'
        : '<span class="org-badge" title="Exercitado em produção em 30/09/2026">Verificado</span>';
    const cartoes = CLIENTES.map(cl => `
        <section class="gov-section-card" aria-label="${escapeHTML(cl.nome)}">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
                <h3 class="gov-section-title" style="border:0;padding:0;margin:0">${escapeHTML(cl.nome)}</h3>
                ${selo(cl.aConfirmar)}
            </div>
            <div class="gov-member-email" style="font-family:var(--font-mono);margin-bottom:8px">${escapeHTML(cl.onde)}</div>
            ${bloco(cl.id, cl.trecho)}
        </section>`).join('');
    const alcance = ALCANCE.map(x => `
        <section class="gov-section-card" aria-label="${escapeHTML(x.titulo)}">
            <h3 class="gov-section-title" style="border:0;padding:0;margin:0 0 6px">${escapeHTML(x.titulo)}</h3>
            <p style="margin:0;font-size:14px;color:var(--text-2)">${escapeHTML(x.texto)}</p>
        </section>`).join('');
    c.innerHTML = `
        <div class="fade-in" style="max-width:1120px;display:flex;flex-direction:column;gap:24px">
            <div>
                <p class="org-header-intro" style="margin-bottom:12px">Conecte seu agente de IA ao n.iso para trabalhar a adequação de um cliente em que você é consultor designado.</p>
                <p style="margin:0 0 12px;font-size:14px;color:var(--text-2)">O login define quem é o agente e em qual cliente ele atua. Ele age em nome de você, só nos clientes em que você é consultor, e a trilha registra o seu e-mail.</p>
                <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--text-2)">
                    <li>Adicione o servidor no seu cliente MCP (trechos abaixo).</li>
                    <li>Na primeira chamada, o navegador abre: entre no n.iso e escolha o cliente. Um cliente por conexão.</li>
                    <li>Peça ao agente para chamar <code style="font-family:var(--font-mono);color:var(--text)">niso_contexto</code>: ele diz o cliente, o mapa da app e os roteiros (diagnóstico, fechar lacuna, responder auditoria e a pré-avaliação de prontidão para certificação, que só lê).</li>
                </ol>
            </div>
            <div>
                <div class="gov-section-title" style="border:0;padding:0">Endereço do servidor</div>
                ${bloco('url', URL_MCP)}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px">${cartoes}</div>
            <div>
                <div class="gov-section-title" style="border:0;padding:0">O que o agente faz</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">${alcance}</div>
            </div>
            <p class="gov-agentes-nota" style="color:var(--text-dim)">O MCP remoto só funciona em niso.ness.com.br. O administrador do cliente vê este acesso em Governança e pode revogá-lo; ele também cai quando você troca a senha ou sai da governança do projeto.</p>
        </div>`;
}

export { renderConectarAgente };
window.renderConectarAgente = renderConectarAgente;
