/**
 * Avisos de prazo (spec docs/superpowers/specs/2026-10-07-avisos-de-prazo-design.md).
 *
 * Uma rotina diária (cron "0 11 * * *", 08:00 em Brasília) olha seis datas que o produto já guarda e
 * avisa, no sino e num e-mail-resumo, 7 dias antes, no dia e uma vez por semana enquanto o prazo
 * estiver vencido. O dia é o de São Paulo; item resolvido não gera aviso.
 */

import { genId, escapeHtml, enviarEmail } from '../helpers';
import { appUrl } from '../config/url';
import { log } from '../observability';
import type { Bindings } from '../index';

export type Fonte = 'capa' | 'checklist' | 'auditoria' | 'certificado' | 'link_auditor' | 'politica';

export type ItemPrazo = {
  fonte: Fonte;
  item_id: string;
  project_id: string;
  /** AAAA-MM-DD, no dia de São Paulo. */
  vence_em: string;
  titulo: string;
  /** Texto livre do campo de responsável (e-mail ou nome), quando a fonte tem um. */
  responsavel: string | null;
};
export type ItemDoDia = ItemPrazo & { marco: string };

const DIA_MS = 86_400_000;
const diaUtc = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const somarDias = (dia: string, n: number) => new Date(diaUtc(dia) + n * DIA_MS).toISOString().slice(0, 10);

/** O dia de hoje em São Paulo (AAAA-MM-DD). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(agora).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** Semana ISO 8601 (`AAAA-Www`): a quinta-feira da semana decide o ano. */
export function semanaIso(dia: string): string {
  const d = new Date(diaUtc(dia));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const ano = d.getUTCFullYear();
  const semana = Math.ceil(((d.getTime() - Date.UTC(ano, 0, 1)) / DIA_MS + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

/** O marco de hoje para um vencimento, ou null. `D-7` só no dia exato; vencido, um por semana ISO. */
export function marcoDoDia(vence: string, hoje: string): string | null {
  const faltam = Math.round((diaUtc(vence) - diaUtc(hoje)) / DIA_MS);
  if (faltam === 7) return 'D-7';
  if (faltam === 0) return 'D0';
  if (faltam < 0) return `atraso-${semanaIso(hoje)}`;
  return null;
}

/*
 * Uma consulta por fonte, cada uma devolvendo as colunas de ItemPrazo (menos `fonte`) só dos itens NÃO
 * resolvidos. `date(...)` normaliza o prazo para AAAA-MM-DD e devolve NULL para texto ilegível
 * ('07/10/2026'), que o filtro de fora descarta. O JOIN com projects deixa de fora linha sem projeto.
 * Resolvido: CAPA 'Closed' (routes/capa.ts), auditoria 'Completed' (routes/audits.ts), item marcado,
 * link revogado; certificado renovado e política revisada saem sozinhos, porque a data anda.
 * ponytail: '-3 hours' é o fuso de São Paulo fixo (sem horário de verão desde 2019); se voltar, troca
 * por conversão no TypeScript.
 */
const FONTES: Record<Fonte, string> = {
  capa: `SELECT c.id AS item_id, c.project_id, date(substr(c.due_date, 1, 10)) AS vence_em, c.title AS titulo, c.assigned_to AS responsavel
    FROM corrective_actions c JOIN projects p ON p.id = c.project_id WHERE COALESCE(c.status, 'Open') <> 'Closed'`,
  checklist: `SELECT k.id AS item_id, k.project_id, date(substr(k.due_date, 1, 10)) AS vence_em,
      'Item ' || k.item_id || ' da fase ' || k.phase_number AS titulo, k.assigned_to AS responsavel
    FROM checklist_progress k JOIN projects p ON p.id = k.project_id WHERE COALESCE(k.is_checked, 0) = 0`,
  auditoria: `SELECT a.id AS item_id, a.project_id, date(substr(a.scheduled_date, 1, 10)) AS vence_em, a.title AS titulo, NULL AS responsavel
    FROM audit_schedule a JOIN projects p ON p.id = a.project_id WHERE COALESCE(a.status, 'Planned') <> 'Completed'`,
  certificado: `SELECT t.id AS item_id, t.project_id, date(substr(t.certificate_expiry, 1, 10)) AS vence_em,
      'Certificado ' || t.standard AS titulo, NULL AS responsavel
    FROM certification_tracking t JOIN projects p ON p.id = t.project_id`,
  link_auditor: `SELECT t.id AS item_id, t.project_id, date(t.expires_at, '-3 hours') AS vence_em, 'Link do auditor externo' AS titulo, NULL AS responsavel
    FROM auditor_tokens t JOIN projects p ON p.id = t.project_id WHERE t.revoked_at IS NULL`,
  politica: `SELECT c.id AS item_id, c.project_id,
      date(max(datetime(c.ciso_approved_at), datetime(c.ceo_approved_at)), '-3 hours', '+12 months') AS vence_em,
      c.title AS titulo, c.owner AS responsavel
    FROM compliance_controls c JOIN projects p ON p.id = c.project_id
    WHERE trim(COALESCE(c.description, '')) <> '' AND c.ciso_approved_at IS NOT NULL AND c.ceo_approved_at IS NOT NULL`,
};

/** Os itens que têm marco hoje. Uma fonte que falha vai para `falhas` e as outras seguem. */
export async function itensDoDia(db: D1Database, hoje: string): Promise<{ itens: ItemDoDia[]; falhas: string[] }> {
  const itens: ItemDoDia[] = [];
  const falhas: string[] = [];
  for (const fonte of Object.keys(FONTES) as Fonte[]) {
    try {
      const { results } = await db
        .prepare(`SELECT * FROM (${FONTES[fonte]}) WHERE vence_em IS NOT NULL AND vence_em <= ? ORDER BY vence_em, item_id`)
        .bind(somarDias(hoje, 7))
        .all<Omit<ItemPrazo, 'fonte'>>();
      for (const r of results) {
        const marco = marcoDoDia(r.vence_em, hoje);
        if (marco) itens.push({ fonte, ...r, marco });
      }
    } catch (e) {
      falhas.push(`${fonte}: ${mensagem(e)}`);
    }
  }
  return { itens, falhas };
}

export type Pessoa = { id: string; email: string; name: string | null; role: string };

/*
 * Quem alcança o projeto, pela MESMA regra de requireProjectAccess (src/helpers.ts), escrita em SQL para
 * um projeto só: cliente pelo client_project_id; consultor designado na governança, com a conta na
 * organização do projeto (PROJETOS_DO_CONSULTOR_SQL); consultoria_admin da organização do projeto.
 * Fora de propósito: platform_admin (alcança todas as organizações; aviso nunca atravessa organização) e
 * comercial (não trabalha em projeto). Conta desativada não recebe. O teste de paridade em
 * test/avisos-prazo.test.ts reprova se as duas regras divergirem.
 */
const PESSOAS_DO_PROJETO = `SELECT u.id, u.email, u.name, u.role FROM users u JOIN projects p ON p.id = ?1
  WHERE COALESCE(u.ativo, 1) <> 0 AND (
    (u.role IN ('org_admin', 'org_user', 'client') AND u.client_project_id = p.id)
    OR (u.role = 'consultoria_admin' AND u.org_id = p.org_id)
    OR (u.role IN ('consultor', 'consultant') AND u.org_id = p.org_id AND EXISTS (
      SELECT 1 FROM project_governance g
       WHERE g.project_id = p.id AND g.role_category = 'consultor' AND lower(g.email) = lower(u.email))))
  ORDER BY u.id`;

export async function pessoasDoProjeto(db: D1Database, projectId: string): Promise<Pessoa[]> {
  return (await db.prepare(PESSOAS_DO_PROJETO).bind(projectId).all<Pessoa>()).results;
}

const normalizar = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const ehConsultorDoProjeto = (p: Pessoa) => p.role === 'consultor' || p.role === 'consultant';

/**
 * Responsável (quando o texto bate com o e-mail, ou com o nome de UMA só pessoa do projeto) mais os
 * consultores designados. Sem nenhum dos dois, os consultoria_admin da organização. `pessoas` já vem
 * de pessoasDoProjeto: ninguém de fora do projeto chega aqui.
 */
export function escolherDestinatarios(pessoas: Pessoa[], responsavel: string | null): Pessoa[] {
  const alvo = normalizar(responsavel);
  const porEmail = alvo ? pessoas.filter((p) => normalizar(p.email) === alvo) : [];
  const porNome = alvo && !porEmail.length ? pessoas.filter((p) => normalizar(p.name) === alvo) : [];
  const resp = porEmail.length ? porEmail : porNome.length === 1 ? porNome : [];
  const escolhidos = [...resp, ...pessoas.filter(ehConsultorDoProjeto)];
  const lista = escolhidos.length ? escolhidos : pessoas.filter((p) => p.role === 'consultoria_admin');
  return [...new Map(lista.map((p) => [p.id, p])).values()];
}

type EnvAvisos = Pick<Bindings, 'DB' | 'RESEND_API_KEY' | 'APP_URL'>;

export type ResultadoAvisos = { avisos_criados: number; emails_enviados: number; sem_destinatario: number; falhas: string[] };

const ROTULO: Record<Fonte, string> = {
  capa: 'CAPA', checklist: 'Item do checklist', auditoria: 'Auditoria', certificado: 'Certificado',
  link_auditor: 'Link do auditor', politica: 'Política',
};

/** Tela de cada fonte no clique do sino (frontend/src/globals.js, handleNotificationClick). */
const TELA: Record<Fonte, string> = {
  capa: '/capa', checklist: '', auditoria: '/audits', certificado: '/certification', link_auditor: '/audits', politica: '/policies',
};

const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const quando = (marco: string) => (marco === 'D-7' ? 'vence em 7 dias' : marco === 'D0' ? 'vence hoje' : 'com prazo vencido');

/** Título curto do sino: "CAPA vence em 7 dias", "Política A.5.1 precisa de revisão", "Auditoria hoje". */
export function tituloDoAviso(item: Pick<ItemDoDia, 'fonte' | 'marco' | 'titulo'>): string {
  const d7 = item.marco === 'D-7';
  if (item.fonte === 'politica') return `Política ${item.titulo.split(' ')[0]} precisa de revisão${d7 ? ' em 7 dias' : ''}`;
  if (item.fonte === 'auditoria') return `Auditoria ${d7 ? 'em 7 dias' : item.marco === 'D0' ? 'hoje' : 'atrasada'}`;
  return `${ROTULO[item.fonte]} ${quando(item.marco)}`;
}

/**
 * A rotina do cron das 08:00. Ordem da spec (seção 5): pares (item, marco, pessoa) do dia → INSERT OR
 * IGNORE em avisos_prazo → notificação só para a linha que entrou agora (no MESMO batch, então não há
 * registro sem sino nem sino repetido) → um e-mail-resumo por pessoa com o que está pendente → marca
 * email_enviado_em só depois do envio confirmado. Falha de fonte, de item ou de e-mail vai para
 * `falhas` e a rotina segue.
 */
export async function avisosDePrazo(env: EnvAvisos, hoje: string): Promise<ResultadoAvisos> {
  const db = env.DB;
  const { itens, falhas } = await itensDoDia(db, hoje);
  const r: ResultadoAvisos = { avisos_criados: 0, emails_enviados: 0, sem_destinatario: 0, falhas };
  const pessoasPorProjeto = new Map<string, Pessoa[]>();

  for (const item of itens) {
    try {
      let pessoas = pessoasPorProjeto.get(item.project_id);
      if (!pessoas) pessoasPorProjeto.set(item.project_id, (pessoas = await pessoasDoProjeto(db, item.project_id)));
      const destinos = escolherDestinatarios(pessoas, item.responsavel);
      if (!destinos.length) { r.sem_destinatario++; continue; }
      // Atraso na mesma semana do vencimento só sai se o D0 não saiu (a rotina não rodou no dia).
      const guardaD0 = item.marco.startsWith('atraso-') && semanaIso(item.vence_em) === semanaIso(hoje) ? 1 : 0;
      for (const p of destinos) {
        const id = genId();
        const [aviso] = await db.batch([
          db.prepare(`INSERT OR IGNORE INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo)
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
             WHERE NOT (?9 AND EXISTS (SELECT 1 FROM avisos_prazo
               WHERE fonte = ?3 AND item_id = ?4 AND user_id = ?6 AND vence_em = ?7 AND marco = 'D0'))`)
            .bind(id, item.project_id, item.fonte, item.item_id, item.marco, p.id, item.vence_em, item.titulo, guardaD0),
          db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, read, link, created_at)
            SELECT ?, ?, ?, ?, ?, 0, ?, datetime('now') WHERE EXISTS (SELECT 1 FROM avisos_prazo WHERE id = ?)`)
            .bind(genId(), p.id, `prazo_${item.fonte}`, tituloDoAviso(item), `${item.titulo} (prazo ${dataBr(item.vence_em)})`,
              `/projects/${item.project_id}${TELA[item.fonte]}`, id),
        ]);
        r.avisos_criados += aviso.meta.changes ?? 0;
      }
    } catch (e) {
      r.falhas.push(`${item.fonte} ${item.item_id}: ${mensagem(e)}`);
    }
  }

  // Sem a chave, enviarEmail só simula e devolve true: marcar enviado seria mentir (Decisão 3 do plano).
  if (env.RESEND_API_KEY) {
    try {
      await enviarResumos(env, r);
    } catch (e) {
      r.falhas.push(`email: ${mensagem(e)}`);
    }
  }

  log(r.falhas.length ? 'error' : 'info', { msg: 'avisos_prazo', hoje, ...r });
  return r;
}

type LinhaEmail = { id: string; user_id: string; email: string; projeto: string; fonte: Fonte; marco: string; vence_em: string; titulo: string };

/** Um e-mail por pessoa com tudo o que está pendente dos últimos 7 dias; marca só o que saiu. */
async function enviarResumos(env: EnvAvisos, r: ResultadoAvisos): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.user_id, u.email, COALESCE(p.project_name, p.client_name) AS projeto, a.fonte, a.marco, a.vence_em, a.titulo
       FROM avisos_prazo a JOIN users u ON u.id = a.user_id JOIN projects p ON p.id = a.project_id
      WHERE a.email_enviado_em IS NULL AND a.criado_em >= datetime('now', '-7 days') AND COALESCE(u.ativo, 1) <> 0
      ORDER BY a.user_id, projeto, a.vence_em, a.titulo`
  ).all<LinhaEmail>();
  const porPessoa = new Map<string, LinhaEmail[]>();
  for (const l of results) porPessoa.set(l.user_id, [...(porPessoa.get(l.user_id) ?? []), l]);

  for (const [userId, linhas] of porPessoa) {
    const n = linhas.length;
    const ok = await enviarEmail(env, linhas[0].email, `n.iso: ${n} ${n === 1 ? 'prazo' : 'prazos'} para acompanhar`, emailResumo(linhas, appUrl(env)));
    // Recusado: fica nulo e o dia seguinte tenta de novo, sem notificação nova. O log leva o id, não o e-mail.
    if (!ok) { r.falhas.push(`email ${userId}: envio recusado`); continue; }
    await env.DB.prepare(`UPDATE avisos_prazo SET email_enviado_em = datetime('now') WHERE email_enviado_em IS NULL AND id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(linhas.map((l) => l.id))).run();
    r.emails_enviados++;
  }
}

/** HTML simples, todo dado escapado, agrupado por projeto. Link único para o app: o SPA não roteia por URL. */
function emailResumo(linhas: LinhaEmail[], base: string): string {
  const e = escapeHtml;
  const porProjeto = new Map<string, LinhaEmail[]>();
  for (const l of linhas) porProjeto.set(l.projeto, [...(porProjeto.get(l.projeto) ?? []), l]);
  const blocos = [...porProjeto].map(([projeto, ls]) =>
    `<h3 style="font-size: 15px; margin: 20px 0 8px;">${e(projeto)}</h3><ul>${ls.map((l) =>
      `<li>${e(ROTULO[l.fonte])}: ${e(l.titulo)} (${e(quando(l.marco))}, ${dataBr(l.vence_em)})</li>`).join('')}</ul>`).join('');
  return `<div style="font-family: Arial, sans-serif; max-width: 560px; color: #1e293b;">
    <p>Estes prazos precisam da sua atenção:</p>${blocos}
    <p><a href="${e(base)}" style="background-color: #00ade8; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Abrir o n.iso</a></p>
    <p style="font-size: 12px; color: #64748b;">Os mesmos avisos estão no sino do n.iso, com o link de cada item.</p>
  </div>`;
}
