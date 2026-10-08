// Nome exportado por api.js/state.js/ui.js/router.js que NÃO vai para `window` só existe no
// módulo que o importa; usado sem import, vira ReferenceError (o fetch de upload/exportação nem
// sai). O bundle do Vite mascara isso ao juntar tudo num escopo. Os nomes que também vão para
// `window` (S, api, showToast, escapeHTML, render…) são globais legítimos e ficam de fora.
import { describe, it, expect } from 'vitest';

const FONTES = Object.fromEntries(Object.entries(
    import.meta.glob('../src/**/*.js', { query: '?raw', import: 'default', eager: true }),
).map(([k, v]) => [k.replace(/^\.\.\//, ''), v]));

const DEFINIDORES = ['src/api.js', 'src/state.js', 'src/ui.js', 'src/router.js'];

/** Temporários: o P4 corrige estes arquivos no fluxo dele e apaga a linha. */
const TOLERADOS = [
];

const tudo = Object.values(FONTES).join('\n');
const origem = {};
for (const d of DEFINIDORES) {
    for (const [, n] of FONTES[d].matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)) origem[n] = d;
    for (const [, g] of FONTES[d].matchAll(/export\s*\{([^}]*)\}/g)) for (const n of g.split(',')) origem[n.trim().split(/\s+as\s+/).pop()] = d;
}
const SEM_WINDOW = Object.keys(origem).filter((n) => !new RegExp(`window\\.${n.replace(/\$/g, '\\$')}\\s*=`).test(tudo));
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function usosSemImport() {
    const achados = [];
    for (const [arq, src] of Object.entries(FONTES)) {
        const importados = [...src.matchAll(/^import\s*\{([^}]*)\}/gm)].map((m) => m[1]).join(',');
        const codigo = semComentario(src);
        for (const n of SEM_WINDOW) {
            if (origem[n] === arq) continue;
            if (new RegExp(`(?<![.\\w$'"])${n}\\b`).test(codigo) && !new RegExp(`\\b${n}\\b`).test(importados)) achados.push(`${arq} ${n}`);
        }
    }
    return achados.sort();
}

describe('globais sem import no frontend', () => {
    it('acha os nomes sem window (o teste não olha o vazio)', () => {
        expect(SEM_WINDOW).toContain('API_BASE');
        expect(SEM_WINDOW).not.toContain('showToast');
    });

    it('nenhum arquivo usa nome sem window sem importá-lo', () => {
        const tolerados = TOLERADOS.map((t) => `${t.arquivo} ${t.nome}`);
        expect(usosSemImport().filter((a) => !tolerados.includes(a))).toEqual([]);
    });

    it('toda tolerância ainda corresponde a um uso sem import', () => {
        const achados = usosSemImport();
        for (const t of TOLERADOS) expect(achados, `tolerância velha: ${t.arquivo}`).toContain(`${t.arquivo} ${t.nome}`);
    });
});
