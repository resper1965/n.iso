// Contrato de dados de `src/data/assessment.js` (ASSESSMENT_BLOCKS). O wizard
// comercial (src/views/commercial.js) e o self-service (src/globals.js) navegam
// por `block.block`, iteram `block.questions[].{key,text,type,options}` e salvam
// as respostas indexadas por `question_key = q.key`. Um `key` duplicado faria uma
// resposta sobrescrever a outra; um `select`/`multi` sem `options` renderiza um
// dropdown vazio; um `type` desconhecido não casa com nenhum branch do render e
// some da tela. Nada disso é validado em runtime — estes testes trancam o formato.
import { describe, it, expect } from 'vitest';
import { ASSESSMENT_BLOCKS } from '../src/data/assessment.js';

// Os únicos tipos que commercial.js/globals.js sabem renderizar: yesno vira dois
// botões, select/multi viram lista de opções. Qualquer outro cai fora dos branches.
const TIPOS_SUPORTADOS = ['select', 'multi', 'yesno'];
const COM_OPCOES = ['select', 'multi'];

const TODAS_QUESTOES = ASSESSMENT_BLOCKS.flatMap((b) => (b.questions || []).map((q) => [b.block, q]));

describe('ASSESSMENT_BLOCKS — estrutura dos blocos', () => {
  it('há blocos e cada um tem block (número), title e questions', () => {
    expect(ASSESSMENT_BLOCKS.length).toBeGreaterThan(0);
    const infratores = [];
    for (const b of ASSESSMENT_BLOCKS) {
      if (typeof b.block !== 'number') infratores.push(`block=${b.block}: número ausente`);
      if (typeof b.title !== 'string' || b.title.trim() === '') infratores.push(`block ${b.block}: title vazio`);
      if (!Array.isArray(b.questions) || b.questions.length === 0) infratores.push(`block ${b.block}: sem questions`);
    }
    expect(infratores).toEqual([]);
  });

  it('os números de bloco são 1..N contíguos, sem repetição', () => {
    const nums = ASSESSMENT_BLOCKS.map((b) => b.block);
    const ordenados = [...nums].sort((a, b) => a - b);
    const esperado = ASSESSMENT_BLOCKS.map((_, i) => i + 1);
    expect(ordenados).toEqual(esperado);
    expect(new Set(nums).size).toBe(nums.length);
  });
});

describe('ASSESSMENT_BLOCKS — contrato das questões', () => {
  it('toda questão tem key, text e um type suportado', () => {
    const infratores = [];
    for (const [block, q] of TODAS_QUESTOES) {
      if (typeof q.key !== 'string' || q.key.trim() === '') infratores.push(`block ${block}: questão sem key`);
      else {
        if (typeof q.text !== 'string' || q.text.trim() === '') infratores.push(`${q.key}: text vazio`);
        if (!TIPOS_SUPORTADOS.includes(q.type)) infratores.push(`${q.key}: type '${q.type}' não suportado`);
      }
    }
    expect(infratores).toEqual([]);
  });

  it('nenhuma key de questão se repete no assessment inteiro', () => {
    const keys = TODAS_QUESTOES.map(([, q]) => q.key);
    const vistos = new Set();
    const duplicadas = [];
    for (const k of keys) {
      if (vistos.has(k)) duplicadas.push(k);
      vistos.add(k);
    }
    expect(duplicadas).toEqual([]);
  });

  it('todo select/multi traz options não vazias e sem repetição', () => {
    const infratores = [];
    for (const [, q] of TODAS_QUESTOES) {
      if (!COM_OPCOES.includes(q.type)) continue;
      if (!Array.isArray(q.options) || q.options.length === 0) {
        infratores.push(`${q.key}: ${q.type} sem options`);
        continue;
      }
      if (new Set(q.options).size !== q.options.length) infratores.push(`${q.key}: options repetidas`);
      if (q.options.some((o) => typeof o !== 'string' || o.trim() === '')) infratores.push(`${q.key}: option vazia`);
    }
    expect(infratores).toEqual([]);
  });

  it('yesno nunca declara options (viram botões fixos Sim/Não)', () => {
    const infratores = TODAS_QUESTOES
      .filter(([, q]) => q.type === 'yesno' && q.options !== undefined)
      .map(([, q]) => q.key);
    expect(infratores).toEqual([]);
  });
});
