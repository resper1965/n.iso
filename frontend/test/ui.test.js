// Testes de `src/ui.js` — os montadores de HTML compartilhados. Nao se testa
// aparencia aqui; testa-se ESCAPE (o CSP tem 'unsafe-inline', entao escapar e a
// unica defesa contra XSS refletido da API) e a traducao de status, que decide
// o que o cliente le na tela.
import { describe, it, expect } from 'vitest';
import {
    escapeHTML,
    renderPageHeader,
    renderStatCards,
    renderStatusBadge,
    renderDataTable,
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
        expect(html).toContain('#34c759');
    });

    it('aceita (texto, tipo) — ordem invertida', () => {
        const html = renderStatusBadge('Tudo certo', 'success');
        expect(html).toContain('Tudo certo');
        expect(html).toContain('#34c759');
    });

    it('sem tipo conhecido cai em neutral', () => {
        const html = renderStatusBadge('Rascunho', 'inexistente');
        expect(html).toContain('Rascunho');
        expect(html).toContain('var(--text-dim)');
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
        expect(html).toContain('#00ade8'); // venceu 'info' como TIPO
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
        expect((html.match(/<tr /g) || []).length).toBe(3); // 1 cabecalho + 2 dados
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
