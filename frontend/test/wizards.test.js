// Contrato de dados de `src/data/wizards.js` (170 wizards, 999 linhas).
// Nada valida essa estrutura em tempo de execucao: `openDocWizard` le
// `wiz.title`, `wiz.isoRef`, `wiz.auditorTip` e `wiz.fields[].{id,label,type}`
// e interpola direto no HTML. Um campo faltando nao da erro — imprime
// "undefined" na tela do cliente. Estes testes sao a barreira que falta.
//
// Cada teste varre os 170 wizards e ACUMULA os infratores em uma lista, em vez
// de usar `it.each` por wizard: um `expect(lista).toEqual([])` que falha nomeia
// todos os culpados de uma vez, e a suite nao vira 1.400 casos de ruido.
import { describe, it, expect } from 'vitest';
import { DOC_WIZARDS } from '../src/data/wizards.js';

const CHAVES = Object.keys(DOC_WIZARDS);
const CASOS = CHAVES.map((k) => [k, DOC_WIZARDS[k]]);

// Os unicos tipos que `openDocWizard` sabe montar. Qualquer outro cai no
// `else` e vira <input type="text"> em silencio — um select viraria caixa de
// texto livre, perdendo a restricao de dominio.
const TIPOS_SUPORTADOS = ['text', 'textarea', 'select', 'date'];

/** Percorre todos os campos de todos os wizards. */
function varreCampos(fn) {
    const infratores = [];
    for (const [chave, wiz] of CASOS) {
        if (!Array.isArray(wiz.fields)) continue;
        for (const f of wiz.fields) {
            const motivo = fn(f, wiz, chave);
            if (motivo) infratores.push(`${chave}.${f.id ?? '(sem id)'}: ${motivo}`);
        }
    }
    return infratores;
}

describe('DOC_WIZARDS — contrato de estrutura', () => {
    it('tem wizards e todas as chaves seguem o padrao pFASE_ITEM', () => {
        expect(CHAVES.length).toBeGreaterThan(0);
        expect(CHAVES.filter((k) => !/^p\d+_\d+$/.test(k))).toEqual([]);
    });

    it('as fases referenciadas cabem nas 41 fases do projeto (0 a 40)', () => {
        const fora = CHAVES.filter((k) => {
            const fase = Number(k.match(/^p(\d+)_/)[1]);
            return fase < 0 || fase > 40;
        });
        expect(fora).toEqual([]);
    });

    it('todo wizard tem title, isoRef e auditorTip nao vazios', () => {
        // O modal imprime `Dica do Auditor (${wiz.isoRef})` sem fallback: um
        // campo ausente vira a palavra "undefined" na tela do cliente.
        const faltando = [];
        for (const [chave, wiz] of CASOS) {
            for (const prop of ['title', 'isoRef', 'auditorTip']) {
                if (typeof wiz[prop] !== 'string' || wiz[prop].trim() === '') {
                    faltando.push(`${chave}.${prop}`);
                }
            }
        }
        expect(faltando).toEqual([]);
    });

    it('todo wizard tem pelo menos um campo', () => {
        const vazios = CHAVES.filter(
            (k) => !Array.isArray(DOC_WIZARDS[k].fields) || DOC_WIZARDS[k].fields.length === 0
        );
        expect(vazios).toEqual([]);
    });

    it('todo campo tem id, label e tipo suportado', () => {
        expect(
            varreCampos((f) => {
                if (typeof f.id !== 'string' || f.id.trim() === '') return 'id ausente';
                if (typeof f.label !== 'string' || f.label.trim() === '') return 'label ausente';
                if (!TIPOS_SUPORTADOS.includes(f.type)) return `tipo nao suportado: ${f.type}`;
                return null;
            })
        ).toEqual([]);
    });

    it('ids de campo sao unicos dentro de cada wizard', () => {
        // `wizCollectFields` busca por `document.getElementById('wiz-' + id)`.
        // Id repetido faria dois campos colapsarem em um so na coleta, e o
        // segundo valor sumiria do documento gerado.
        const duplicados = [];
        for (const [chave, wiz] of CASOS) {
            const ids = (wiz.fields || []).map((f) => f.id);
            if (new Set(ids).size !== ids.length) duplicados.push(chave);
        }
        expect(duplicados).toEqual([]);
    });

    it('ids sao seguros como sufixo de id de elemento', () => {
        expect(varreCampos((f) => (/^[a-z0-9_]+$/i.test(f.id) ? null : 'id com caractere invalido'))).toEqual([]);
    });

    it('todo select tem options nao vazias e sem repeticao', () => {
        expect(
            varreCampos((f) => {
                if (f.type !== 'select') return null;
                if (!Array.isArray(f.options) || f.options.length === 0) return 'select sem options';
                if (f.options.some((o) => typeof o !== 'string' || o.trim() === '')) {
                    return 'option vazia ou nao-string';
                }
                if (new Set(f.options).size !== f.options.length) return 'options repetidas';
                return null;
            })
        ).toEqual([]);
    });

    it('options so existem em campos select', () => {
        // Options em campo de texto seriam ignoradas pelo modal — dado morto
        // que parece restricao de dominio para quem le a fonte.
        expect(
            varreCampos((f) => (f.type !== 'select' && f.options ? 'options em campo nao-select' : null))
        ).toEqual([]);
    });

    it('`required` e booleano quando presente', () => {
        expect(
            varreCampos((f) => ('required' in f && typeof f.required !== 'boolean' ? 'required nao booleano' : null))
        ).toEqual([]);
    });

    it('todo wizard tem ao menos um campo obrigatorio', () => {
        // Sem campo obrigatorio, `wizGenerate` deixa gerar documento vazio e o
        // registro de evidencia nasce sem conteudo auditavel.
        expect(
            CHAVES.filter((k) => !(DOC_WIZARDS[k].fields || []).some((f) => f.required))
        ).toEqual([]);
    });

    it('wizards evidenceOnly declaram a flag como booleano', () => {
        const evidencia = CHAVES.filter((k) => 'evidenceOnly' in DOC_WIZARDS[k]);
        expect(evidencia.length).toBeGreaterThan(0);
        expect(evidencia.filter((k) => typeof DOC_WIZARDS[k].evidenceOnly !== 'boolean')).toEqual([]);
    });

    it('labels nao trazem HTML (o modal interpola label sem escapar)', () => {
        // `openDocWizard` monta `<label>${f.label} ${req}</label>` — cru.
        // Enquanto o dado for texto limpo, tudo bem; este teste garante que
        // continue sendo.
        expect(varreCampos((f) => (/[<>]/.test(f.label) ? `label com HTML: ${f.label}` : null))).toEqual([]);
    });

    it('placeholders nao trazem aspas duplas (entram em atributo HTML cru)', () => {
        // `placeholder="${f.placeholder || ''}"` — uma aspa dupla no dado
        // fecharia o atributo e injetaria markup a partir de dado estatico.
        expect(
            varreCampos((f) => (f.placeholder && f.placeholder.includes('"') ? 'placeholder com aspas' : null))
        ).toEqual([]);
    });

    // BUG REAL, documentado e nao corrigido (corrigir logica do frontend esta
    // fora do escopo desta tarefa). `openDocWizard` monta as opcoes assim:
    //     `<option value="${o}" ...>${o}</option>`
    // sem passar por escapeHTML. Doze opcoes ja carregam '<' ou '>' no texto
    // (ex.: "Parcialmente vinculada (<80%)", ">90% assinaram"). O parser de
    // HTML tolera '<' seguido de digito, entao hoje a tela nao quebra
    // visivelmente — mas basta uma opcao futura comecando com letra ('<a'...)
    // ou com aspa dupla para virar injecao a partir de dado estatico.
    it.skip('BUG: options com < > " & sao interpoladas sem escape em openDocWizard', () => {
        // Reative este teste depois de passar as options por escapeHTML: ele
        // vira a garantia de que o dado nao precisa mais ser limpo na fonte.
        expect(
            varreCampos((f) =>
                f.type === 'select' && f.options.some((o) => /[<>"&]/.test(o))
                    ? 'option com caractere HTML'
                    : null
            )
        ).toEqual([]);
    });

    it('registra quantos campos hoje dependem do escape ausente', () => {
        // Contraparte ATIVA do teste acima: trava o numero atual para que
        // ninguem acrescente opcoes com HTML sem que o teste avise.
        const suspeitos = varreCampos((f) =>
            f.type === 'select' && f.options.some((o) => /[<>"&]/.test(o))
                ? 'option com caractere HTML'
                : null
        );
        expect(suspeitos).toHaveLength(6);
    });
});
