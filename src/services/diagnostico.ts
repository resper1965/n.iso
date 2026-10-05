// Diagnóstico para a proposta: faixa, porte, maturidade por domínio e lacunas.
// Puro: recebe as respostas do levantamento (question_key -> valor).
import { calcScore, getTier, getScopeInfo, SCORE_MAP, GAPS } from './pricing';
import type { Faixa } from './preco-proposta';

export interface Diagnostico {
  faixa: Faixa; faixaNome: string; nota: number;
  pessoas: number | null;
  maturidade: { dominio: string; pct: number }[];
  lacunas: { titulo: string; requisito: string; impacto: string; acao: string }[];
}

// Ordem = a da apresentação.
const DOMINIOS: [string, string[]][] = [
  ['Identidade e acesso', ['iam', 'mfa', 'prod_access', 'offboarding']],
  ['Operação e continuidade', ['backup', 'logging', 'vuln_mgmt', 'pentest']],
  ['Desenvolvimento seguro', ['sdlc', 'code_review', 'cicd', 'sast_sca', 'branch_protection']],
  ['Privacidade (LGPD)', ['ropa', 'dsr_channel', 'dpia', 'legal_bases', 'retention', 'dpa_contracts']],
  ['Governança e documentação', ['commitment', 'si_policy', 'risk_assessment', 'documented_info', 'doc_repo', 'doc_version', 'doc_approval', 'classification']],
  ['Pessoas e fornecedores', ['competence_records', 'internal_comm', 'supplier_eval', 'awareness_docs']],
];

export function diagnosticoDe(respostas: Record<string, string>): Diagnostico {
  const nota = calcScore(respostas);
  const tier = getTier(nota);

  const maturidade: Diagnostico['maturidade'] = [];
  for (const [dominio, chaves] of DOMINIOS) {
    let pontos = 0, maximo = 0;
    for (const k of chaves) {
      const mapa = SCORE_MAP[k];
      const v = respostas[k];
      if (!mapa || !Object.prototype.hasOwnProperty.call(mapa, v)) continue;
      pontos += mapa[v];
      maximo += Math.max(...Object.values(mapa));
    }
    // maximo 0 só se todas as respondidas valem 0 de teto: não ocorre no SCORE_MAP
    if (maximo > 0) maturidade.push({ dominio, pct: Math.round(100 * (1 - pontos / maximo)) });
  }

  const lacunas = GAPS
    .filter(r => r.trigger(respostas[r.field]))
    .map(({ gap }) => ({ titulo: gap.titulo, requisito: gap.controles, impacto: gap.impacto, acao: gap.acao }));

  return {
    faixa: String(tier.tier) as Faixa, faixaNome: tier.name, nota,
    pessoas: getScopeInfo(undefined, respostas.headcount).count,
    maturidade, lacunas,
  };
}
