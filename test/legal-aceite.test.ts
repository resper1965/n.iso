// Aceite de documento legal versionado: o que é exigível, o que apenas avisa e
// o que barra o acesso. Um teste por regra.
//
// A regra de negócio: versão nova apenas AVISA quando a mudança é comum, e
// BARRA o acesso até o aceite quando é material (base legal ou retenção). Quem
// decide é a `classification` gravada no documento — campo do documento, não
// julgamento de quem publica.
import { describe, it, expect } from 'vitest';
import {
  situacaoLegal,
  versoesVigentes,
  rotaLiberadaComBloqueio,
  type DocumentoLegal,
} from '../src/legal-policy';

const doc = (p: Partial<DocumentoLegal> & { id: string }): DocumentoLegal => ({
  kind: 'terms',
  version: 'v1',
  classification: 'comum',
  title: 'Termos de Uso',
  publishedAt: '2026-01-01T00:00:00Z',
  ...p,
});

describe('regra: só a versão publicada mais recente é exigível', () => {
  it('a versão mais nova de cada tipo vence a anterior', () => {
    const vigentes = versoesVigentes([
      doc({ id: 't23', version: 'v2.3', publishedAt: '2026-03-01T00:00:00Z' }),
      doc({ id: 't24', version: 'v2.4', publishedAt: '2026-09-01T00:00:00Z' }),
      doc({ id: 'p31', kind: 'privacy', version: 'v3.1', publishedAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(vigentes.map(d => d.id).sort()).toEqual(['p31', 't24']);
  });

  it('rascunho (sem data de publicação) não é exigível', () => {
    const vigentes = versoesVigentes([
      doc({ id: 't24', version: 'v2.4', publishedAt: '2026-09-01T00:00:00Z' }),
      doc({ id: 't25', version: 'v2.5', publishedAt: null }),
    ]);
    expect(vigentes.map(d => d.id)).toEqual(['t24']);
  });

  it('sem documento nenhum não há pendência — o produto não muda de comportamento', () => {
    expect(situacaoLegal([], [])).toEqual({ pendentes: [], bloqueia: false, avisa: false });
  });
});

describe('regra: material barra, comum avisa', () => {
  const termos = doc({ id: 't24', version: 'v2.4', classification: 'comum' });
  const privacidade = doc({ id: 'p31', kind: 'privacy', version: 'v3.1', classification: 'material' });

  it('pendência comum apenas avisa: o acesso continua', () => {
    const s = situacaoLegal([termos], []);
    expect(s.bloqueia).toBe(false);
    expect(s.avisa).toBe(true);
    expect(s.pendentes.map(d => d.id)).toEqual(['t24']);
  });

  it('pendência material barra o acesso', () => {
    const s = situacaoLegal([privacidade], []);
    expect(s.bloqueia).toBe(true);
    expect(s.avisa).toBe(false);
  });

  it('uma pendência material barra mesmo acompanhada de comuns', () => {
    const s = situacaoLegal([termos, privacidade], []);
    expect(s.bloqueia).toBe(true);
    expect(s.pendentes).toHaveLength(2);
  });

  it('tudo aceito: nem barra nem avisa', () => {
    const s = situacaoLegal([termos, privacidade], ['t24', 'p31']);
    expect(s).toEqual({ pendentes: [], bloqueia: false, avisa: false });
  });

  it('aceitar só o material tira o bloqueio e deixa o aviso', () => {
    const s = situacaoLegal([termos, privacidade], ['p31']);
    expect(s.bloqueia).toBe(false);
    expect(s.avisa).toBe(true);
  });
});

describe('regra: o aceite é da VERSÃO, não do documento', () => {
  // É este o ponto de versionar. Se aceitar a v2.3 valesse pela v2.4, publicar
  // versão nova não teria efeito nenhum sobre quem já estava dentro.
  it('aceite da versão anterior não vale pela nova', () => {
    const s = situacaoLegal([
      doc({ id: 't23', version: 'v2.3', publishedAt: '2026-03-01T00:00:00Z' }),
      doc({ id: 't24', version: 'v2.4', publishedAt: '2026-09-01T00:00:00Z', classification: 'material' }),
    ], ['t23']);
    expect(s.bloqueia).toBe(true);
    expect(s.pendentes.map(d => d.id)).toEqual(['t24']);
  });

  it('a versão antiga não vira pendência por si só: só a vigente é cobrada', () => {
    const s = situacaoLegal([
      doc({ id: 't23', version: 'v2.3', publishedAt: '2026-03-01T00:00:00Z' }),
      doc({ id: 't24', version: 'v2.4', publishedAt: '2026-09-01T00:00:00Z' }),
    ], ['t24']);
    expect(s.pendentes).toEqual([]);
  });
});

describe('regra: quem está barrado ainda consegue sair do bloqueio', () => {
  it('ver e aceitar continuam alcançáveis', () => {
    expect(rotaLiberadaComBloqueio('/api/v1/legal/pending')).toBe(true);
    expect(rotaLiberadaComBloqueio('/api/v1/legal/accept')).toBe(true);
  });

  it('encerrar a sessão também — recusar e sair precisa funcionar', () => {
    expect(rotaLiberadaComBloqueio('/api/v1/auth/logout')).toBe(true);
  });

  it('o resto do produto fica barrado', () => {
    expect(rotaLiberadaComBloqueio('/api/v1/projects')).toBe(false);
    expect(rotaLiberadaComBloqueio('/api/v1/controls/abc')).toBe(false);
    // Publicar documento legal NÃO entra: quem está barrado não sai do bloqueio
    // publicando outra versão.
    expect(rotaLiberadaComBloqueio('/api/v1/legal/documents')).toBe(false);
  });

  it('barra fina no fim não abre caminho', () => {
    expect(rotaLiberadaComBloqueio('/api/v1/legal/pending/')).toBe(true);
    expect(rotaLiberadaComBloqueio('/api/v1/legal/pending/../projects')).toBe(false);
  });
});
