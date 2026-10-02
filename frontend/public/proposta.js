// Página do cliente para ler e responder a proposta (proposta.html). Sem sessão: a credencial é o
// token do link, que chega no FRAGMENTO (#token) — o navegador não o manda ao servidor nem o põe
// no Referer. Aqui ele sai da barra na hora (history.replaceState), fica só nesta variável e vai
// apenas no CORPO das rotas públicas (src/routes/public-propostas.ts). Nunca em URL nem console.
//
// Arquivo servido como está (public/), sem empacotar: script clássico, nada de import, e nenhum
// handler inline (CSP script-src 'self'). O documento entra num iframe srcdoc com sandbox sem
// allow-scripts: é o HTML congelado na geração, o mesmo que o comercial vê.
(function () {
    const API = '/api/v1/public/propostas/';
    const INVALIDO = 'Link inválido ou expirado';
    let token = '';
    let ocupado = false;
    // F5 sem o hash (que saiu da barra): o token fica na sessão desta aba, que some ao fechá-la
    const GUARDA = 'proposta-token';
    const guardar = (t) => { try { sessionStorage.setItem(GUARDA, t); } catch { /* sem storage: F5 pede o link de novo */ } };
    const guardado = () => { try { return sessionStorage.getItem(GUARDA) || ''; } catch { return ''; } };

    const $ = (id) => document.getElementById(id);
    const FUSO = 'America/Sao_Paulo';
    /** Data AAAA-MM-DD (validade) ou instante ISO/SQLite (aceite) -> DD/MM/AAAA. */
    function data(s) {
        if (!s) return '';
        const t = String(s);
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.split('-').reverse().join('/');
        const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(t) ? t.replace(' ', 'T') + 'Z' : t);
        return isNaN(d) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    }

    /** POST com o token no corpo. Devolve { status, corpo }; falha de rede vira status 0. */
    async function chamar(acao, extra) {
        try {
            const r = await fetch(API + acao, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...extra }),
                credentials: 'omit',
                cache: 'no-store',
            });
            let corpo = {};
            try { corpo = (await r.json()) || {}; } catch { /* corpo não é JSON */ }
            return { status: r.status, corpo };
        } catch {
            return { status: 0, corpo: {} };
        }
    }

    const MENSAGEM = {
        0: 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
        404: INVALIDO + '. Peça um novo link a quem enviou a proposta.',
        429: 'Muitas tentativas. Tente novamente mais tarde.',
    };
    const erroDe = (r) => MENSAGEM[r.status] || r.corpo.error || 'Não foi possível concluir. Tente de novo.';

    // ——— telas ———
    function estado(titulo, texto, aviso) {
        $('pp-proposta').hidden = true;
        $('pp-ir').hidden = true;
        $('pp-estado').hidden = false;
        $('pp-estado-titulo').textContent = titulo;
        $('pp-estado-texto').textContent = [aviso, texto].filter(Boolean).join(' ');
        $('pp-estado-titulo').focus();
    }

    function telaDoEstado(v, aviso) {
        switch (v.estado) {
            case 'aceita':
                return estado(`Proposta aceita em ${data(v.aceitaEm)} por ${v.aceitaPor || ''}`.trim(), 'O aceite está registrado. O comercial vai entrar em contato para os próximos passos.', aviso);
            case 'recusada':
                return estado('Proposta recusada', 'A recusa está registrada. Se mudou de ideia, fale com quem enviou a proposta.', aviso);
            case 'substituida':
                return estado('Existe uma versão mais nova; peça o novo link ao comercial', 'Esta versão foi substituída e não pode mais ser respondida.', aviso);
            case 'expirada':
                return estado('Proposta fora da validade', 'O prazo de validade desta proposta terminou. Peça uma versão atualizada ao comercial.', aviso);
            default:
                return estado(INVALIDO, 'Peça um novo link a quem enviou a proposta.', aviso);
        }
    }

    function mostrarProposta(v) {
        // nome da organização: o que o documento congelado mostra no cabeçalho (DOMParser não executa nada)
        const doc = new DOMParser().parseFromString(v.html || '', 'text/html');
        const org = (doc.querySelector('.run span')?.textContent || '').trim();
        $('pp-org').textContent = org || 'Proposta comercial';
        document.title = `Proposta ${v.numero}${org ? ' · ' + org : ''}`;
        $('pp-meta').textContent = `${v.numero} rev. ${v.revisao}${v.validaAte ? ` · válida até ${data(v.validaAte)}` : ''}`;
        $('pp-titulo').textContent = `Proposta ${v.numero} rev. ${v.revisao}`;
        $('pp-estado').hidden = true;
        $('pp-proposta').hidden = false;
        $('pp-ir').hidden = false;
        $('pp-doc').srcdoc = v.html;
    }

    async function carregar(aviso) {
        const r = await chamar('ver');
        if (r.status === 404) return estado(INVALIDO, 'Peça um novo link a quem enviou a proposta.', aviso);
        if (r.status !== 200) return estado(r.status === 429 ? 'Muitas tentativas' : 'Não foi possível abrir a proposta', erroDe(r), aviso);
        if (r.corpo.estado !== 'visualizada' || !r.corpo.html) return telaDoEstado(r.corpo, aviso);
        mostrarProposta(r.corpo);
        if (aviso) { $('pp-aviso').textContent = aviso; $('pp-aviso').hidden = false; }
    }

    // O iframe cresce até a altura do documento: a página rola uma vez só (no celular, rolagem
    // dentro de rolagem prende o dedo). Precisa de allow-same-origin para ler a altura.
    function ajustarAltura() {
        try {
            const d = $('pp-doc').contentDocument;
            // ponytail: +48 cobre o padding e a borda do iframe (box-sizing border-box) nas duas larguras do CSS
            if (d?.documentElement) $('pp-doc').style.height = d.documentElement.scrollHeight + 48 + 'px';
        } catch { /* sem acesso: fica a altura do CSS */ }
    }

    // ——— formulários ———
    function erroCampo(id, msg) {
        const el = $(id);
        $(id + '-erro').textContent = msg || '';
        if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
        return !msg;
    }
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const tamanho = (v, min, max, rotulo) => (v.length < min ? `Informe ${rotulo} (mínimo de ${min} caracteres).` : v.length > max ? `${rotulo} com no máximo ${max} caracteres.` : '');

    function abrirPainel(qual) {
        for (const p of ['aceitar', 'ajuste', 'recusar']) {
            const aberto = p === qual && $('pp-painel-' + p).hidden;
            $('pp-painel-' + p).hidden = !aberto;
            $('pp-op-' + p).setAttribute('aria-expanded', String(aberto));
            $('pp-op-' + p).classList.toggle('pp-opcao-ativa', aberto);
        }
        $('pp-aviso').hidden = true;
        const painel = $('pp-painel-' + qual);
        if (!painel.hidden) painel.querySelector('input, textarea')?.focus();
    }

    /** Uma ação por vez: dois cliques não viram duas chamadas. */
    async function enviando(botao, fn) {
        if (ocupado) return;
        ocupado = true;
        botao.disabled = true;
        try { await fn(); } finally { ocupado = false; botao.disabled = false; }
    }

    /** Erro de uma ação: 404 e 409 mudam a tela; o resto fica junto do formulário. */
    async function falhou(r, slot) {
        if (r.status === 404) return estado(INVALIDO, 'Peça um novo link a quem enviou a proposta.');
        if (r.status === 409) return carregar(r.corpo.error || 'Esta proposta já foi respondida.');
        $(slot).textContent = erroDe(r);
    }

    async function aceitar(e) {
        e.preventDefault();
        const nome = $('pp-nome').value.trim();
        const cargo = $('pp-cargo').value.trim();
        const email = $('pp-email').value.trim();
        const poderes = $('pp-poderes').checked;
        $('pp-aceitar-erro').textContent = '';
        const ok = [
            erroCampo('pp-nome', tamanho(nome, 2, 120, 'o nome')),
            erroCampo('pp-cargo', tamanho(cargo, 2, 120, 'o cargo')),
            erroCampo('pp-email', EMAIL.test(email) ? '' : 'Informe um e-mail válido.'),
            erroCampo('pp-poderes', poderes ? '' : 'Para aceitar, confirme que tem poderes para contratar em nome da empresa.'),
        ];
        if (ok.includes(false)) {
            $(['pp-nome', 'pp-cargo', 'pp-email', 'pp-poderes'][ok.indexOf(false)]).focus();
            return;
        }
        await enviando($('pp-aceitar-enviar'), async () => {
            const r = await chamar('aceitar', { nome, cargo, email, poderes: true });
            if (r.status === 200) return telaDoEstado({ estado: 'aceita', aceitaPor: nome, aceitaEm: r.corpo.aceitaEm || new Date().toISOString() });
            await falhou(r, 'pp-aceitar-erro');
        });
    }

    async function ajuste(e) {
        e.preventDefault();
        const mensagem = $('pp-mensagem').value.trim();
        $('pp-ajuste-erro').textContent = '';
        if (!erroCampo('pp-mensagem', mensagem ? '' : 'Escreva o que precisa mudar.')) return $('pp-mensagem').focus();
        await enviando($('pp-ajuste-enviar'), async () => {
            const r = await chamar('ajuste', { mensagem });
            if (r.status !== 200) return falhou(r, 'pp-ajuste-erro');
            $('pp-mensagem').value = '';
            abrirPainel('ajuste');
            $('pp-aviso').textContent = 'Pedido de ajuste enviado. O comercial vai responder com uma nova versão da proposta.';
            $('pp-aviso').hidden = false;
        });
    }

    function confirmarRecusa(sim) {
        $('pp-recusar-passo1').hidden = sim;
        $('pp-recusar-passo2').hidden = !sim;
        (sim ? $('pp-recusar-pergunta') : $('pp-recusar-pedir')).focus();
    }

    async function recusar() {
        const motivo = $('pp-motivo').value.trim();
        $('pp-recusar-erro').textContent = '';
        await enviando($('pp-recusar-confirmar'), async () => {
            const r = await chamar('recusar', motivo ? { motivo } : {});
            if (r.status === 200) return telaDoEstado({ estado: 'recusada' });
            await falhou(r, 'pp-recusar-erro');
        });
    }

    function iniciar() {
        if (!$('pp-main')) return;
        ocupado = false;
        token = location.hash.slice(1);
        if (token) guardar(token); else token = guardado();
        // some da barra, do histórico e de qualquer cópia do endereço
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        $('pp-doc').addEventListener('load', ajustarAltura);
        // botão, não âncora: com #pp-resposta no endereço, o F5 leria "pp-resposta" como token
        $('pp-ir').addEventListener('click', () => {
            $('pp-resposta').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            $('pp-resposta-titulo').focus({ preventScroll: true });
        });
        for (const p of ['aceitar', 'ajuste', 'recusar']) $('pp-op-' + p).addEventListener('click', () => abrirPainel(p));
        $('pp-painel-aceitar').addEventListener('submit', aceitar);
        $('pp-painel-ajuste').addEventListener('submit', ajuste);
        $('pp-painel-recusar').addEventListener('submit', (e) => { e.preventDefault(); confirmarRecusa(true); });
        $('pp-recusar-voltar').addEventListener('click', () => confirmarRecusa(false));
        $('pp-recusar-confirmar').addEventListener('click', recusar);
        if (!token) return estado(INVALIDO, 'Abra o endereço completo que recebeu, incluindo a parte depois do #.');
        carregar();
    }

    window.propostaPublica = { iniciar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
