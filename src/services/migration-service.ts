/**
 * Mapeamento de Transição ISO 27001:2013 -> 2022
 * Baseado no Anexo B da ISO 27002:2022
 */
const CONTROL_MAP_2013_TO_2022: Record<string, string[]> = {
  'A.5.1.1': ['A.5.1'], 'A.5.1.2': ['A.5.1'],
  'A.6.1.1': ['A.5.2'],
  'A.6.1.2': ['A.5.3'],
  'A.7.2.1': ['A.5.4'],
  'A.6.1.3': ['A.5.5'],
  'A.6.1.4': ['A.5.6'],
  'A.6.1.5': ['A.5.8'],
  'A.8.1.1': ['A.5.9'], 'A.8.1.2': ['A.5.9'],
  'A.8.1.3': ['A.5.10'],
  'A.8.1.4': ['A.5.11'],
  'A.8.2.1': ['A.5.12'],
  'A.8.2.2': ['A.5.13'],
  'A.13.2.1': ['A.5.14'], 'A.13.2.2': ['A.5.14'], 'A.13.2.3': ['A.5.14'],
  'A.9.1.1': ['A.5.15'], 'A.9.1.2': ['A.5.15'],
  'A.9.2.1': ['A.5.16'],
  'A.9.2.4': ['A.5.17'], 'A.9.3.1': ['A.5.17'], 'A.9.4.3': ['A.5.17'],
  'A.9.2.2': ['A.5.18'], 'A.9.2.5': ['A.5.18'], 'A.9.2.6': ['A.5.18'],
  'A.15.1.1': ['A.5.19'],
  'A.15.1.2': ['A.5.20'],
  'A.15.1.3': ['A.5.21'],
  'A.15.2.1': ['A.5.22'], 'A.15.2.2': ['A.5.22'],
  'A.16.1.1': ['A.5.24'],
  'A.16.1.4': ['A.5.25'],
  'A.16.1.5': ['A.5.26'],
  'A.16.1.6': ['A.5.27'],
  'A.16.1.7': ['A.5.28'],
  'A.17.1.1': ['A.5.29'], 'A.17.1.2': ['A.5.29'],
  'A.18.1.1': ['A.5.31'],
  'A.18.1.2': ['A.5.32'],
  'A.18.1.3': ['A.5.33'],
  'A.18.1.4': ['A.5.34'],
  'A.18.2.1': ['A.5.35'],
  'A.18.2.2': ['A.5.36'], 'A.18.2.3': ['A.5.36'],
  'A.12.1.1': ['A.5.37'],
  'A.7.1.1': ['A.6.1'],
  'A.7.1.2': ['A.6.2'],
  'A.7.2.2': ['A.6.3'],
  'A.7.2.3': ['A.6.4'],
  'A.7.3.1': ['A.6.5'],
  'A.13.2.4': ['A.6.6'],
  'A.6.2.2': ['A.6.7'],
  'A.16.1.2': ['A.6.8'], 'A.16.1.3': ['A.6.8'],
  'A.11.1.1': ['A.7.1'],
  'A.11.1.2': ['A.7.2'], 'A.11.1.6': ['A.7.2'],
  'A.11.1.3': ['A.7.3'],
  'A.11.1.4': ['A.7.5'],
  'A.11.1.5': ['A.7.6'],
  'A.11.2.9': ['A.7.7'],
  'A.11.2.1': ['A.7.8'],
  'A.11.2.6': ['A.7.9'],
  'A.8.3.1': ['A.7.10'], 'A.8.3.2': ['A.7.10'], 'A.8.3.3': ['A.7.10'], 'A.11.2.5': ['A.7.10'],
  'A.11.2.2': ['A.7.11'],
  'A.11.2.3': ['A.7.12'],
  'A.11.2.4': ['A.7.13'],
  'A.11.2.7': ['A.7.14'],
  'A.6.2.1': ['A.8.1'], 'A.11.2.8': ['A.8.1'],
  'A.9.2.3': ['A.8.2'],
  'A.9.4.1': ['A.8.3'],
  'A.9.4.5': ['A.8.4'],
  'A.9.4.2': ['A.8.5'],
  'A.12.1.3': ['A.8.6'],
  'A.12.2.1': ['A.8.7'],
  'A.12.6.1': ['A.8.8'], 'A.12.6.2': ['A.8.8'],
  'A.12.3.1': ['A.8.13'],
  'A.17.2.1': ['A.8.14'],
  'A.12.4.1': ['A.8.15'], 'A.12.4.2': ['A.8.15'], 'A.12.4.3': ['A.8.15'],
  'A.12.4.4': ['A.8.17'],
  'A.9.4.4': ['A.8.18'],
  'A.12.5.1': ['A.8.19'],
  'A.13.1.1': ['A.8.20'],
  'A.13.1.2': ['A.8.21'],
  'A.13.1.3': ['A.8.22'],
  'A.10.1.1': ['A.8.24'], 'A.10.1.2': ['A.8.24'], 'A.18.1.5': ['A.8.24'],
  'A.14.2.1': ['A.8.25'],
  'A.14.1.1': ['A.8.26'], 'A.14.1.2': ['A.8.26'], 'A.14.1.3': ['A.8.26'],
  'A.14.2.5': ['A.8.27'],
  'A.14.2.8': ['A.8.29'], 'A.14.2.9': ['A.8.29'],
  'A.14.2.7': ['A.8.30'],
  'A.12.1.4': ['A.8.31'], 'A.14.2.6': ['A.8.31'],
  'A.12.1.2': ['A.8.32'], 'A.14.2.2': ['A.8.32'], 'A.14.2.3': ['A.8.32'], 'A.14.2.4': ['A.8.32'],
  'A.14.3.1': ['A.8.33'],
  'A.12.7.1': ['A.8.34'],
  // Novos controles v2022
  'NEW': ['A.5.7', 'A.5.23', 'A.5.30', 'A.7.4', 'A.8.9', 'A.8.10', 'A.8.11', 'A.8.12', 'A.8.16', 'A.8.23', 'A.8.28']
};

const CONTROL_MAP_27701_2019_TO_2025: Record<string, string[]> = {
  // Clause 7 (2019 Controller) -> Table A.1 (2025 Controller)
  '7.2.1': ['A.1.1'], '7.2.2': ['A.1.1'],
  '7.2.3': ['A.1.2'],
  '7.2.4': ['A.1.3'],
  '7.3.1': ['A.1.4'], '7.3.2': ['A.1.4'], '7.3.3': ['A.1.4'],
  '7.3.4': ['A.1.5'],
  '7.3.5': ['A.1.6'],
  '7.3.6': ['A.1.7'],
  '7.3.7': ['A.1.8'],
  '7.4.1': ['A.1.9'], '7.4.2': ['A.1.9'],
  '7.4.3': ['A.1.10'], '7.4.4': ['A.1.10'],
  '7.5.1': ['A.1.13'],

  // Clause 8 (2019 Processor) -> Table A.2 (2025 Processor)
  '8.2.1': ['A.2.1'],
  '8.2.2': ['A.2.2'],
  '8.2.3': ['A.2.3'],
  '8.2.4': ['A.2.4'],
  '8.2.5': ['A.2.5'],
  '8.2.6': ['A.2.6'],
  '8.3.1': ['A.2.7'],
  '8.4.1': ['A.2.8'],
  '8.4.2': ['A.2.9'],
  '8.4.3': ['A.2.10'],
  '8.5.1': ['A.2.12'],

  // Clauses 5 & 6 (2019 Common) -> Table A.3 (2025 Common)
  '5.2': ['A.3.1'], '5.3': ['A.3.2'], '5.4': ['A.3.3'],
  '6.2.1.1': ['A.3.1'], '6.2.1.2': ['A.3.1'],
  '6.3.1.1': ['A.3.4'],
  '6.3.2.1': ['A.3.5'],
  '6.3.2.2': ['A.3.6'],
  '6.4.1.1': ['A.3.7'], '6.4.1.2': ['A.3.8'],
  '6.5.1.1': ['A.3.10'], '6.5.1.2': ['A.3.11'],
  '6.6.1.1': ['A.3.13'],
  '6.7.1.1': ['A.3.14'], '6.7.1.2': ['A.3.15'],
  '6.7.2.1': ['A.3.16'],
  '6.8.1.1': ['A.3.19'],
  '6.8.2.1': ['A.3.20'],
  '6.8.3.1': ['A.3.22'],
  '6.9.1.1': ['A.3.23'], '6.9.1.2': ['A.3.24'],
  '6.10.1.1': ['A.3.26'],
  '6.11.1.1': ['A.3.28'], '6.11.1.2': ['A.3.30'],
  '6.12.1.1': ['A.3.34'], '6.12.1.2': ['A.3.35'],
  '6.13.1.1': ['A.3.37'], '6.13.1.2': ['A.3.38'], '6.13.1.3': ['A.3.39'],
  '6.14.1.1': ['A.3.40'],
  '6.15.1.1': ['A.3.41'],

  // Novos controles introduzidos na v2025
  'NEW': ['A.1.18', 'A.1.20', 'A.2.14', 'A.2.15', 'A.3.33', 'A.3.36']
};

export interface MigrationResult {
  newSoA: Record<string, boolean>;
  gaps: string[];
  transformationRatio: number;
}

export class MigrationService {
  /**
   * Migra um Statement of Applicability da v2013 para a v2022
   */
  static migrateSoA(oldSoA: Record<string, boolean>): MigrationResult {
    const newSoA: Record<string, boolean> = {};
    const gaps: string[] = [];

    // Mapeia controles antigos para novos
    for (const [oldId, isApplicable] of Object.entries(oldSoA)) {
      const targets = CONTROL_MAP_2013_TO_2022[oldId];
      if (targets) {
        targets.forEach(newId => {
          newSoA[newId] = isApplicable;
        });
      }
    }

    // Identifica novos controles que precisam de atenção (Gaps de Versão)
    CONTROL_MAP_2013_TO_2022['NEW'].forEach(newId => {
      if (!(newId in newSoA)) {
        newSoA[newId] = false; // Começa como falso pois é novo
        gaps.push(newId);
      }
    });

    const transformationRatio = Object.keys(newSoA).length / 93;

    return { newSoA, gaps, transformationRatio };
  }

  /**
   * Migra um Statement of Applicability do ISO 27701:2019 para a v2025
   */
  static migrateSoA27701(oldSoA: Record<string, boolean>): MigrationResult {
    const newSoA: Record<string, boolean> = {};
    const gaps: string[] = [];

    // Mapeia controles antigos para novos
    for (const [oldId, isApplicable] of Object.entries(oldSoA)) {
      const targets = CONTROL_MAP_27701_2019_TO_2025[oldId];
      if (targets) {
        targets.forEach(newId => {
          newSoA[newId] = isApplicable;
        });
      }
    }

    // Identifica novos controles que precisam de atenção
    CONTROL_MAP_27701_2019_TO_2025['NEW'].forEach(newId => {
      if (!(newId in newSoA)) {
        newSoA[newId] = false;
        gaps.push(newId);
      }
    });

    const transformationRatio = Object.keys(newSoA).length / 78;

    return { newSoA, gaps, transformationRatio };
  }
}
