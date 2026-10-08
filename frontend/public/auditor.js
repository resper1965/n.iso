// Portal do auditor externo (auditor.html). Sem sessão: a credencial é o token do link, que chega
// no FRAGMENTO (#token) — o navegador não o manda ao servidor nem o põe no Referer. Ele sai da barra
// na hora (history.replaceState), fica nesta variável (e na sessão da aba, para o F5) e vai só no
// CORPO das rotas de src/routes/public-auditor.ts. Nunca em URL nem no console.
//
// Script clássico servido como está (public/): nada de import, nenhum handler inline (CSP
// script-src 'self'). Todo dado do servidor entra por textContent ou por esc().
(function () {
    const INVALIDO = 'Link inválido ou expirado';
    const GUARDA = 'auditor-token';
    let token = '';
    const guardar = (t) => { try { sessionStorage.setItem(GUARDA, t); } catch { /* sem storage: F5 pede o link de novo */ } };
    const guardado = () => { try { return sessionStorage.getItem(GUARDA) || ''; } catch { return ''; } };

    const $ = (id) => document.getElementById(id);
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);

    const STATUS = { missing: 'Pendente', partial: 'Parcial', implemented: 'Implementado', approved: 'Aprovado', 'not applicable': 'Não aplicável', 'in progress': 'Em andamento' };
    const AVALIACAO = { pending: 'Pendente de revisão', conforming: 'Conforme', partial: 'Parcial', non_conforming: 'Não conforme' };
    const rotulo = (mapa, v) => mapa[String(v ?? '').toLowerCase()] || String(v ?? '');

    /** Instante do SQLite ('AAAA-MM-DD HH:MM:SS', UTC) ou ISO -> DD/MM/AAAA em Brasília. */
    function data(s) {
        if (!s) return '';
        const t = String(s);
        const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(t) ? t.replace(' ', 'T') + 'Z' : t);
        return isNaN(d) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    }

    // O código ("A.5.10") é o primeiro token do título (ver idDoControle em src/helpers.ts).
    const codigo = (titulo) => String(titulo || '').split(' ')[0];
    const tituloSemCodigo = (titulo) => String(titulo || '').slice(codigo(titulo).length).replace(/^\s*[—-]\s*/, '');
    // Ordem de leitura do auditor: A.5.2 antes de A.5.10 (texto inverteria). Mesma regra de
    // compareControlCode em frontend/src/views/compliance.js.
    function compara(x, y) {
        const seg = (s) => String(s || '').split(/[.\-_\s]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
        const A = seg(x);
        const B = seg(y);
        for (let i = 0; i < Math.max(A.length, B.length); i++) {
            const p = A[i];
            const q = B[i];
            if (p === undefined) return -1;
            if (q === undefined) return 1;
            if (typeof p === 'number' && typeof q === 'number') { if (p !== q) return p - q; }
            else if (String(p) !== String(q)) return String(p) < String(q) ? -1 : 1;
        }
        return 0;
    }

    /**
     * POST com o token no corpo. Falha de rede vira null. Quem chama passa o caminho literal
     * (/api/v1/public/auditor/...): é o que test/contrato-tela-api.test.ts confere contra as rotas.
     */
    async function chamar(caminho, extra) {
        try {
            return await fetch(caminho, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...extra }),
                credentials: 'omit',
                cache: 'no-store',
            });
        } catch {
            return null;
        }
    }
    async function lerJson(r) { try { return (await r.json()) || {}; } catch { return {}; } }

    function estado(titulo, texto) {
        $('pa-conteudo').hidden = true;
        $('pa-estado').hidden = false;
        $('pa-estado-titulo').textContent = titulo;
        $('pa-estado-texto').textContent = texto || '';
    }
    function falhou(r) {
        if (!r) return estado('Sem conexão', 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.');
        if (r.status === 404) return estado(INVALIDO, 'Peça um novo link à consultoria que conduz o projeto.');
        if (r.status === 429) return estado('Muitas tentativas', 'Tente novamente em alguns minutos.');
        return estado('Não foi possível abrir', 'Tente de novo em instantes.');
    }

    function evidencia(e) {
        return `<li class="pa-ev">
            <span class="pa-ev-nome">${esc(e.file_name)}</span>
            <span class="pa-ev-meta">${esc(data(e.created_at))} · ${esc(rotulo(AVALIACAO, e.evaluation_status))}</span>
            <code class="pa-hash" title="SHA-256 do arquivo">${esc(e.file_hash)}</code>
            <button type="button" class="pa-btn" data-baixar="${esc(e.id)}" data-nome="${esc(e.file_name)}">Baixar</button>
        </li>`;
    }

    function linha(c) {
        const evs = c.evidencias && c.evidencias.length
            ? `<ul class="pa-evs">${c.evidencias.map(evidencia).join('')}</ul>`
            : '<p class="pa-vazio">Nenhuma evidência ligada.</p>';
        const aplicabilidade = c.aplicavel
            ? 'Aplicável'
            : `Não aplicável<p class="pa-just">${esc(c.justificativa_exclusao || 'Sem justificativa registrada.')}</p>`;
        return `<tr>
            <th scope="row" class="pa-cod">${esc(codigo(c.title))}</th>
            <td>${esc(tituloSemCodigo(c.title))}</td>
            <td>${aplicabilidade}</td>
            <td>${esc(rotulo(STATUS, c.status))}</td>
            <td class="pa-num">${c.aplicavel ? esc(c.maturity ?? 0) : '—'}</td>
            <td>${evs}</td>
        </tr>`;
    }

    function mostrar(d) {
        const p = d.projeto || {};
        $('pa-org').textContent = p.project_name || p.client_name || 'Projeto';
        $('pa-meta').textContent = d.expira_em ? `Acesso válido até ${data(d.expira_em)}` : '';
        $('pa-cliente').textContent = p.client_name || '';
        $('pa-normas').textContent = p.standards || '';
        $('pa-escopo').textContent = p.scope || 'Escopo não registrado.';
        const porNorma = new Map();
        for (const c of d.controles || []) porNorma.set(c.standard, [...(porNorma.get(c.standard) || []), c]);
        $('pa-soa').innerHTML = [...porNorma.keys()].sort().map((norma) => {
            const lista = porNorma.get(norma).sort((a, b) => compara(codigo(a.title), codigo(b.title)));
            return `<section class="pa-norma" aria-label="${esc(norma)}">
                <h3 class="pa-norma-titulo">${esc(norma)} <span class="pa-conta">${lista.length} controles</span></h3>
                <div class="pa-tabela-wrap"><table class="pa-tabela">
                    <thead><tr><th scope="col">Controle</th><th scope="col">Título</th><th scope="col">Aplicabilidade</th><th scope="col">Status</th><th scope="col">Maturidade</th><th scope="col">Evidências</th></tr></thead>
                    <tbody>${lista.map(linha).join('')}</tbody>
                </table></div>
            </section>`;
        }).join('') || '<p class="pa-vazio">Nenhum controle registrado.</p>';
        const sem = d.evidencias_sem_controle || [];
        $('pa-sem-controle').hidden = !sem.length;
        $('pa-sem-controle-lista').innerHTML = sem.map(evidencia).join('');
        $('pa-estado').hidden = true;
        $('pa-conteudo').hidden = false;
    }

    async function carregar() {
        const r = await chamar('/api/v1/public/auditor/ver');
        if (!r || r.status !== 200) return falhou(r);
        mostrar(await lerJson(r));
        await listarNotas();
    }

    function salvar(blob, nome) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function baixar(botao) {
        $('pa-aviso').textContent = '';
        botao.disabled = true;
        try {
            const r = await chamar('/api/v1/public/auditor/evidencia', { evidence_id: botao.dataset.baixar });
            if (!r || r.status !== 200) {
                $('pa-aviso').textContent = r && r.status === 404
                    ? 'Arquivo não encontrado ou o link expirou. Peça um novo link à consultoria.'
                    : 'Não foi possível baixar. Tente de novo.';
                return;
            }
            salvar(await r.blob(), botao.dataset.nome || 'evidencia');
        } finally {
            botao.disabled = false;
        }
    }

    // A prova é paginada no servidor (500 pedidos por página): junta tudo num arquivo só.
    async function prova(botao) {
        $('pa-aviso').textContent = '';
        botao.disabled = true;
        try {
            const pedidos = [];
            let total = 0;
            for (let pagina = 1; ; pagina++) {
                const r = await chamar('/api/v1/public/auditor/pedidos', { pagina });
                if (!r || r.status !== 200) {
                    $('pa-aviso').textContent = 'Não foi possível baixar a prova dos pedidos. Tente de novo.';
                    return;
                }
                const d = await lerJson(r);
                pedidos.push(...(d.pedidos || []));
                total = d.total || 0;
                if (!d.truncado) break;
            }
            salvar(new Blob([JSON.stringify({ total, pedidos }, null, 2)], { type: 'application/json' }), 'prova-dos-pedidos.json');
        } finally {
            botao.disabled = false;
        }
    }

    // Perguntas do auditor (auditor_notes) com a resposta da consultoria, que a vê no modal "Notas do
    // Auditor" do projeto. Falha aqui não derruba a página: a lista só fica como estava.
    async function listarNotas() {
        const r = await chamar('/api/v1/public/auditor/notas');
        if (!r || r.status !== 200) return;
        const notas = (await lerJson(r)).notas || [];
        $('pa-nota-lista').innerHTML = notas.map((n) => `<li class="pa-nota-item">
            <p class="pa-nota-meta">${esc(data(n.created_at))}${n.control_title ? ' · ' + esc(n.control_title) : ''}</p>
            <p class="pa-nota-perg">${esc(n.content)}</p>
            <p class="pa-nota-resp">${n.response ? esc(n.response) + ' <span class="pa-nota-meta">(' + esc(data(n.responded_at)) + ')</span>' : '<span class="pa-nota-meta">Aguardando resposta</span>'}</p>
        </li>`).join('');
    }

    // Pergunta do auditor: grava em auditor_notes; a resposta volta pela lista acima.
    async function nota(botao) {
        const campo = $('pa-nota-texto');
        const content = campo.value.trim();
        if (!content) { $('pa-nota-msg').textContent = 'Escreva a pergunta antes de registrar.'; return; }
        botao.disabled = true;
        try {
            const r = await chamar('/api/v1/public/auditor/notas/criar', { content });
            if (!r || r.status !== 200) {
                $('pa-nota-msg').textContent = r && r.status === 404 ? INVALIDO + '.' : 'Não foi possível registrar. Tente de novo.';
                return;
            }
            campo.value = '';
            $('pa-nota-msg').textContent = 'Pergunta registrada.';
            await listarNotas();
        } finally {
            botao.disabled = false;
        }
    }

    function iniciar() {
        if (!$('pa-main')) return;
        token = location.hash.slice(1);
        if (token) guardar(token); else token = guardado();
        // some da barra, do histórico e de qualquer cópia do endereço
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        $('pa-main').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-baixar]');
            if (b) baixar(b);
        });
        $('pa-prova').addEventListener('click', () => prova($('pa-prova')));
        $('pa-nota-enviar').addEventListener('click', () => nota($('pa-nota-enviar')));
        if (!token) return estado(INVALIDO, 'Abra o endereço completo que recebeu, incluindo a parte depois do #.');
        carregar();
    }

    window.auditorPublico = { iniciar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
