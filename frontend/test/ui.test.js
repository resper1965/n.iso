// Testes de `src/ui.js` — os montadores de HTML compartilhados. Nao se testa
// aparencia aqui; testa-se ESCAPE (o CSP tem 'unsafe-inline', entao escapar e a
// unica defesa contra XSS refletido da API) e a traducao de status, que decide
// o que o cliente le na tela.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    escapeHTML,
    renderPageHeader,
    renderStatCards,
    renderStatusBadge,
    renderDataTable,
    showToast,
    TOAST_MS,
    traduzStatus,
} from '../src/ui.js';

describe('escapeHTML()', () => {
    it('escapa os cinco caracteres perigosos', () => {
        expect(escapeHTML('&')).toBe('&amp;');
        expect(escapeHTML('<')).toBe('&lt;');
        expect(escapeHTML('>')).toBe('&gt;');
        expect(escapeHTML('"')).toBe('&quot;');
        expect(escapeHTML("'")).toBe('&#39;');
    });

    it('neutraliza uma tag script inteira', () => {
        expect(escapeHTML('<script>alert(1)</script>')).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('escapa o & primeiro, sem dupla-escapada', () => {
        // Se a ordem estivesse invertida, '<' viraria '&amp;lt;'.
        expect(escapeHTML('<')).toBe('&lt;');
        expect(escapeHTML('&lt;')).toBe('&amp;lt;');
    });

    it('null e undefined viram string vazia, nao "null"', () => {
        expect(escapeHTML(null)).toBe('');
        expect(escapeHTML(undefined)).toBe('');
    });

    it('zero e false viram texto, nao vazio', () => {
        expect(escapeHTML(0)).toBe('0');
        expect(escapeHTML(false)).toBe('false');
    });

    it('nao escapa crase nem = (contexto de atributo sem aspas segue inseguro)', () => {
        // Documenta o limite: escapeHTML basta para conteudo de texto e para
        // atributo ENTRE ASPAS. Interpolar em atributo sem aspas continua
        // vulneravel, e nenhum teste deve dar a impressao contraria.
        expect(escapeHTML('a=b`c')).toBe('a=b`c');
    });
});

describe('renderStatusBadge()', () => {
    it('aceita (tipo, texto)', () => {
        const html = renderStatusBadge('success', 'Tudo certo');
        expect(html).toContain('Tudo certo');
        expect(html).toContain('#10b981');
    });

    it('aceita (texto, tipo) — ordem invertida', () => {
        const html = renderStatusBadge('Tudo certo', 'success');
        expect(html).toContain('Tudo certo');
        expect(html).toContain('#10b981');
    });

    it('sem tipo conhecido cai em neutral', () => {
        const html = renderStatusBadge('Rascunho', 'inexistente');
        expect(html).toContain('Rascunho');
        expect(html).toContain('#94a3b8');
    });

    it('preenche por color-mix e NAO desenha borda', () => {
        const html = renderStatusBadge('danger', 'Gap');
        expect(html).toContain('color-mix(in oklab, #ef4444 16%, transparent)');
        expect(html).toContain('border:0');
        expect(html).not.toMatch(/border:1px/);
    });

    it('usa a mono em caixa alta, sem raio', () => {
        const html = renderStatusBadge('info', '');
        expect(html).toContain('var(--font-mono)');
        expect(html).toContain('text-transform:uppercase');
        expect(html).toContain('border-radius:0');
    });

    it('traduz "na" para N/A — a aplicabilidade tem rotulo proprio', () => {
        expect(renderStatusBadge('na', 'neutral')).toContain('N/A');
    });

    it.each([
        ['implemented', 'Implementado'],
        ['not applicable', 'Não Aplicável'],
        ['in_progress', 'Em Andamento'],
        ['in progress', 'Em Andamento'],
        ['critical', 'Crítico'],
        ['pending', 'Pendente'],
    ])('traduz "%s" para "%s"', (entrada, esperado) => {
        expect(renderStatusBadge(entrada, 'info')).toContain(esperado);
    });

    it('a traducao ignora caixa e espacos das pontas', () => {
        expect(renderStatusBadge('  APPROVED  ', 'success')).toContain('Aprovado');
    });

    it('status desconhecido passa cru (sem inventar traducao)', () => {
        expect(renderStatusBadge('Aguardando ANPD', 'warning')).toContain('Aguardando ANPD');
    });

    it('escapa o texto vindo da API', () => {
        const html = renderStatusBadge('<img src=x onerror=alert(1)>', 'danger');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    // ARESTA: os dois argumentos sao posicionalmente ambiguos. Um status cujo
    // texto coincida com um nome de tipo ('info', 'danger', ...) e engolido
    // como TIPO e a badge sai sem texto. Nenhum status atual da API cai nisso,
    // mas o dia em que cair, a celula fica vazia em silencio.
    it('ARESTA: texto que coincide com nome de tipo e lido como tipo', () => {
        const html = renderStatusBadge('info', 'warning');
        expect(html).toContain('color:#00ade8'); // venceu 'info' como TIPO
        expect(html).toContain('>warning<'); // e 'warning' virou o TEXTO
    });
});

describe('renderStatCards()', () => {
    it('lista vazia ou ausente nao emite markup', () => {
        expect(renderStatCards([])).toBe('');
        expect(renderStatCards(null)).toBe('');
        expect(renderStatCards(undefined)).toBe('');
    });

    it('escapa label, value e subtext', () => {
        const html = renderStatCards([
            { label: '<b>L</b>', value: '<b>V</b>', subtext: '<b>S</b>' },
        ]);
        expect(html).not.toContain('<b>');
        expect((html.match(/&lt;b&gt;/g) || []).length).toBe(3);
    });

    it('converte value numerico sem virar vazio', () => {
        expect(renderStatCards([{ label: 'Leads', value: 0 }])).toContain('>0<');
    });

    it('usa a cor informada e cai no accent quando nao ha', () => {
        expect(renderStatCards([{ label: 'x', value: 1, color: '#ff0000' }])).toContain('#ff0000');
        expect(renderStatCards([{ label: 'x', value: 1 }])).toContain('var(--accent)');
    });

    it('omite o subtext quando nao existe', () => {
        expect(renderStatCards([{ label: 'x', value: 1 }])).not.toContain('margin-top:0.4rem');
    });
});

describe('renderPageHeader()', () => {
    it('escapa titulo e subtitulo', () => {
        const html = renderPageHeader('<script>a</script>', '<i>sub</i>');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;i&gt;sub&lt;/i&gt;');
    });

    it('sem subtitulo nao emite o paragrafo', () => {
        expect(renderPageHeader('Riscos')).not.toContain('<p ');
    });

    it('actionsHtml entra CRU (e o contrato: sao botoes montados pela view)', () => {
        expect(renderPageHeader('T', '', '<button id="x">ok</button>')).toContain('<button id="x">');
    });

    // Decisao registrada no cartao 6a: o titulo nomeia A TELA e a banda nao
    // carrega metadado de tenant/projeto. O subtitulo continua aceito na
    // assinatura, mas sai da banda e vira kicker - primeira linha do conteudo.
    it('o subtitulo NAO fica na banda do titulo: desce para o kicker', () => {
        const html = renderPageHeader('SoA', 'A.8.12 - Tecnologico');
        const banda = html.slice(html.indexOf('page-header-band'), html.indexOf('</div>'));
        expect(banda).not.toContain('A.8.12');
        expect(html).toContain('class="page-kicker"');
        expect(html.indexOf('page-kicker')).toBeGreaterThan(html.indexOf('page-title'));
    });

    it('as acoes ficam NA banda, ao lado do titulo', () => {
        const html = renderPageHeader('SoA', '', '<button>Exportar</button>');
        const banda = html.slice(html.indexOf('page-header-band'), html.indexOf('</div>'));
        expect(banda).toContain('header-actions-group');
    });
});

describe('renderDataTable()', () => {
    const colunas = [
        { label: 'Nome', key: 'name' },
        { label: 'Status', key: 'status', align: 'right' },
    ];

    it('sem linhas mostra o estado vazio padrao', () => {
        expect(renderDataTable(colunas, [])).toContain('Nenhum registro encontrado.');
        expect(renderDataTable(colunas, null)).toContain('Nenhum registro encontrado.');
    });

    it('aceita emptyState e emptyMessage, e escapa a mensagem', () => {
        expect(renderDataTable(colunas, [], { emptyState: 'Sem fornecedores' })).toContain(
            'Sem fornecedores'
        );
        expect(renderDataTable(colunas, [], { emptyMessage: 'Sem riscos' })).toContain('Sem riscos');
        expect(renderDataTable(colunas, [], { emptyState: '<b>x</b>' })).not.toContain('<b>');
    });

    it('escapa o cabecalho e respeita o alinhamento', () => {
        const html = renderDataTable([{ label: '<b>H</b>', key: 'a' }], [{ a: 1 }]);
        expect(html).not.toContain('<b>H</b>');
        expect(renderDataTable(colunas, [{ name: 'n', status: 's' }])).toContain('text-align:right');
    });

    it('coluna declarada como string vira label com alinhamento a esquerda', () => {
        expect(renderDataTable(['Nome'], [{ Nome: 'x' }])).toContain('text-align:left');
    });

    it('LINHA-OBJETO: escapa o valor vindo da API', () => {
        const html = renderDataTable(colunas, [{ name: '<img src=x onerror=alert(1)>', status: 'ok' }]);
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('LINHA-OBJETO: campo ausente vira celula vazia, nao "undefined"', () => {
        expect(renderDataTable(colunas, [{ name: 'n' }])).not.toContain('undefined');
    });

    it('LINHA-OBJETO: render() customizado entra cru (contrato da API)', () => {
        const html = renderDataTable(
            [{ label: 'Acoes', render: () => '<button>Ver</button>' }],
            [{ id: 1 }]
        );
        expect(html).toContain('<button>Ver</button>');
    });

    // RISCO REAL. Os dois caminhos de linha nao tem a mesma politica: objeto
    // escapa, array NAO. Como a maioria das views passa arrays (17 dos 18
    // pontos de chamada), a seguranca de cada tabela depende de a view lembrar
    // de chamar escapeHTML celula por celula — e ha celulas que esquecem
    // (ver `frontend/src/views/grc.js`, tabela de treinamentos: `r.score` e
    // `r.completion_date` sao interpolados crus).
    it('LINHA-ARRAY: celulas entram CRU, sem escape', () => {
        const html = renderDataTable(['Nome'], [['<img src=x onerror=alert(1)>']]);
        expect(html).toContain('<img src=x onerror=alert(1)>');
    });

    it('LINHA-ARRAY: celula null/undefined vira vazio', () => {
        const html = renderDataTable(['a', 'b'], [[null, undefined]]);
        expect(html).not.toContain('null');
        expect(html).not.toContain('undefined');
    });

    it('emite uma linha por registro', () => {
        const html = renderDataTable(colunas, [
            { name: 'a', status: 'x' },
            { name: 'b', status: 'y' },
        ]);
        expect((html.match(/<tr>/g) || []).length).toBe(3); // 1 cabecalho + 2 dados
    });

    it('TODA th e sticky com fundo opaco - inclusive a coluna de selecao', () => {
        const html = renderDataTable(
            [{ label: '', key: 'sel' }, { label: 'Nome', key: 'name' }],
            [{ sel: '', name: 'a' }]
        );
        const ths = html.match(/<th [^>]*>/g);
        expect(ths).toHaveLength(2);
        // A th vazia de selecao e a que costuma escapar e virar buraco
        // transparente no cabecalho fixo.
        ths.forEach(th => {
            expect(th).toContain('position:sticky');
            expect(th).toContain('background:var(--bg)');
        });
    });

    it('so emite aria-sort quando a coluna declara ordenacao', () => {
        expect(renderDataTable([{ label: 'Ctrl', key: 'a', sort: 'ascending' }], [{ a: 1 }]))
            .toContain('aria-sort="ascending"');
        expect(renderDataTable([{ label: 'Ctrl', key: 'a' }], [{ a: 1 }])).not.toContain('aria-sort');
    });

    it('coluna a direita ganha tabular-nums sem a view pedir', () => {
        const html = renderDataTable([{ label: 'CMMI', key: 'c', align: 'right' }], [{ c: 3 }]);
        expect((html.match(/tabular-nums/g) || []).length).toBe(2); // th + td
    });

    it('numeric:true alinha tabular mesmo a esquerda (codigo de controle)', () => {
        const html = renderDataTable([{ label: 'Ctrl', key: 'c', numeric: true }], [{ c: 'A.5.7' }]);
        expect(html).toContain('tabular-nums');
        expect(html).toContain('text-align:left');
    });

    it('coluna comum a esquerda NAO recebe tabular-nums', () => {
        expect(renderDataTable([{ label: 'Nome', key: 'n' }], [{ n: 'x' }])).not.toContain('tabular-nums');
    });

    it('densidade compacta encolhe o padding da celula', () => {
        expect(renderDataTable(colunas, [{ name: 'a' }])).toContain('padding:12px 10px');
        expect(renderDataTable(colunas, [{ name: 'a' }], { dense: true })).toContain('padding:7px 10px');
    });

    it('o hover saiu do inline: nada de onmouseenter/onmouseleave', () => {
        const html = renderDataTable(colunas, [{ name: 'a' }, { name: 'b' }]);
        expect(html).not.toContain('onmouseenter');
        expect(html).not.toContain('onmouseleave');
    });

    it('o container nao corta o overflow - sticky morre dentro de overflow:hidden', () => {
        expect(renderDataTable(colunas, [{ name: 'a' }])).not.toContain('overflow:hidden');
    });
});

describe('showToast()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="live-region" role="status" aria-live="polite"></div>';
    });
    afterEach(() => vi.useRealTimers());

    it('escreve na regiao ja montada, sem cria-la junto da mensagem', () => {
        showToast('Dono atribuido a 3 controles');
        // A regiao e a MESMA de antes: recriar a cada toast nao e anunciado.
        expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
        expect(document.getElementById('live-region').textContent).toBe('Dono atribuido a 3 controles');
    });

    it('nao injeta HTML da mensagem (a mensagem ecoa texto do servidor)', () => {
        showToast('<img src=x onerror=alert(1)>');
        expect(document.querySelector('.toast img')).toBeNull();
        expect(document.querySelector('.toast-text').textContent).toContain('<img');
    });

    it('sem callback nao ha botao Desfazer', () => {
        showToast('salvo');
        expect(document.querySelector('.toast-undo')).toBeNull();
    });

    it('com callback, Desfazer dispara e fecha o toast na hora', () => {
        const desfaz = vi.fn();
        showToast('3 controles marcados', 'info', desfaz);
        const btn = document.querySelector('.toast-undo');
        expect(btn.textContent).toBe('Desfazer');
        btn.click();
        expect(desfaz).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.toast')).toBeNull();
    });

    it('some sozinho em 4200ms, nao antes', () => {
        showToast('salvo');
        vi.advanceTimersByTime(TOAST_MS - 1);
        expect(document.querySelector('.toast')).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(document.querySelector('.toast')).toBeNull();
    });

    it('desfazer nao deixa o timer removendo um toast que ja saiu', () => {
        showToast('x', 'info', () => {});
        document.querySelector('.toast-undo').click();
        expect(() => vi.advanceTimersByTime(TOAST_MS * 2)).not.toThrow();
    });
});


describe('traduzStatus()', () => {
    // O dicionário saiu de dentro do `renderStatusBadge` porque nem toda tela
    // usa badge: a lista de riscos e a de controles pintam o valor com estilo
    // próprio e mostravam "High", "Medium", "Completed" e "In Progress" crus.
    it('traduz o vocabulário que o banco grava em inglês', () => {
        expect(traduzStatus('High')).toBe('Alto');
        expect(traduzStatus('Medium')).toBe('Médio');
        expect(traduzStatus('Completed')).toBe('Concluído');
        expect(traduzStatus('In Progress')).toBe('Em Andamento');
        expect(traduzStatus('Treated')).toBe('Tratado');
        expect(traduzStatus('Mitigate')).toBe('Mitigar');
    });

    it('não depende de caixa nem de espaço em volta', () => {
        expect(traduzStatus('  hIgH  ')).toBe('Alto');
    });

    it('valor desconhecido volta como veio — apagar a informação é pior', () => {
        expect(traduzStatus('Frobnicated')).toBe('Frobnicated');
    });

    it('vazio, null e undefined viram string vazia (nunca "undefined" na tela)', () => {
        // Era exatamente isto que aparecia em Riscos: "Tratamento: undefined".
        expect(traduzStatus(undefined)).toBe('');
        expect(traduzStatus(null)).toBe('');
        expect(traduzStatus('')).toBe('');
    });

    it('NÃO escapa — quem chama é que escapa, e o badge já faz isso', () => {
        // Deixar o escape aqui esconderia a responsabilidade de quem interpola
        // o valor direto no HTML, que é onde o bug estava.
        expect(traduzStatus('<b>x</b>')).toBe('<b>x</b>');
        expect(renderStatusBadge('<b>x</b>', 'info')).toContain('&lt;b&gt;');
    });
});
