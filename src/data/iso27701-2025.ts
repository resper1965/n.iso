// Catálogo de controles do Anexo A da ISO/IEC 27701:2025 (adotada no Brasil como
// ABNT NBR ISO/IEC 27701:2026). O Anexo A da edição 2025 reorganizou os controles
// de privacidade em tabelas por papel:
//   - Tabela A.1 — controles específicos do CONTROLADOR de DP (31 controles);
//   - Tabela A.2 — controles específicos do OPERADOR de DP (18 controles).
// A numeração é de 4 níveis (ex.: A.1.2.6), diferente da edição 2019.
//
// IMPORTANTE (licença): os TÍTULOS abaixo são redigidos em palavras próprias, a
// partir do PROPÓSITO de cada controle — NÃO reproduzem o texto normativo da
// ABNT/ISO (conteúdo licenciado). Servem só como rótulo de trabalho no SGPI; o
// texto oficial deve ser consultado na norma adquirida.
//
// `code` é o identificador do controle (estrutural, citável); `title` é o rótulo
// próprio. O id de linha em compliance_controls é gerado (genId) — o code vai no
// título, como já é o padrão dos controles 27001 do projeto.

export interface Iso27701Control {
  code: string;
  title: string;
}

// Tabela A.1 — Controlador de DP (31).
export const ISO_27701_2025_CONTROLLER: readonly Iso27701Control[] = [
  { code: 'A.1.2.2', title: 'Identificação e documentação da finalidade do tratamento' },
  { code: 'A.1.2.3', title: 'Identificação das bases legais do tratamento' },
  { code: 'A.1.2.4', title: 'Definição de quando e como obter consentimento' },
  { code: 'A.1.2.5', title: 'Obtenção e registro do consentimento' },
  { code: 'A.1.2.6', title: 'Avaliação de impacto à privacidade (DPIA)' },
  { code: 'A.1.2.7', title: 'Contratos com operadores de DP' },
  { code: 'A.1.2.8', title: 'Acordo de controladoria conjunta' },
  { code: 'A.1.2.9', title: 'Registros das atividades de tratamento' },
  { code: 'A.1.3.2', title: 'Determinação e cumprimento de obrigações com os titulares' },
  { code: 'A.1.3.3', title: 'Definição das informações a prestar aos titulares' },
  { code: 'A.1.3.4', title: 'Prestação de informações aos titulares' },
  { code: 'A.1.3.5', title: 'Mecanismo para alterar ou retirar o consentimento' },
  { code: 'A.1.3.6', title: 'Mecanismo para oposição ao tratamento' },
  { code: 'A.1.3.7', title: 'Atendimento a acesso, correção e exclusão' },
  { code: 'A.1.3.8', title: 'Repasse de correções e exclusões a terceiros' },
  { code: 'A.1.3.9', title: 'Fornecimento de cópia dos DP tratados' },
  { code: 'A.1.3.10', title: 'Processo de atendimento a solicitações dos titulares' },
  { code: 'A.1.3.11', title: 'Governança de decisões automatizadas' },
  { code: 'A.1.4.2', title: 'Limitação da coleta ao necessário' },
  { code: 'A.1.4.3', title: 'Limitação do tratamento ao necessário' },
  { code: 'A.1.4.4', title: 'Exatidão e qualidade dos DP' },
  { code: 'A.1.4.5', title: 'Definição de objetivos de minimização de DP' },
  { code: 'A.1.4.6', title: 'Desidentificação ou eliminação ao fim do tratamento' },
  { code: 'A.1.4.7', title: 'Proteção de arquivos temporários' },
  { code: 'A.1.4.8', title: 'Política de retenção de DP' },
  { code: 'A.1.4.9', title: 'Descarte seguro de DP' },
  { code: 'A.1.4.10', title: 'Controles de transmissão de DP' },
  { code: 'A.1.5.2', title: 'Bases para transferência internacional de DP' },
  { code: 'A.1.5.3', title: 'Registro de países e organizações de destino' },
  { code: 'A.1.5.4', title: 'Registros de transferências de DP' },
  { code: 'A.1.5.5', title: 'Registros de divulgação de DP a terceiros' },
] as const;

// Tabela A.2 — Operador de DP (18).
export const ISO_27701_2025_PROCESSOR: readonly Iso27701Control[] = [
  { code: 'A.2.2.2', title: 'Acordo com o cliente controlador' },
  { code: 'A.2.2.3', title: 'Restrição ao tratamento aos propósitos do cliente' },
  { code: 'A.2.2.4', title: 'Vedação de uso para marketing e publicidade' },
  { code: 'A.2.2.5', title: 'Alerta sobre instruções que violem a lei' },
  { code: 'A.2.2.6', title: 'Suporte às obrigações do cliente com os titulares' },
  { code: 'A.2.2.7', title: 'Registros das atividades de tratamento' },
  { code: 'A.2.3.2', title: 'Apoio ao cumprimento de obrigações com os titulares' },
  { code: 'A.2.4.2', title: 'Proteção de arquivos temporários' },
  { code: 'A.2.4.3', title: 'Devolução, transferência ou descarte de DP' },
  { code: 'A.2.4.4', title: 'Controles de transmissão de DP' },
  { code: 'A.2.5.2', title: 'Fundamento para transferência internacional de DP' },
  { code: 'A.2.5.3', title: 'Registro de países e organizações de destino' },
  { code: 'A.2.5.4', title: 'Registros de divulgação de DP a terceiros' },
  { code: 'A.2.5.5', title: 'Notificação de solicitações de divulgação de DP' },
  { code: 'A.2.5.6', title: 'Divulgações de DP legalmente obrigatórias' },
  { code: 'A.2.5.7', title: 'Transparência sobre subcontratados' },
  { code: 'A.2.5.8', title: 'Autorização para uso de subcontratados' },
  { code: 'A.2.5.9', title: 'Notificação de troca de subcontratado' },
] as const;

export const ISO_27701_2025_STANDARD = 'ISO 27701:2025';

// Papéis (projects.org_role é texto livre no nISO). Normaliza para decidir quais
// tabelas semear: Controlador → A.1; Operador → A.2; ambos → A.1 + A.2.
export function controlsForRole(orgRole: string | null | undefined): Iso27701Control[] {
  const r = (orgRole || '').toLowerCase();
  const isController = /control/.test(r) || /both|amb/.test(r) || r.trim() === '';
  const isProcessor = /process|operad/.test(r) || /both|amb/.test(r);
  const out: Iso27701Control[] = [];
  if (isController) out.push(...ISO_27701_2025_CONTROLLER);
  if (isProcessor) out.push(...ISO_27701_2025_PROCESSOR);
  return out;
}
