import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit } from '../helpers';
import { validateBody } from '../schemas';
import { z } from 'zod';
import { localizarTitular, anonimizarTitular, ropaVencidos } from '../services/data-subject';

/**
 * Requisições de titular (LGPD art. 18) e vencimento de retenção (art. 16).
 *
 * Montado sob /api/v1/projects/:projectId/*, então herda o isolamento de tenant
 * do projectAccessMiddleware — uma requisição de titular nunca cruza projeto.
 *
 * Toda operação entra em audit_logs. Atender ao titular sem registrar não vale:
 * o art. 6º, X exige que o controlador demonstre a conformidade, e a trilha é
 * a demonstração.
 */
export const dataSubjectApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const PAPEIS_AUTORIZADOS = ['platform_admin', 'consultor', 'org_admin'];

/** Requisição de titular expõe PII: papel read-only não pode executar. */
function autorizado(c: any): boolean {
  return PAPEIS_AUTORIZADOS.includes(c.get('user')?.role);
}

const identificadorSchema = z.object({
  identificador: z.string().trim().min(1).max(320),
  justificativa: z.string().trim().min(1).max(2000),
}).passthrough();

/**
 * Confirmação da existência + acesso (art. 18, I e II) e portabilidade (V).
 * A saída é JSON estruturado justamente para servir de portabilidade.
 */
dataSubjectApp.get('/', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'Papel não autorizado a consultar dados de titular' }, 403);

  const projectId = c.req.param('projectId')!;
  const identificador = c.req.query('identificador');
  if (!identificador) return c.json({ error: 'Parâmetro `identificador` é obrigatório' }, 400);

  const ocorrencias = await localizarTitular(c.env.DB, projectId, identificador);
  const total = ocorrencias.reduce((s, o) => s + o.registros.length, 0);

  // A consulta em si é tratamento de dado pessoal e precisa constar da trilha.
  await logAudit(
    c.env.DB, 'lgpd.titular.consulta', c.get('user')?.email ?? 'system',
    `Consulta de dados do titular (${total} registro(s) em ${ocorrencias.length} tabela(s))`,
    '', '', projectId
  );

  return c.json({
    ok: true,
    projeto: projectId,
    identificador,
    encontrado: total > 0,
    total_registros: total,
    ocorrencias,
    emitido_em: new Date().toISOString(),
  });
});

/**
 * Eliminação (art. 18, VI) — por anonimização.
 *
 * Apagar a linha destruiria a evidência de conformidade do cliente (um registro
 * de treinamento prova que o controle A.6.3 foi cumprido). Anonimizar remove o
 * dado pessoal e preserva o fato, que é o que o art. 16, IV permite.
 */
dataSubjectApp.post('/erase', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'Papel não autorizado a eliminar dados de titular' }, 403);

  const projectId = c.req.param('projectId')!;
  const valid = await validateBody(c, identificadorSchema);
  if (!valid.success) return valid.response;
  const { identificador, justificativa } = valid.data;

  const antes = await localizarTitular(c.env.DB, projectId, identificador);
  if (!antes.length) return c.json({ error: 'Nenhum registro encontrado para este titular neste projeto' }, 404);

  const afetados = await anonimizarTitular(c.env.DB, projectId, identificador);
  const total = Object.values(afetados).reduce((s, n) => s + n, 0);

  await logAudit(
    c.env.DB, 'lgpd.titular.eliminacao', c.get('user')?.email ?? 'system',
    `Anonimização de ${total} registro(s): ${JSON.stringify(afetados)}`,
    justificativa, '', projectId
  );

  return c.json({
    ok: true,
    metodo: 'anonimizacao',
    registros_afetados: afetados,
    total: total,
    // Diz explicitamente o que NÃO foi apagado, para não induzir a erro.
    observacao: 'Os registros foram preservados sem o dado pessoal, para manter a evidência de conformidade (LGPD art. 16, IV).',
  });
});

/**
 * Retenção vencida (art. 16). Só relata — não apaga.
 * Eliminar automaticamente com base num campo de texto livre é como se apaga a
 * coisa errada; a decisão é do DPO e precisa ficar registrada.
 */
dataSubjectApp.get('/retencao', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'Papel não autorizado' }, 403);

  const projectId = c.req.param('projectId')!;
  const vencidos = await ropaVencidos(c.env.DB, projectId);
  return c.json({
    ok: true,
    total: vencidos.length,
    vencidos,
    observacao: 'Relatório apenas. A eliminação exige decisão do DPO e é registrada na trilha de auditoria.',
  });
});
