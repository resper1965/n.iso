// O upload pelo checklist mandava o item como `document_type` (ignorado pelo servidor) e,
// sem importar API_BASE, nem chegava a sair. O treinamento subia certificado sem controle e
// gravava "<id>|undefined". O selo do checklist comparava com a grafia antiga do status.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/grc.js';
import { S } from '../src/state.js';
import { servir } from './servir-api.js';

function comArquivo(input, nome) {
    Object.defineProperty(input, 'files', { value: [new File(['x'], nome, { type: 'application/pdf' })] });
}

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 't';
    S.activeProject = { id: 'p1' };
    window.render = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('upload pelo checklist', () => {
    it('envia o item no campo item_id', async () => {
        // corpo real de POST /documents/upload: { ok: true, id }
        const f = servir({ 'POST /api/v1/projects/p1/documents/upload': { ok: true, id: 'ev-1' } });
        await window.wsUploadEvidence('p15_1');
        comArquivo(document.getElementById('doc-file'), 'politica.pdf');
        await window.doDocUpload('p15_1');
        expect(f).toHaveBeenCalledTimes(1);
        expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/projects\/p1\/documents\/upload$/);
        expect(f.mock.calls[0][1].body.get('item_id')).toBe('p15_1');
    });
});

describe('selo da avaliação no checklist', () => {
    it('usa o domínio canônico do status', () => {
        expect(window.seloDaAvaliacao('conforming')).toMatchObject({ rotulo: 'Conforme', problema: false });
        expect(window.seloDaAvaliacao('partial')).toMatchObject({ rotulo: 'Parcial', problema: true });
        expect(window.seloDaAvaliacao('non_conforming')).toMatchObject({ rotulo: 'Não conforme', problema: true });
        expect(window.seloDaAvaliacao('pending')).toMatchObject({ rotulo: 'Aguarda revisão', problema: false });
        expect(window.seloDaAvaliacao('')).toMatchObject({ rotulo: 'Aguarda revisão', problema: false });
    });
});

describe('certificado de treinamento', () => {
    it('sugere o controle A.6.3 e guarda id e nome do arquivo', async () => {
        document.body.innerHTML += '<div id="tr-upload-status"></div><input id="tr-evidence"><input type="file" id="tr-file">';
        // corpo real de POST /evidence/upload: id e sha256, sem nome de arquivo
        const f = servir({ 'POST /api/v1/projects/p1/evidence/upload': { ok: true, id: 'ev-9', sha256: 'abc' } });
        const input = document.getElementById('tr-file');
        comArquivo(input, 'certificado.pdf');
        await window.uploadTrainingEvidence(input, 'p1');
        expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/projects\/p1\/evidence\/upload$/);
        expect(f.mock.calls[0][1].body.get('control_ref')).toBe('A.6.3');
        expect(document.getElementById('tr-evidence').value).toBe('ev-9|certificado.pdf');
    });
});
