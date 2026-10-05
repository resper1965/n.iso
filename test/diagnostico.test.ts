import { describe, it, expect } from 'vitest';
import { diagnosticoDe } from '../src/services/diagnostico';
import { GAPS } from '../src/services/pricing';
import { ISO_27701_2025_CONTROLLER, ISO_27701_2025_PROCESSOR } from '../src/data/iso27701-2025';

const MELHOR = {
  iam: 'SSO + MFA obrigatório', mfa: 'Para todos os sistemas (cloud + SaaS + VPN)',
  prod_access: 'Zero standing access / JIT', offboarding: 'Processo automatizado',
};

describe('diagnosticoDe', () => {
  it('calcula faixa, nota, pessoas e domínios', () => {
    const d = diagnosticoDe({
      ...MELHOR, headcount: '101–250',
      backup: 'Sem backup', logging: 'Sem monitoramento',
    });
    expect(d.pessoas).toBe(250);
    expect(['1', '2', '3']).toContain(d.faixa);
    expect(d.faixaNome).toBeTruthy();
    expect(d.nota).toBeGreaterThan(0);
    expect(d.maturidade.map(m => m.dominio)).toEqual(['Identidade e acesso', 'Operação e continuidade']);
    expect(d.maturidade[0].pct).toBe(100);
    // backup 5/5 e logging 5/5 respondidos; vuln_mgmt e pentest ausentes
    expect(d.maturidade[1].pct).toBe(0);
  });

  it('pct parcial arredondado e valor não reconhecido não conta', () => {
    const d = diagnosticoDe({ iam: 'Sem IAM centralizado', mfa: 'Apenas para admins', prod_access: 'xyz' });
    // pontos 4+2=6, máximo 4+4=8 -> 25
    expect(d.maturidade).toEqual([{ dominio: 'Identidade e acesso', pct: 25 }]);
  });

  it('sem pessoas informadas, pessoas é nulo; sem respostas, sem domínios', () => {
    const d = diagnosticoDe({});
    expect(d.pessoas).toBeNull();
    expect(d.maturidade).toEqual([]);
    expect(d.lacunas).toEqual([]);
  });

  it('lacunas seguem o trigger e a RoPA cita A.1.2.9', () => {
    const d = diagnosticoDe({ ropa: 'Inexistente', dsr_channel: 'Inexistente', sdlc: 'Sem processo formal', iam: 'SSO implementado' });
    expect(d.lacunas.map(l => l.titulo)).toEqual([
      'Ausência de RoPA (Registro de Operações)',
      'Ausência de Canal de Direitos dos Titulares',
      'Ausência de Desenvolvimento Seguro (SSDLC)',
    ]);
    expect(d.lacunas[0].requisito).toBe('A.1.2.9, A.1.2.2, A.1.2.3 (ISO 27701) · LGPD art. 37');
    expect(d.lacunas[1].requisito).toBe('A.1.3.2, A.1.3.7, A.1.3.10 (ISO 27701) · LGPD art. 18');
    expect(d.lacunas[2].requisito).toBe('A.8.25, A.8.26, A.8.27, A.8.28');
    expect(Object.keys(d.lacunas[0]).sort()).toEqual(['acao', 'impacto', 'requisito', 'titulo']);
  });
});

describe('referências da ISO 27701 em GAPS', () => {
  const catalogo = new Set([...ISO_27701_2025_CONTROLLER, ...ISO_27701_2025_PROCESSOR].map(c => c.code));
  it('todo código de 4 níveis existe no catálogo 2025 e nenhum cita A.8.8', () => {
    for (const { gap } of GAPS) {
      for (const cod of gap.controles.match(/A\.\d+\.\d+\.\d+/g) ?? []) {
        expect(catalogo.has(cod), `${cod} em "${gap.titulo}"`).toBe(true);
      }
      expect(gap.controles).not.toContain('A.8.8');
    }
  });
});
