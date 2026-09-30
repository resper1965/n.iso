import { describe, it, expect } from 'vitest';
import { ROTAS } from '../mcp-server-niso/src/contrato-gerado';
import spec from '../docs/openapi.json';
import mcpSrc from '../mcp-server-niso/src/ferramentas.ts?raw';
import { TOOLS, ferramentaPermitida, executarFerramenta, type Transporte } from '../mcp-server-niso/src/ferramentas';

/**
 * O MCP consome o contrato, não strings (item 3.2 do `enterprise-grade-plan.md`).
 *
 * O critério de saída — "o build do MCP quebra se um endpoint mudar de forma" —
 * é cumprido pelo TIPO: `nisoContrato` só aceita chave de `ROTAS`, e exige os
 * campos que o schema marca como obrigatórios. Rota renomeada, método trocado
 * ou campo novo obrigatório fazem o `tsc` do MCP falhar. Verificado por mutação.
 *
 * O que ESTE arquivo cobre é o degrau anterior: o `contrato-gerado.ts` é
 * commitado (o MCP é pacote separado, com seu próprio `npm ci`, e acoplar o
 * build dele a um script da raiz seria pior), e arquivo gerado commitado
 * envelhece. Aqui ele é comparado com o `docs/openapi.json` de onde saiu.
 *
 * Sem isto, a proteção do tipo continuaria valendo — mas contra um contrato
 * velho, que é a pior das duas situações: dá a sensação de estar conferido.
 */

describe('Contrato do mcp-server-niso', () => {
  it('`contrato-gerado.ts` está em dia com `docs/openapi.json`', () => {
    const esperado: Record<string, string[]> = {};
    for (const [caminho, metodos] of Object.entries(spec.paths as Record<string, any>)) {
      for (const [metodo, op] of Object.entries(metodos as Record<string, any>)) {
        const schema = op.requestBody?.content?.['application/json']?.schema ?? {};
        esperado[`${metodo.toUpperCase()} ${caminho}`] =
          Array.isArray(schema.required) ? [...schema.required].sort() : [];
      }
    }

    const atual = Object.fromEntries(
      Object.entries(ROTAS).map(([k, v]) => [k, [...(v as any).obrigatorios]])
    );

    expect(
      atual,
      'mcp-server-niso/src/contrato-gerado.ts divergiu — rode `npm run openapi` e inclua o arquivo no commit'
    ).toEqual(esperado);
  });

  it('nenhuma escrita coberta pelo contrato voltou a usar caminho em string', () => {
    // A regressão que este teste impede não é hipotética: `nisoPost` recebe uma
    // string, então método e caminho errados COMPILAM. Foi assim que
    // `niso_respond_auditor_note` mandou POST por meses para uma rota que só
    // aceita PUT — 404 em produção, e nada acusando.
    //
    // A checagem é textual de propósito: o tipo protege quem usa `nisoContrato`,
    // e o que precisa ser vigiado é justamente quem NÃO usa.
    const emString: string[] = [];
    mcpSrc.split('\n').forEach((linha, i) => {
      const m = linha.match(/\bt\.enviar\(\s*`([^`]+)`/);
      if (!m) return;
      // `${x}` no molde vira `{param}` para comparar com a chave do contrato.
      const molde = m[1].replace(/\$\{[^}]+\}/g, '{p}');
      const noContrato = Object.keys(ROTAS).some((k) => {
        const [, caminho] = k.split(' ');
        return caminho.replace(/\{\w+\}/g, '{p}') === molde;
      });
      if (noContrato) emString.push(`mcp-server-niso/src/ferramentas.ts:${i + 1}  ${molde}`);
    });

    expect(
      emString,
      `estas escritas têm entrada no contrato e deviam usar \`t.contrato\`:\n  ${emString.join('\n  ')}`
    ).toEqual([]);
  });

  it('o contrato cobre as rotas de escrita que o MCP realmente usa', () => {
    // Piso: se `ROTAS` viesse vazio, os dois testes acima passariam sem provar
    // nada — nenhuma divergência e nenhuma string a reclamar.
    expect(Object.keys(ROTAS).length).toBeGreaterThan(40);
    expect(mcpSrc).toContain('t.contrato(');
    expect((mcpSrc.match(/\bt\.contrato\(/g) ?? []).length, 'as chamadas migradas sumiram').toBeGreaterThanOrEqual(6);
  });
});

describe('ferramentas.ts é a fonte única das ferramentas MCP', () => {
  it('exporta as 24 ferramentas, todas com prefixo niso_', () => {
    expect(TOOLS).toHaveLength(24);
    expect(TOOLS.every((t) => t.name.startsWith('niso_'))).toBe(true);
  });
  it('auditor não vê escrita de implementação; consultor não vê achado', () => {
    expect(ferramentaPermitida('niso_generate_policy', 'auditor')).toBe(false);
    expect(ferramentaPermitida('niso_create_audit_finding', 'consultant')).toBe(false);
    expect(ferramentaPermitida('niso_get_project', 'readonly')).toBe(true);
  });
  it('executarFerramenta impõe o papel sozinha, sem tocar o transporte', async () => {
    const explode = () => { throw new Error('transporte não devia ser chamado'); };
    const t = { get: explode, enviar: explode, contrato: explode, uploadTexto: explode } as unknown as Transporte;
    const r = await executarFerramenta('niso_generate_policy', { projectId: 'p1' }, t, { papel: 'auditor' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('indisponível para o papel');
  });
});
