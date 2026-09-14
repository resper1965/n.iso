// Gate de aplicabilidade da SoA no SERVIDOR. A tela já barra (etapa 4), mas um
// curl passa por cima dela: estas regras são as que valem. Um teste por regra.
//
// Vocabulário: o pacote de design chama os campos de `applic` e `na_why`; aqui
// são `status = 'Not Applicable'` e `description` em `compliance_controls`.
import { describe, it, expect } from 'vitest';
import {
  NA_STATUS,
  SoALogicEngine,
  SoAValidationError,
  assertSoAExportable,
  exclusionsMissingJustification,
  hasValidApplicability,
  recordFromControlRow,
  type DiscoveryAnswers,
} from '../src/services/soa-logic';
import { recusaAplicabilidade } from '../src/routes/controls';

const respostasMinimas: DiscoveryAnswers = {
  hasCloud: false, hasRemoteWork: false, hasSoftwareDev: false, hasPhysicalOffice: false,
  processesPII: false, vendors: [], hasMobileDevices: false, hasThirdPartyAccess: false,
  hasCriticalData: false, handlesPayments: false, hasWebApps: false, hasAPIs: false,
  hasEncryption: false, hasBYOD: false, hasCloudMulti: false, sector: 'other',
};

describe('regra: applic = 0 exige na_why', () => {
  it('controle aplicável não precisa de justificativa', () => {
    expect(hasValidApplicability({ controlId: 'A.5.1', isApplicable: true })).toBe(true);
    expect(hasValidApplicability({ controlId: 'A.5.1', isApplicable: true, justification: '' })).toBe(true);
  });

  it('controle excluído SEM justificativa é inválido', () => {
    expect(hasValidApplicability({ controlId: 'A.8.25', isApplicable: false })).toBe(false);
    expect(hasValidApplicability({ controlId: 'A.8.25', isApplicable: false, justification: '' })).toBe(false);
    expect(hasValidApplicability({ controlId: 'A.8.25', isApplicable: false, justification: null })).toBe(false);
  });

  it('espaço em branco não é justificativa', () => {
    expect(hasValidApplicability({ controlId: 'A.8.25', isApplicable: false, justification: '   \n\t ' })).toBe(false);
  });

  it('controle excluído COM justificativa é válido', () => {
    expect(hasValidApplicability({
      controlId: 'A.8.25', isApplicable: false, justification: 'Não há desenvolvimento de software no escopo.',
    })).toBe(true);
  });
});

describe('regra: a SoA é recusada quando há exclusão sem justificativa', () => {
  const validos = [
    { controlId: 'A.5.1', isApplicable: true, justification: 'Requisito universal.' },
    { controlId: 'A.8.25', isApplicable: false, justification: 'Sem desenvolvimento de software.' },
  ];

  it('recorte íntegro passa', () => {
    expect(() => assertSoAExportable(validos)).not.toThrow();
    expect(exclusionsMissingJustification(validos)).toEqual([]);
  });

  it('uma exclusão muda recusa a SoA INTEIRA — exportar parcial é pior que não exportar', () => {
    const comFuro = [...validos, { controlId: 'A.8.30', isApplicable: false, justification: '' }];
    expect(() => assertSoAExportable(comFuro)).toThrow(SoAValidationError);
  });

  it('o erro diz QUAIS controles reprovaram, para a tela poder apontar', () => {
    const comFuro = [
      { controlId: 'A.8.30', isApplicable: false, justification: '' },
      { controlId: 'A.5.1', isApplicable: true },
      { controlId: 'A.7.4', isApplicable: false },
    ];
    expect(exclusionsMissingJustification(comFuro)).toEqual(['A.8.30', 'A.7.4']);
    try {
      assertSoAExportable(comFuro);
      throw new Error('deveria ter recusado');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SoAValidationError);
      expect(e.offenders).toEqual(['A.8.30', 'A.7.4']);
      expect(e.message).toContain('A.8.30');
      expect(e.message).toContain('A.7.4');
    }
  });

  it('lista vazia não é erro: projeto sem controle não tem exclusão muda', () => {
    expect(() => assertSoAExportable([])).not.toThrow();
  });
});

describe('regra: a geração da SoA falha fechada', () => {
  it('as 93 regras do 27001 geram exclusões todas justificadas', () => {
    const soa = SoALogicEngine.generateDraftSoA(respostasMinimas);
    expect(soa.length).toBe(93);
    // Com respostas mínimas há MUITA exclusão: é o caso que mais expõe a regra.
    const excluidos = soa.filter(d => !d.isApplicable);
    expect(excluidos.length).toBeGreaterThan(0);
    expect(exclusionsMissingJustification(soa)).toEqual([]);
  });

  it('o mesmo vale para o 27701', () => {
    const soa = SoALogicEngine.generateDraftSoA(respostasMinimas, 'ISO 27701:2025', 'Both');
    expect(soa.length).toBeGreaterThan(0);
    expect(exclusionsMissingJustification(soa)).toEqual([]);
  });
});

describe('adaptação da linha do banco', () => {
  it("status 'Not Applicable' vira isApplicable: false", () => {
    expect(recordFromControlRow({ id: 'c1', status: NA_STATUS, description: 'motivo' }))
      .toEqual({ controlId: 'c1', isApplicable: false, justification: 'motivo' });
  });

  it('qualquer outro status é aplicável', () => {
    expect(recordFromControlRow({ id: 'c1', status: 'Missing' }).isApplicable).toBe(true);
    expect(recordFromControlRow({ id: 'c1', status: null }).isApplicable).toBe(true);
  });
});

// ——— A guarda das rotas ——————————————————————————————————————————————
// Avalia o ESTADO FINAL (gravado + corpo da requisição), não só o que a
// requisição mandou. É a mesma função em PUT /:id e PUT /:id/status: duas
// cópias da regra viram duas regras diferentes na primeira alteração.
describe('regra de rota: marcar N/A exige justificativa', () => {
  it('marcar N/A sem mandar justificativa, num controle que não tem, é recusado', () => {
    const r = recusaAplicabilidade({ status: 'Missing', description: null }, { status: NA_STATUS });
    expect(r).toContain('exige justificativa');
  });

  it('marcar N/A mandando a justificativa no mesmo corpo passa', () => {
    expect(recusaAplicabilidade(
      { status: 'Missing', description: null },
      { status: NA_STATUS, description: 'Não há desenvolvimento de software no escopo.' },
    )).toBeNull();
  });

  it('marcar N/A num controle que JÁ tem justificativa gravada passa', () => {
    expect(recusaAplicabilidade(
      { status: 'Missing', description: 'Fora do escopo desde o diagnóstico.' },
      { status: NA_STATUS },
    )).toBeNull();
  });

  it('APAGAR a justificativa de um controle já N/A é recusado', () => {
    // O caminho por onde se desfazia o registro da exclusão sem tocar no status.
    expect(recusaAplicabilidade(
      { status: NA_STATUS, description: 'motivo antigo' },
      { description: '' },
    )).toContain('exige justificativa');
    expect(recusaAplicabilidade(
      { status: NA_STATUS, description: 'motivo antigo' },
      { description: '   ' },
    )).toContain('exige justificativa');
  });

  it('editar a justificativa de um controle N/A para outro texto passa', () => {
    expect(recusaAplicabilidade(
      { status: NA_STATUS, description: 'motivo antigo' },
      { description: 'Motivo revisado após reunião de escopo.' },
    )).toBeNull();
  });

  it('controle aplicável pode ficar sem descrição: ali não é justificativa', () => {
    expect(recusaAplicabilidade({ status: 'Missing', description: 'nota' }, { description: '' })).toBeNull();
    expect(recusaAplicabilidade({ status: 'Implemented', description: null }, { status: 'Partial' })).toBeNull();
  });

  it('voltar de N/A para aplicável é livre, mesmo sem justificativa', () => {
    expect(recusaAplicabilidade({ status: NA_STATUS, description: 'motivo' }, { status: 'Missing' })).toBeNull();
  });

  it('status vazio ou nulo no corpo não conta como mudança de aplicabilidade', () => {
    expect(recusaAplicabilidade({ status: 'Missing', description: null }, { status: '' })).toBeNull();
    expect(recusaAplicabilidade({ status: 'Missing', description: null }, { status: null })).toBeNull();
  });
});
