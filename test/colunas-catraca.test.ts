import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';

/**
 * Catraca de coluna inexistente em escrita SQL.
 *
 * O `updated_at` no INSERT de corrective_actions (governance.ts) dava 500 sempre e só apareceu por
 * acaso: nenhum teste passava por aquela rota. Este teste lê o FONTE (não depende de rota exercitada),
 * extrai as escritas com tabela literal e confere cada coluna contra o schema.sql aplicado num D1
 * real (PRAGMA table_info), não contra um parse do texto do schema.
 *
 * O que o leitor cobre, em src/**\/*.ts (fora *.test.ts), com comentário `//` e `/* *\/` removido:
 *   - `INSERT [OR x] INTO <tabela> (<colunas>)`: toda coluna da lista;
 *   - `UPDATE [OR x] <tabela> SET a = ..., b = ...`: as colunas atribuídas até WHERE/RETURNING/fim
 *     da string. Conteúdo entre parênteses é descartado antes (CASE/COALESCE não viram coluna).
 *   - tabela literal que não existe no schema também reprova.
 * O que NÃO cobre (de propósito ou por limite do regex):
 *   - tabela interpolada (`INSERT INTO ${t}`, `UPDATE ${t} SET`): fora;
 *   - coluna interpolada (`SET ${p.sql}` do setParcial, `(${cols.join()})`): o trecho `${...}` é
 *     retirado e só o literal ao redor é conferido;
 *   - `ON CONFLICT ... DO UPDATE SET`, `INSERT ... SELECT` sem lista de colunas, colunas em WHERE,
 *     SELECT e JOIN (leitura não entra aqui);
 *   - SQL montado por concatenação com `+` em pedaços separados.
 */
const FONTES = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

type Escrita = { onde: string; tabela: string; colunas: string[] };

const semComentario = (txt: string) =>
  // Mantém as quebras de linha para o número da linha continuar certo.
  txt.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[\s;])\/\/.*$/gm, '$1');

const semInterpolacao = (s: string) => s.replace(/\$\{[^}]*\}/g, ' ');

function semParenteses(s: string): string {
  let antes;
  do { antes = s; s = s.replace(/\([^()]*\)/g, ' '); } while (s !== antes);
  return s;
}

const linhaDe = (txt: string, i: number) => txt.slice(0, i).split('\n').length;

function extrair(): Escrita[] {
  const achadas: Escrita[] = [];
  for (const [arq, bruto] of Object.entries(FONTES)) {
    if (arq.endsWith('.test.ts')) continue;
    const txt = semComentario(bruto);
    const nome = arq.replace('../', '');
    for (const m of txt.matchAll(/\bINSERT\s+(?:OR\s+\w+\s+)?INTO\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
      const colunas = semInterpolacao(m[2]).split(',').map((c) => c.trim()).filter(Boolean);
      // Lista que não é de identificadores (VALUES sem lista, prosa) não é lista de colunas.
      if (!colunas.length || colunas.some((c) => !/^[A-Za-z_]\w*$/.test(c))) continue;
      achadas.push({ onde: `${nome}:${linhaDe(txt, m.index!)}`, tabela: m[1].toLowerCase(), colunas });
    }
    for (const m of txt.matchAll(/\bUPDATE\s+(?:OR\s+\w+\s+)?([A-Za-z_]\w*)\s+SET\s+([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|[`"]|$)/g)) {
      // Literal SQL ('Draft' depois de =, THEN, ELSE, vírgula...) vira `?`; a aspa que sobra é a que
      // fecha a string JS, e o SET acaba ali.
      const set = semParenteses(semInterpolacao(m[2]).replace(/((?:=|\bTHEN|\bELSE|\bWHEN|,|\()\s*)'[^'\n]*'/g, '$1?').split("'")[0]);
      const colunas = [...set.matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*=(?!=)/g)].map((x) => x[1]);
      if (!colunas.length) continue;
      achadas.push({ onde: `${nome}:${linhaDe(txt, m.index!)}`, tabela: m[1].toLowerCase(), colunas });
    }
  }
  return achadas;
}

describe('catraca de coluna inexistente em INSERT/UPDATE', () => {
  const escritas = extrair();
  let schema: Map<string, Set<string>>;

  beforeAll(async () => {
    await applySchema();
    const { results } = await env.DB.prepare(
      `SELECT m.name AS tabela, p.name AS coluna FROM sqlite_master m JOIN pragma_table_info(m.name) p
       WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'`
    ).all<{ tabela: string; coluna: string }>();
    schema = new Map();
    for (const r of results) {
      const t = r.tabela.toLowerCase();
      if (!schema.has(t)) schema.set(t, new Set());
      schema.get(t)!.add(r.coluna.toLowerCase());
    }
  }, 60_000);

  it('o leitor enxerga as escritas (sem isso passaria vazio)', () => {
    expect(escritas.length).toBeGreaterThan(100);
    // Os dois formatos são lidos: o INSERT que já teve `updated_at` e um UPDATE com literal no meio.
    expect(escritas.some((e) => e.tabela === 'corrective_actions' && e.colunas.includes('created_at'))).toBe(true);
    expect(escritas.some((e) => e.tabela === 'dpia_assessments' && e.colunas.includes('dpo_approved_at') && e.colunas.includes('status'))).toBe(true);
    expect(schema.size).toBeGreaterThan(30);
  });

  it('toda coluna escrita existe na tabela do schema.sql', () => {
    const erros: string[] = [];
    for (const e of escritas) {
      const cols = schema.get(e.tabela);
      if (!cols) { erros.push(`${e.onde}: tabela ${e.tabela} não existe no schema`); continue; }
      for (const c of e.colunas) if (!cols.has(c.toLowerCase())) erros.push(`${e.onde}: ${e.tabela}.${c} não existe`);
    }
    expect(erros, `Coluna/tabela inexistente (o D1 responde 500 na hora):\n${erros.join('\n')}`).toEqual([]);
  });
});
