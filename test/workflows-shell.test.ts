// Nome de variável de shell nos workflows não pode ter acento.
//
// Isto não é preciosismo de estilo. `código=200` não é atribuição para o bash:
// nome de variável só aceita `[A-Za-z_][A-Za-z0-9_]*`, então a linha inteira é
// lida como COMANDO, o shell responde `command not found` e o passo morre com
// 127 — antes de executar qualquer verificação.
//
// O custo real disso já foi pago: a sonda externa de produção (`uptime.yml`)
// nunca funcionou por causa de uma linha assim. A cada 15 minutos ela abria a
// mesma issue dizendo "produção não está respondendo", com produção no ar. Duas
// consequências, e a segunda é a grave: o alarme falso ensina a ignorar o
// alarme, e enquanto ele tocava por engano NÃO havia sonda nenhuma vigiando de
// verdade. Um alarme quebrado é pior que nenhum, porque parece um.
//
// O acento em COMENTÁRIO e em texto de mensagem continua certo — a interface e
// a documentação são em português. O que não pode é virar identificador.
import { describe, it, expect } from 'vitest';

const arquivos = import.meta.glob('../.github/workflows/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** `nome=` no início da linha (depois da indentação do YAML), sem casar `==`. */
const ATRIBUICAO = /^\s*([^\s=|&;<>()"']+)=(?!=)/;
const NAO_ASCII = /[^\x00-\x7F]/;

describe('shell dos workflows', () => {
  it('encontrou os workflows', () => {
    // Piso: sem isto, um glob que parasse de casar deixaria o teste passar vazio.
    expect(Object.keys(arquivos).length).toBeGreaterThan(3);
  });

  it('nenhum nome de variável tem acento', () => {
    const infratores: string[] = [];
    for (const [caminho, fonte] of Object.entries(arquivos)) {
      const nome = caminho.split('/').pop();
      fonte.split('\n').forEach((linha, i) => {
        const m = linha.match(ATRIBUICAO);
        if (m && NAO_ASCII.test(m[1])) {
          infratores.push(`.github/workflows/${nome}:${i + 1}  ${linha.trim()}`);
        }
      });
    }
    expect(
      infratores,
      `nome de variável com acento — o bash lê a linha como comando e o passo morre com 127:\n  ${infratores.join('\n  ')}`
    ).toEqual([]);
  });
});
