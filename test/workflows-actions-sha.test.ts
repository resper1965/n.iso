// Toda action de workflow é fixada por SHA de commit, não por tag.
//
// Tag é ponteiro mutável: quem controla o repositório da action (ou invade a conta dele) move
// `v4` para outro commit, e o próximo deploy executa esse código com o `CLOUDFLARE_API_TOKEN`
// na mão. O SHA de 40 caracteres não se move. O comentário `# vN` guarda a versão legível, e o
// Dependabot (`package-ecosystem: github-actions`) abre PR quando sai versão nova, com o SHA novo.
//
// O CodeQL já acusava isto como `actions/unpinned-tag`. Este teste impede a volta.
import { describe, it, expect } from 'vitest';

const arquivos = import.meta.glob('../.github/workflows/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const USES = /^\s*(?:-\s+)?uses:\s*(\S+)/;
const SHA = /^[0-9a-f]{40}$/;

describe('actions dos workflows', () => {
  it('encontrou os workflows e ao menos uma action', () => {
    expect(Object.keys(arquivos).length).toBeGreaterThanOrEqual(8);
    const total = Object.values(arquivos).flatMap((t) => t.split('\n')).filter((l) => USES.test(l)).length;
    expect(total).toBeGreaterThan(20);
  });

  it('todas estão presas por SHA de commit, com a versão no comentário', () => {
    const soltas: string[] = [];
    for (const [caminho, texto] of Object.entries(arquivos)) {
      texto.split('\n').forEach((linha, i) => {
        const m = USES.exec(linha);
        if (!m || m[1].startsWith('./')) return; // action local do repositório
        const ref = m[1].split('@')[1] ?? '';
        const comVersao = /#\s*v\d/.test(linha);
        if (!SHA.test(ref) || !comVersao) soltas.push(`${caminho.replace('../', '')}:${i + 1}  ${linha.trim()}`);
      });
    }
    expect(soltas, 'fixe por SHA e deixe "# vN" no fim da linha').toEqual([]);
  });
});
