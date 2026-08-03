/**
 * Direitos do titular (LGPD art. 18) e retenção.
 *
 * O produto vende conformidade LGPD e não atendia requisição de titular
 * nenhuma: não havia como localizar, exportar ou eliminar os dados de uma
 * pessoa. Um cliente que recebesse pedido de titular teria de abrir o banco na
 * mão — o que, além de inviável, não deixa registro de que atendeu.
 *
 * O que está implementado aqui:
 *   art. 18, I e II  — confirmação da existência e acesso aos dados
 *   art. 18, V       — portabilidade (a exportação é JSON estruturado)
 *   art. 18, VI      — eliminação
 *   art. 16          — retenção: o que já passou do prazo declarado no ROPA
 *
 * DECISÃO IMPORTANTE: eliminação anonimiza, não apaga a linha.
 * Um registro de treinamento é evidência de que o controle A.6.3 foi cumprido;
 * apagá-lo destrói a prova de conformidade do cliente e cria um problema de
 * auditoria maior do que o que se pretendia resolver. Anonimizar remove o dado
 * pessoal e preserva o fato — que é exatamente o que a LGPD art. 16, II e IV
 * permite e o que a ISO exige.
 */

/** Onde há dado pessoal de titular que não é usuário do sistema. */
type FontePII = {
  tabela: string;
  colunaProjeto: string;
  /** Colunas que identificam a pessoa (usadas na busca). */
  identificadores: string[];
  /** Colunas anonimizadas na eliminação, e o valor que assumem. */
  anonimizar: Record<string, string>;
  /** O que a linha significa, para o relatório ao titular. */
  descricao: string;
};

export const FONTES_PII: FontePII[] = [
  {
    tabela: 'training_records',
    colunaProjeto: 'project_id',
    identificadores: ['employee_name'],
    anonimizar: { employee_name: '[ANONIMIZADO]' },
    descricao: 'Registro de participação em treinamento de segurança',
  },
  {
    tabela: 'policy_acknowledgments',
    colunaProjeto: 'project_id',
    identificadores: ['user_name', 'user_email'],
    // IP e user-agent são dado pessoal e não são necessários depois da anonimização.
    anonimizar: { user_name: '[ANONIMIZADO]', user_email: '[ANONIMIZADO]', ip_address: '', user_agent: '' },
    descricao: 'Aceite de política interna',
  },
  {
    tabela: 'project_governance',
    colunaProjeto: 'project_id',
    identificadores: ['name', 'email'],
    anonimizar: { name: '[ANONIMIZADO]', email: '' },
    descricao: 'Participação na matriz de governança do SGSI',
  },
  {
    tabela: 'stakeholders',
    colunaProjeto: 'project_id',
    identificadores: ['name'],
    anonimizar: { name: '[ANONIMIZADO]' },
    descricao: 'Parte interessada mapeada (cláusula 4.2)',
  },
];

export type Ocorrencia = {
  tabela: string;
  descricao: string;
  registros: Record<string, unknown>[];
};

/**
 * Localiza tudo que se refere a um titular dentro de um projeto.
 * A busca é por igualdade, não por LIKE: `%a%` casaria com meio mundo, e
 * devolver dado de terceiro numa requisição de titular é vazamento, não
 * atendimento.
 */
export async function localizarTitular(
  db: D1Database,
  projectId: string,
  identificador: string
): Promise<Ocorrencia[]> {
  const achados: Ocorrencia[] = [];
  for (const fonte of FONTES_PII) {
    const where = fonte.identificadores.map(c => `${c} = ?`).join(' OR ');
    const binds = fonte.identificadores.map(() => identificador);
    const { results } = await db
      .prepare(`SELECT * FROM ${fonte.tabela} WHERE ${fonte.colunaProjeto} = ? AND (${where})`)
      .bind(projectId, ...binds)
      .all();
    if (results && results.length) {
      achados.push({ tabela: fonte.tabela, descricao: fonte.descricao, registros: results as any[] });
    }
  }
  return achados;
}

/**
 * Anonimiza os dados do titular. Devolve quantas linhas foram afetadas por
 * tabela — o número entra na trilha de auditoria, que é como o cliente
 * demonstra depois que atendeu ao pedido.
 */
export async function anonimizarTitular(
  db: D1Database,
  projectId: string,
  identificador: string
): Promise<Record<string, number>> {
  const afetados: Record<string, number> = {};
  for (const fonte of FONTES_PII) {
    const sets = Object.keys(fonte.anonimizar).map(c => `${c} = ?`).join(', ');
    const valores = Object.values(fonte.anonimizar);
    const where = fonte.identificadores.map(c => `${c} = ?`).join(' OR ');
    const binds = fonte.identificadores.map(() => identificador);
    const r = await db
      .prepare(`UPDATE ${fonte.tabela} SET ${sets} WHERE ${fonte.colunaProjeto} = ? AND (${where})`)
      .bind(...valores, projectId, ...binds)
      .run();
    const n = (r as any)?.meta?.changes ?? 0;
    if (n > 0) afetados[fonte.tabela] = n;
  }
  return afetados;
}

// ─── Retenção (art. 16) ──────────────────────────────────────────────────────

/**
 * `retention_period` é texto livre preenchido pelo consultor ("5 anos",
 * "6 meses", "12 months"). Interpreta o que der e devolve a duração em dias;
 * null quando não dá para entender — e "não entendi" é diferente de "não
 * venceu", por isso o retorno é explícito.
 */
export function interpretarRetencao(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const t = texto.toLowerCase().trim();
  if (/indetermin|permanent|indefinid/.test(t)) return null;
  const m = t.match(/(\d+)\s*(dia|day|m[eê]s|month|ano|year)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unidade = m[2];
  if (/dia|day/.test(unidade)) return n;
  if (/m[eê]s|month/.test(unidade)) return n * 30;
  return n * 365;
}

export type RopaVencido = {
  id: string;
  processing_purpose: string;
  retention_period: string;
  created_at: string;
  dias_de_retencao: number;
  dias_vencido: number;
};

/**
 * Lista os registros de tratamento cujo prazo declarado já passou.
 *
 * NÃO apaga nada. Eliminar dado automaticamente com base num campo de texto
 * livre é como se apaga a coisa errada — a decisão é do DPO, e a LGPD exige
 * que ela seja registrada. O papel do sistema é não deixar o prazo passar
 * despercebido, que é o que acontece hoje.
 */
export async function ropaVencidos(db: D1Database, projectId: string, agora = new Date()): Promise<RopaVencido[]> {
  const { results } = await db
    .prepare('SELECT id, processing_purpose, retention_period, created_at FROM ropa_records WHERE project_id = ?')
    .bind(projectId)
    .all<any>();

  const vencidos: RopaVencido[] = [];
  for (const r of results || []) {
    const dias = interpretarRetencao(r.retention_period);
    if (dias === null || !r.created_at) continue;
    const criado = new Date(r.created_at).getTime();
    if (Number.isNaN(criado)) continue;
    const decorridos = Math.floor((agora.getTime() - criado) / 86_400_000);
    if (decorridos > dias) {
      vencidos.push({
        id: r.id,
        processing_purpose: r.processing_purpose,
        retention_period: r.retention_period,
        created_at: r.created_at,
        dias_de_retencao: dias,
        dias_vencido: decorridos - dias,
      });
    }
  }
  return vencidos;
}
