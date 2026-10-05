// Configuração comercial da organização (GET/PUT /api/v1/org/config). O comercial só lê; quem grava
// é o platform_admin ou o consultoria_admin (o servidor recusa o resto, a tela só espelha: campos
// readonly, sem Salvar). O logo (GET/POST /api/v1/org/logo) é binário: fetch direto, fora do api().
import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth } from '../api.js';
import { escapeHTML } from '../ui.js';

const FAIXAS = { 1: 'Foundation', 2: 'Standard', 3: 'Enterprise' };
const TEXTOS = [
    ['sobre', 'Sobre a empresa', 3], ['comoTrabalhamos', 'Como trabalhamos', 4], ['equipe', 'Equipe', 3],
    ['termos', 'Termos e condições', 8], ['premissas', 'Premissas gerais', 3], ['pagamentoPadrao', 'Condição de pagamento padrão', 2],
];
const SECOES = [['como_trabalhamos', 'Como trabalhamos'], ['responsabilidades', 'Responsabilidades']];

let ultimo = null;
let cfg = null;
let podeEditar = false;
let logoAtualUrl = null;     // Blob URL do logo gravado
let logoNovoUrl = null;      // Blob URL da pré-visualização do arquivo escolhido
let logoArquivo = null;

const LOGO_TIPOS = ['image/png', 'image/jpeg'];
const LOGO_MAX = 200 * 1024;   // o mesmo LOGO_MAX_BYTES do servidor

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const num = (id) => { const s = val(id).trim().replace(',', '.'); return s === '' ? undefined : Number(s); };
const pct = (x) => +(x * 100).toFixed(2);   // 0,2 na API vira "20" na tela
const frac = (n) => (n === undefined ? undefined : +(n / 100).toFixed(4));

function campo(id, rotulo, valor, o = {}) {
    const f = `cfg-${id}`;
    // `readonly` não vale para <input type=color>: lá o que trava é `disabled`.
    const ro = podeEditar ? '' : (o.tipo === 'color' ? ' disabled' : ' readonly');
    const dica = o.dica ? `<p class="cfg-dica" id="${f}-dica">${escapeHTML(o.dica)}</p>` : '';
    const desc = `${o.dica ? `${f}-dica ` : ''}${f}-erro`;
    const ent = o.area
        ? `<textarea class="form-input" id="${f}" rows="${o.linhas || 3}" aria-describedby="${desc}"${ro}>${escapeHTML(valor)}</textarea>`
        : `<input class="form-input" id="${f}" type="${o.tipo || 'text'}"${o.tipo === 'number' ? ` step="${o.passo || 'any'}" min="0"` : ''} value="${escapeHTML(valor ?? '')}"${o.extra || ''} aria-describedby="${desc}"${ro}${o.acao ? ` data-action-input="${o.acao}"` : ''}>`;
    return `<div class="form-group">
        <label class="form-label" for="${f}">${escapeHTML(rotulo)}</label>${ent}${dica}
        <p class="cfg-erro" id="${f}-erro" role="alert"></p></div>`;
}

const marca = (id, rotulo, marcado) => `<div class="cfg-marca">
    <input type="checkbox" id="${id}"${marcado ? ' checked' : ''}${podeEditar ? '' : ' disabled'}>
    <label for="${id}">${escapeHTML(rotulo)}</label></div>`;

function porteLinha(p, i) {
    const f = `preco-porte-${i}`;
    return `<div class="cfg-porte-linha" data-porte="${i}">
        ${campo(`${f}-maxPessoas`, 'Até (pessoas)', p.maxPessoas ?? '', { tipo: 'number', passo: '1', extra: ' placeholder="sem limite"' })}
        ${campo(`${f}-fator`, 'Fator de preço', p.fator ?? '', { tipo: 'number' })}
        ${podeEditar ? `<button type="button" class="btn btn-secondary cfg-porte-del" data-action="__cfgPorteDel" data-args='["${i}"]'>Remover faixa ${i + 1}</button>` : ''}
    </div>`;
}

function porteHtml(porte) {
    return `<div id="cfg-preco-porte">${porte.map(porteLinha).join('')}</div>
        <p class="cfg-erro" id="cfg-preco-porte-erro" role="alert"></p>
        ${podeEditar ? '<button type="button" class="btn btn-secondary" data-action="__cfgPorteAdd">Adicionar faixa de porte</button>' : ''}`;
}

function lerPorte() {
    const linhas = [];
    for (let i = 0; $(`cfg-preco-porte-${i}-fator`); i++) {
        linhas.push({ maxPessoas: val(`cfg-preco-porte-${i}-maxPessoas`), fator: val(`cfg-preco-porte-${i}-fator`) });
    }
    return linhas;
}

function desenhar() {
    const { c, h, a } = ultimo;
    h.textContent = 'Configuração comercial';
    a.innerHTML = '';
    const p = cfg.preco;
    const t = cfg.textos;
    const trio = (nome, rotulo, obj) => `<div class="cfg-grade3">${[1, 2, 3].map((n) =>
        campo(`preco-${nome}-${n}`, `${rotulo}, ${FAIXAS[n]}`, obj[n], { tipo: 'number' })).join('')}</div>`;

    c.innerHTML = `
        ${blocoLogo()}
        <form id="cfg-form" class="cfg fade-in" data-action-submit="__cfgSalvar" data-arg-event data-prevent novalidate>
            ${podeEditar ? '' : '<p class="cfg-nota" role="note">Somente leitura: quem altera a configuração é o administrador da organização.</p>'}

            <section class="cfg-bloco" aria-labelledby="cfg-t-id">
                <h2 class="cfg-titulo" id="cfg-t-id">Identidade</h2>
                <div class="cfg-grade2">
                    ${campo('nome', 'Nome da empresa', cfg.nome)}
                    ${campo('cnpj', 'CNPJ', cfg.cnpj ?? '', { dica: '14 dígitos, só números.' })}
                </div>
                <div class="cfg-grade2">
                    ${campo('corDestaque', 'Cor de destaque', cfg.corDestaque, { tipo: 'color' })}
                    <div class="form-group">${marca('cfg-seloNiso', 'Mostrar o selo n.iso nas propostas', cfg.seloNiso)}</div>
                </div>
            </section>

            <section class="cfg-bloco" aria-labelledby="cfg-t-num">
                <h2 class="cfg-titulo" id="cfg-t-num">Numeração</h2>
                <div class="cfg-grade3">
                    ${campo('prefixoProposta', 'Prefixo', cfg.prefixoProposta, { acao: '__cfgPrevia', dica: '2 a 10 letras maiúsculas ou números.' })}
                    ${campo('proximoNumero', 'Próximo número', cfg.proximoNumero, { tipo: 'number', passo: '1', acao: '__cfgPrevia' })}
                    <div class="form-group">
                        <span class="form-label" id="cfg-previa-rotulo">Prévia do número</span>
                        <output class="cfg-previa" id="cfg-previa" for="cfg-prefixoProposta cfg-proximoNumero" aria-labelledby="cfg-previa-rotulo"></output>
                    </div>
                </div>
            </section>

            <section class="cfg-bloco" aria-labelledby="cfg-t-preco">
                <h2 class="cfg-titulo" id="cfg-t-preco">Preço</h2>
                <h3 class="cfg-sub">Diária de venda (R$)</h3>
                ${trio('diaria', 'Diária', p.diaria)}
                <h3 class="cfg-sub">Fator por porte da empresa</h3>
                <div id="cfg-porte-corpo">${porteHtml(p.porte)}</div>
                <div class="cfg-grade3">${campo('preco-tetoDesconto', 'Teto de desconto (%)', p.tetoDesconto, { tipo: 'number' })}</div>
                <details class="cfg-custos" id="cfg-custos">
                    <summary>Custo interno, overhead, tributos e margem-alvo</summary>
                    ${trio('custoInterno', 'Custo interno (R$/dia)', p.custoInterno)}
                    <div class="cfg-grade3">
                        ${campo('preco-overheadPct', 'Overhead (%)', pct(p.overheadPct), { tipo: 'number' })}
                        ${campo('preco-tributosPct', 'Tributos (%)', pct(p.tributosPct), { tipo: 'number' })}
                        ${campo('preco-margemAlvo', 'Margem-alvo (%)', pct(p.margemAlvo), { tipo: 'number' })}
                    </div>
                </details>
            </section>

            <section class="cfg-bloco" aria-labelledby="cfg-t-txt">
                <h2 class="cfg-titulo" id="cfg-t-txt">Textos</h2>
                ${TEXTOS.map(([k, rotulo, linhas]) => campo(`textos-${k}`, rotulo, t[k] ?? '', { area: true, linhas })).join('')}
                <fieldset class="cfg-secoes" id="cfg-secoesDesligadas">
                    <legend class="cfg-sub">Seções desligadas da proposta</legend>
                    ${SECOES.map(([k, rotulo]) => marca(`cfg-sec-${k}`, `Desligar a seção "${rotulo}"`, cfg.secoesDesligadas.includes(k))).join('')}
                    <p class="cfg-erro" id="cfg-secoesDesligadas-erro" role="alert"></p>
                </fieldset>
            </section>

            ${podeEditar ? '<div class="cfg-rodape"><button type="submit" class="btn btn-primary" id="cfg-salvar">Salvar</button></div>' : ''}
        </form>`;
    window.__cfgPrevia();
    carregarLogo();
}

async function renderConfigComercial(c, h, a) {
    ultimo = { c, h, a };
    podeEditar = S.user?.role === 'platform_admin' || S.user?.role === 'consultoria_admin';
    try {
        cfg = await api('GET', '/api/v1/org/config');
    } catch (e) {
        c.innerHTML = '<p class="cfg-nota" role="alert">Não foi possível carregar a configuração.</p>';
        window.showToast(e.message || 'Erro ao carregar a configuração', 'error');
        return;
    }
    desenhar();
}

// Prévia ao vivo: o mesmo formato do servidor (formatarNumeroProposta).
window.__cfgPrevia = () => {
    const out = $('cfg-previa');
    if (!out) return;
    const n = Math.max(1, Math.trunc(Number(val('cfg-proximoNumero'))) || 1);
    out.textContent = `${val('cfg-prefixoProposta')}-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
};

function redesenharPorte(linhas) {
    $('cfg-porte-corpo').innerHTML = porteHtml(linhas);
}
window.__cfgPorteAdd = () => {
    const linhas = lerPorte();
    if (linhas.length >= 8) return;
    redesenharPorte([...linhas, { maxPessoas: '', fator: '' }]);
    $(`cfg-preco-porte-${linhas.length}-maxPessoas`)?.focus();
};
window.__cfgPorteDel = (i) => {
    const linhas = lerPorte().filter((_, k) => k !== Number(i));
    if (linhas.length) redesenharPorte(linhas);
};

// Mesmo formato do configOrgSchema. Campo vazio vai como ausente (o servidor mantém o atual).
function montarCorpo() {
    const cnpj = val('cfg-cnpj').trim();
    const porte = lerPorte().map((l, i) => {
        const max = num(`cfg-preco-porte-${i}-maxPessoas`);
        return { maxPessoas: max === undefined ? null : max, fator: num(`cfg-preco-porte-${i}-fator`) };
    });
    const trio = (nome) => ({ '1': num(`cfg-preco-${nome}-1`), '2': num(`cfg-preco-${nome}-2`), '3': num(`cfg-preco-${nome}-3`) });
    return {
        nome: val('cfg-nome'),
        cnpj: cnpj === '' ? null : cnpj,
        corDestaque: val('cfg-corDestaque'),
        seloNiso: $('cfg-seloNiso').checked,
        prefixoProposta: val('cfg-prefixoProposta'),
        proximoNumero: num('cfg-proximoNumero'),
        preco: {
            diaria: trio('diaria'), porte, tetoDesconto: num('cfg-preco-tetoDesconto'),
            custoInterno: trio('custoInterno'), overheadPct: frac(num('cfg-preco-overheadPct')),
            tributosPct: frac(num('cfg-preco-tributosPct')), margemAlvo: frac(num('cfg-preco-margemAlvo')),
        },
        textos: Object.fromEntries(TEXTOS.map(([k]) => [k, val(`cfg-textos-${k}`)])),
        secoesDesligadas: SECOES.filter(([k]) => $(`cfg-sec-${k}`).checked).map(([k]) => k),
    };
}

function limparErros() {
    document.querySelectorAll('#cfg-form .cfg-erro').forEach((p) => { p.textContent = ''; });
    document.querySelectorAll('#cfg-form [aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

// O path do servidor ("preco.diaria.1") vira o id do campo ("cfg-preco-diaria-1"); sobe um nível
// se o campo exato não existe; o que não achar vai para um aviso geral no topo.
function mostrarErros(details = [], geral = '') {
    const sobra = [];
    for (const d of details) {
        let partes = String(d.path || '').split('.').filter(Boolean);
        let campoEl = null;
        while (partes.length && !(campoEl = $('cfg-' + partes.join('-')))) partes = partes.slice(0, -1);
        const erroEl = campoEl ? $(campoEl.id + '-erro') : null;
        if (!erroEl) { sobra.push(d.message); continue; }
        erroEl.textContent = d.message;
        campoEl.setAttribute('aria-invalid', 'true');
        campoEl.closest('details')?.setAttribute('open', '');
    }
    if (!details.length && geral) sobra.push(geral);
    if (sobra.length) window.showToast(sobra.join(' '), 'error');
    document.querySelector('#cfg-form [aria-invalid]')?.focus();
}

window.__cfgSalvar = async () => {
    if (!podeEditar) return;
    limparErros();
    const botao = $('cfg-salvar');
    botao.disabled = true;
    try {
        cfg = await api('PUT', '/api/v1/org/config', montarCorpo());
        window.showToast('Configuração salva');
        desenhar();
    } catch (e) {
        mostrarErros(e.body?.details, e.message || 'Erro ao salvar a configuração');
        botao.disabled = false;
    }
};

// ——— logo ———
const soltar = (u) => { if (u) URL.revokeObjectURL?.(u); return null; };

function blocoLogo() {
    logoNovoUrl = soltar(logoNovoUrl);
    logoArquivo = null;
    const envio = podeEditar ? `
        <div class="form-group">
            <label class="form-label" for="cfg-logo-arquivo">Novo logo</label>
            <input class="form-input" id="cfg-logo-arquivo" type="file" accept="image/png,image/jpeg" aria-describedby="cfg-logo-regras cfg-logo-arquivo-erro" data-action-change="__cfgLogoEscolher" data-arg-el>
            <p class="cfg-dica" id="cfg-logo-regras">PNG ou JPEG, até 200 KB. SVG não é aceito. O logo entra nas propostas geradas a partir de agora; as já geradas não mudam.</p>
            <p class="cfg-erro" id="cfg-logo-arquivo-erro" role="alert"></p>
        </div>
        <div class="cfg-logo-novo" id="cfg-logo-novo" hidden>
            <span class="cfg-sub">Pré-visualização (ainda não enviado)</span>
            <img class="cfg-logo-img" id="cfg-logo-previa" alt="Pré-visualização do novo logo">
            <button type="button" class="btn btn-primary" id="cfg-logo-enviar" data-action="__cfgLogoEnviar">Enviar logo</button>
        </div>` : '';
    return `<section class="cfg-bloco cfg-logo fade-in" aria-labelledby="cfg-t-logo">
        <h2 class="cfg-titulo" id="cfg-t-logo">Logo</h2>
        <div class="cfg-logo-atual" id="cfg-logo-atual"><p class="cfg-nota">Carregando o logo...</p></div>
        ${envio}
    </section>`;
}

async function carregarLogo() {
    const caixa = $('cfg-logo-atual');
    if (!caixa) return;
    logoAtualUrl = soltar(logoAtualUrl);
    let r = null;
    try {
        r = await fetch(API_BASE + '/api/v1/org/logo', { headers: cabecalhosAuth(), signal: AbortSignal.timeout(30000) });
        if (r.ok) logoAtualUrl = URL.createObjectURL(await r.blob());
    } catch { r = null; /* rede ou navegador sem Blob URL: cai no aviso, nunca em rejeição solta */ }
    if (logoAtualUrl) {
        caixa.innerHTML = `<img class="cfg-logo-img" id="cfg-logo-img" src="${escapeHTML(logoAtualUrl)}" alt="Logo atual da organização">`;
    } else {
        caixa.innerHTML = `<p class="cfg-nota" id="cfg-logo-sem">${r && r.status === 404
            ? 'A organização ainda não tem logo: as propostas mostram o nome em texto.'
            : 'Não foi possível carregar o logo.'}</p>`;
    }
}

function erroLogo(msg) {
    const p = $('cfg-logo-arquivo-erro');
    if (p) p.textContent = msg;
    const i = $('cfg-logo-arquivo');
    if (i) msg ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid');
}

// Conferência no cliente só poupa a viagem: quem decide é o servidor (bytes mágicos e teto).
window.__cfgLogoEscolher = (input) => {
    erroLogo('');
    logoNovoUrl = soltar(logoNovoUrl);
    logoArquivo = null;
    $('cfg-logo-novo').hidden = true;
    const f = input.files?.[0];
    if (!f) return;
    if (!LOGO_TIPOS.includes(f.type)) return erroLogo('Formato não aceito: envie PNG ou JPEG.');
    if (f.size > LOGO_MAX) return erroLogo(`Arquivo de ${Math.ceil(f.size / 1024)} KB: o limite é 200 KB.`);
    logoArquivo = f;
    logoNovoUrl = URL.createObjectURL(f);
    $('cfg-logo-previa').src = logoNovoUrl;
    $('cfg-logo-novo').hidden = false;
};

window.__cfgLogoEnviar = async () => {
    if (!podeEditar || !logoArquivo) return;
    const botao = $('cfg-logo-enviar');
    botao.disabled = true;
    erroLogo('');
    try {
        const r = await fetch(API_BASE + '/api/v1/org/logo', {
            method: 'POST', body: logoArquivo,
            headers: { ...cabecalhosAuth(), 'Content-Type': logoArquivo.type },
            signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) {
            let msg = '';
            try { msg = (await r.json()).error; } catch { /* corpo não é JSON */ }
            botao.disabled = false;
            return erroLogo(msg || `Erro ${r.status} ao enviar o logo.`);
        }
        window.showToast('Logo atualizado');
        $('cfg-logo-arquivo').value = '';
        logoNovoUrl = soltar(logoNovoUrl);
        logoArquivo = null;
        $('cfg-logo-novo').hidden = true;
        await carregarLogo();
    } catch {
        botao.disabled = false;
        erroLogo('Falha de rede ao enviar o logo.');
    }
};

export { renderConfigComercial };
window.renderConfigComercial = renderConfigComercial;
