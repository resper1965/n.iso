import { escapeHTML } from '../ui.js';

const URL_MCP = 'https://niso.ness.com.br/mcp';

// aConfirmar: OAuth não documentado no cliente; não prometer o que não foi visto funcionar.
const CLIENTES = [
    { id: 'claude', nome: 'Claude Code', onde: 'Terminal', aConfirmar: false,
      trecho: `claude mcp add --transport http niso ${URL_MCP}` },
    { id: 'cursor', nome: 'Cursor', onde: '.cursor/mcp.json', aConfirmar: false,
      trecho: `{ "mcpServers": { "niso": { "url": "${URL_MCP}" } } }` },
    { id: 'codex', nome: 'Codex', onde: '~/.codex/config.toml', aConfirmar: true,
      trecho: `[mcp_servers.niso]\nurl = "${URL_MCP}"` },
    { id: 'antigravity', nome: 'Antigravity', onde: '~/.gemini/config/mcp_config.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "serverUrl": "${URL_MCP}" } } }` },
];

window.__copiarTrecho = (id) => {
    const el = document.getElementById('trecho-' + id);
    if (el && navigator.clipboard) navigator.clipboard.writeText(el.textContent);
    window.showToast('Copiado');
};

function renderConectarAgente(c, h, a) {
    h.textContent = 'Conectar agente';
    a.innerHTML = '';
    const blocos = CLIENTES.map(cl => `
        <div class="card" style="margin-bottom:1rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                <div>
                    <span style="font-family:var(--font-heading,Montserrat);font-weight:600">${escapeHTML(cl.nome)}</span>
                    <span style="color:var(--text-2);font-size:0.8rem;margin-left:0.5rem">${escapeHTML(cl.onde)}</span>
                    ${cl.aConfirmar ? '<span style="color:var(--text-2);font-size:0.75rem;margin-left:0.5rem">(a confirmar: suporte a login OAuth ainda não verificado)</span>' : ''}
                </div>
                <button class="btn btn-sm" data-action="__copiarTrecho" data-args='["${cl.id}"]'>Copiar</button>
            </div>
            <pre id="trecho-${cl.id}" style="margin:0;padding:0.75rem;background:var(--bg);border:1px solid var(--border);border-radius:10px;font-family:var(--font-mono);font-size:0.8rem;white-space:pre-wrap;word-break:break-all">${escapeHTML(cl.trecho)}</pre>
        </div>`).join('');
    c.innerHTML = `
        <div style="max-width:760px">
            <p style="color:var(--text-2)">Endereço do servidor: <code style="font-family:var(--font-mono);color:var(--text)">${URL_MCP}</code></p>
            <p style="color:var(--text-2)">Na primeira chamada o cliente abre o navegador para você entrar no n.iso e escolher o cliente. Um cliente por conexão.</p>
            <p style="color:var(--text-2)">O MCP remoto só funciona no domínio oficial (niso.ness.com.br). O administrador do cliente vê esse acesso e pode revogá-lo.</p>
            ${blocos}
        </div>`;
}

export { renderConectarAgente };
window.renderConectarAgente = renderConectarAgente;
