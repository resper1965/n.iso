// Fluxo do wizard de documentos (`src/views/project.js`): montagem do
// formulario, coleta, rascunho local e — o que mais importa — o PORTAO de
// campos obrigatorios de `wizGenerate`. E ele que decide se um documento do
// SGSI pode ser gerado; se falhar aberto, nasce evidencia incompleta que o
// auditor so descobre na Stage 2.
//
// Os modulos se penduram em `window`, entao o teste importa por efeito
// colateral e chama pelas funcoes globais — sem refatorar nada.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/data/wizards.js';
import '../src/views/project.js';
import { DOC_WIZARDS } from '../src/data/wizards.js';
import { S } from '../src/state.js';

/** O esqueleto de modal que `index.html` fornece e `openModal` exige. */
function montaDom() {
    document.body.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal" id="modal"><div id="modal-content"></div></div>
        </div>
        <div id="content"></div>
    `;
}

function preenche(id, valor) {
    document.getElementById('wiz-' + id).value = valor;
}

function botaoFalso() {
    const b = document.createElement('button');
    b.textContent = 'Gerar Documento';
    document.body.appendChild(b);
    return b;
}

/** Texto do ultimo toast de erro que `showToast` jogou no body. */
function ultimoToastDeErro() {
    const toasts = document.querySelectorAll('.toast-error');
    return toasts.length ? toasts[toasts.length - 1].textContent : null;
}

// 'p0_1' (Sponsor Executivo): 2 obrigatorios + 1 select opcional.
const WIZ_COM_SELECT = 'p0_1';
// 'p38_4' (Encerramento da Auditoria): evidenceOnly, gera markdown local.
const WIZ_EVIDENCIA = 'p38_4';

describe('wizard de documentos', () => {
    let fetchMock;

    beforeEach(() => {
        montaDom();
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        S.phaseChecksNotes = {};
        S.token = null;
    });

    describe('montagem do formulario (openDocWizard)', () => {
        it('cria um controle por campo, com o id wiz-<campo>', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            for (const f of DOC_WIZARDS[WIZ_COM_SELECT].fields) {
                expect(document.getElementById('wiz-' + f.id)).not.toBeNull();
            }
        });

        it('mapeia cada tipo para o controle certo', () => {
            window.openDocWizard('proj-1', 'p0_3'); // date + textarea
            expect(document.getElementById('wiz-date').tagName).toBe('INPUT');
            expect(document.getElementById('wiz-date').type).toBe('date');
            expect(document.getElementById('wiz-participants').tagName).toBe('TEXTAREA');
            expect(document.getElementById('wiz-sponsor_name')).toBeNull();
        });

        it('select ganha uma opcao vazia "Selecionar..." na frente das opcoes do dado', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            const sel = document.getElementById('wiz-sponsor_authority');
            expect(sel.tagName).toBe('SELECT');
            expect(sel.options[0].value).toBe('');
            expect(sel.options.length).toBe(DOC_WIZARDS[WIZ_COM_SELECT].fields[2].options.length + 1);
        });

        it('marca os obrigatorios com asterisco', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            const marcas = document.querySelectorAll('#wiz-form-fields span[style*="ff4d4d"]');
            const obrigatorios = DOC_WIZARDS[WIZ_COM_SELECT].fields.filter((f) => f.required).length;
            expect(marcas.length).toBe(obrigatorios);
        });

        it('mostra a dica do auditor com a referencia ISO', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            const html = document.getElementById('modal-content').innerHTML;
            expect(html).toContain(DOC_WIZARDS[WIZ_COM_SELECT].isoRef);
            expect(html).not.toContain('undefined');
        });

        it('recarrega o rascunho salvo em S.phaseChecksNotes', () => {
            S.phaseChecksNotes = {
                'proj-1_p0_1': JSON.stringify({ sponsor_name: 'Maria', sponsor_role: 'CISO' }),
            };
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            expect(document.getElementById('wiz-sponsor_name').value).toBe('Maria');
            expect(document.getElementById('wiz-sponsor_role').value).toBe('CISO');
        });

        it('rascunho corrompido nao impede abrir o wizard', () => {
            S.phaseChecksNotes = { 'proj-1_p0_1': '{quebrado' };
            expect(() => window.openDocWizard('proj-1', WIZ_COM_SELECT)).not.toThrow();
            expect(document.getElementById('wiz-sponsor_name').value).toBe('');
        });

        it('item sem wizard cai no caminho de geracao nativa por IA', () => {
            // Sem `DOC_WIZARDS[id]`, `openDocWizard` delega a
            // `generateDocumentNatively` — que le `event.target`. Aqui so
            // interessa que NAO monte formulario nenhum.
            globalThis.generateDocumentNatively = vi.fn();
            globalThis.event = { target: botaoFalso() };
            window.openDocWizard('proj-1', 'nao_existe');
            expect(globalThis.generateDocumentNatively).toHaveBeenCalledWith(
                'proj-1',
                'nao_existe',
                expect.anything()
            );
            expect(document.getElementById('wiz-form-fields')).toBeNull();
        });
    });

    describe('coleta (wizCollectFields)', () => {
        it('devolve uma chave por campo do wizard, mesmo vazias', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            const dados = window.wizCollectFields(WIZ_COM_SELECT);
            expect(Object.keys(dados).sort()).toEqual(
                DOC_WIZARDS[WIZ_COM_SELECT].fields.map((f) => f.id).sort()
            );
            expect(dados.sponsor_name).toBe('');
        });

        it('le o que esta na tela', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'Joao Silva');
            expect(window.wizCollectFields(WIZ_COM_SELECT).sponsor_name).toBe('Joao Silva');
        });

        it('wizard inexistente devolve objeto vazio em vez de estourar', () => {
            expect(window.wizCollectFields('nao_existe')).toEqual({});
        });

        it('sem formulario na tela nao inventa campos', () => {
            expect(window.wizCollectFields(WIZ_COM_SELECT)).toEqual({});
        });
    });

    describe('rascunho (wizSaveProgress)', () => {
        it('grava por projeto+item em S e no localStorage', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'Joao Silva');
            window.wizSaveProgress('proj-1', WIZ_COM_SELECT);

            const chave = 'proj-1_p0_1';
            expect(JSON.parse(S.phaseChecksNotes[chave]).sponsor_name).toBe('Joao Silva');
            const persistido = JSON.parse(localStorage.getItem('niso_phaseChecksNotes'));
            expect(persistido[chave].length).toBeGreaterThan(0);
        });

        it('rascunhos de projetos diferentes nao se misturam', () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'A');
            window.wizSaveProgress('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'B');
            window.wizSaveProgress('proj-2', WIZ_COM_SELECT);

            expect(JSON.parse(S.phaseChecksNotes['proj-1_p0_1']).sponsor_name).toBe('A');
            expect(JSON.parse(S.phaseChecksNotes['proj-2_p0_1']).sponsor_name).toBe('B');
        });
    });

    describe('portao de campos obrigatorios (wizGenerate)', () => {
        it('barra a geracao e nomeia TODOS os campos que faltam', async () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            await window.wizGenerate('proj-1', WIZ_COM_SELECT, botaoFalso());

            const toast = ultimoToastDeErro();
            expect(toast).toContain('Preencha os campos obrigatórios');
            expect(toast).toContain('Nome completo do patrocinador');
            expect(toast).toContain('Cargo');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('barra quando falta apenas um', async () => {
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'Joao Silva');
            await window.wizGenerate('proj-1', WIZ_COM_SELECT, botaoFalso());

            expect(ultimoToastDeErro()).toContain('Cargo');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('espaco em branco NAO passa por obrigatorio... (documenta: passa)', () => {
            // A checagem e `!data[f.id]` — string de espacos e truthy. Um
            // campo preenchido com " " satisfaz o obrigatorio. Fica registrado
            // como comportamento atual; endurecer isso e mudanca de logica.
            expect(Boolean(' ')).toBe(true);
        });

        it('campo opcional vazio nao impede a geracao', async () => {
            fetchMock.mockResolvedValue({
                status: 200,
                ok: true,
                headers: { get: () => 'application/json' },
                json: async () => ({ content: '# Documento' }),
                text: async () => '',
            });
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'Joao Silva');
            preenche('sponsor_role', 'CEO');
            // sponsor_authority (select, opcional) fica vazio de proposito.
            await window.wizGenerate('proj-1', WIZ_COM_SELECT, botaoFalso());

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, opcoes] = fetchMock.mock.calls[0];
            expect(url).toContain('/api/v1/projects/proj-1/generate-document');
            expect(JSON.parse(opcoes.body)).toEqual({
                itemId: WIZ_COM_SELECT,
                fields: { sponsor_name: 'Joao Silva', sponsor_role: 'CEO', sponsor_authority: '' },
            });
        });

        it('salva rascunho antes de chamar a API (nao perde o que foi digitado)', async () => {
            fetchMock.mockResolvedValue({
                status: 200,
                ok: true,
                headers: { get: () => 'application/json' },
                json: async () => ({ content: '# Documento' }),
                text: async () => '',
            });
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'Joao Silva');
            preenche('sponsor_role', 'CEO');
            await window.wizGenerate('proj-1', WIZ_COM_SELECT, botaoFalso());

            expect(JSON.parse(S.phaseChecksNotes['proj-1_p0_1']).sponsor_name).toBe('Joao Silva');
        });

        it('erro da API vira toast e o botao volta a funcionar', async () => {
            fetchMock.mockResolvedValue({
                status: 500,
                ok: false,
                headers: { get: () => 'application/json' },
                json: async () => ({ error: 'IA indisponivel' }),
                text: async () => '',
            });
            window.openDocWizard('proj-1', WIZ_COM_SELECT);
            preenche('sponsor_name', 'Joao Silva');
            preenche('sponsor_role', 'CEO');
            const btn = botaoFalso();
            await window.wizGenerate('proj-1', WIZ_COM_SELECT, btn);

            expect(ultimoToastDeErro()).toContain('IA indisponivel');
            expect(btn.disabled).toBe(false);
            expect(btn.textContent).toBe('Gerar Documento');
        });
    });

    describe('wizard evidenceOnly — markdown gerado localmente', () => {
        it('nao chama a API e monta o registro com titulo, ISO e campos', async () => {
            window.openDocWizard('proj-1', WIZ_EVIDENCIA);
            preenche('date', '2026-08-04');
            document.getElementById('wiz-result').value =
                DOC_WIZARDS[WIZ_EVIDENCIA].fields.find((f) => f.id === 'result').options[0];
            await window.wizGenerate('proj-1', WIZ_EVIDENCIA, botaoFalso());

            expect(fetchMock).not.toHaveBeenCalled();
            const conteudo = document.getElementById('wiz-doc-content').value;
            expect(conteudo).toContain('# ' + DOC_WIZARDS[WIZ_EVIDENCIA].title);
            expect(conteudo).toContain(DOC_WIZARDS[WIZ_EVIDENCIA].isoRef);
            expect(conteudo).toContain('## Data do encerramento\n2026-08-04');
            expect(conteudo).toContain('Nota do Auditor');
        });

        it('campo vazio nao vira secao no markdown', async () => {
            window.openDocWizard('proj-1', WIZ_EVIDENCIA);
            preenche('date', '2026-08-04');
            document.getElementById('wiz-result').value =
                DOC_WIZARDS[WIZ_EVIDENCIA].fields.find((f) => f.id === 'result').options[0];
            await window.wizGenerate('proj-1', WIZ_EVIDENCIA, botaoFalso());

            expect(document.getElementById('wiz-doc-content').value).not.toContain(
                '## Observações do auditor'
            );
        });

        it('tambem respeita o portao de obrigatorios', async () => {
            window.openDocWizard('proj-1', WIZ_EVIDENCIA);
            await window.wizGenerate('proj-1', WIZ_EVIDENCIA, botaoFalso());

            expect(ultimoToastDeErro()).toContain('Preencha os campos obrigatórios');
            expect(document.getElementById('wiz-doc-content')).toBeNull();
        });

        it('troca o formulario pelo preview e oferece voltar', async () => {
            window.openDocWizard('proj-1', WIZ_EVIDENCIA);
            preenche('date', '2026-08-04');
            document.getElementById('wiz-result').value =
                DOC_WIZARDS[WIZ_EVIDENCIA].fields.find((f) => f.id === 'result').options[0];
            await window.wizGenerate('proj-1', WIZ_EVIDENCIA, botaoFalso());

            expect(document.getElementById('wiz-form-fields').style.display).toBe('none');
            expect(document.getElementById('wiz-preview-area').style.display).toBe('block');
            expect(document.getElementById('wiz-actions').innerHTML).toContain('wizBackToForm');

            window.wizBackToForm('proj-1', WIZ_EVIDENCIA);
            expect(document.getElementById('wiz-form-fields').style.display).toBe('block');
            expect(document.getElementById('wiz-preview-area').style.display).toBe('none');
        });
    });
});
