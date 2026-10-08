import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, workerEnv } from './helpers/d1';
import { hojeEmSaoPaulo, semanaIso, marcoDoDia, itensDoDia, pessoasDoProjeto, escolherDestinatarios, avisosDePrazo } from '../src/services/avisos-prazo';
import worker, { CRON_AVISOS } from '../src/index';
import wrangler from '../wrangler.jsonc?raw';
import { requireProjectAccess } from '../src/helpers';

/**
 * Avisos de prazo (spec 2026-10-07-avisos-de-prazo-design). D1 real; a data é simulada pelo
 * parâmetro `hoje`. HOJE é uma quarta-feira, semana ISO 2026-W41.
 */
const HOJE = '2026-10-07';
const db = () => env.DB;

async function projeto(id = 'p1', org = 'org_ness') {
  await db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, ?, 'ISO 27001:2022', 'Controller', 'Active', ?)`)
    .bind(id, `Cliente ${id}`, org).run();
}

const umAnoAntes = (dia: string) => `${Number(dia.slice(0, 4)) - 1}${dia.slice(4)}`;

/** Uma linha da fonte, no projeto p1, vencendo em `vence`; `resolvido` grava o estado que a tira do aviso. */
const SEMEAR: Record<string, (id: string, vence: string, resolvido: boolean) => D1PreparedStatement> = {
  capa: (id, vence, r) => db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES (?, 'p1', ?, ?, ?)`)
    .bind(id, `CAPA ${id}`, vence, r ? 'Closed' : 'Open'),
  checklist: (id, vence, r) => db().prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, due_date) VALUES (?, 'p1', 1, ?, ?, ?)`)
    .bind(id, id, r ? 1 : 0, vence),
  auditoria: (id, vence, r) => db().prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date, status) VALUES (?, 'p1', 'Internal', ?, ?, ?)`)
    .bind(id, `Auditoria ${id}`, vence, r ? 'Completed' : 'Planned'),
  // Renovado = a validade nova está longe.
  certificado: (id, vence, r) => db().prepare(`INSERT INTO certification_tracking (id, project_id, certificate_expiry) VALUES (?, 'p1', ?)`)
    .bind(id, r ? '2029-01-01' : vence),
  // 12:00 UTC = 09:00 em Brasília, mesmo dia.
  link_auditor: (id, vence, r) => db().prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, revoked_at) VALUES (?, 'p1', ?, ?, ?)`)
    .bind(id, `hash-${id}`, `${vence} 12:00:00`, r ? '2026-09-01 10:00:00' : null),
  // Vence 12 meses depois da assinatura mais recente; revisada = as duas assinaturas novas.
  politica: (id, vence, r) => db().prepare(
    `INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_at, ceo_approved_at) VALUES (?, 'p1', 'ISO 27001:2022', ?, 'Texto da política', ?, ?)`
  ).bind(id, `A.5.${id.length} Políticas`, r ? `${vence}T15:00:00.000Z` : `${umAnoAntes(vence).slice(0, 8)}01T15:00:00.000Z`, r ? `${vence}T15:00:00.000Z` : `${umAnoAntes(vence)}T15:00:00.000Z`),
};

describe('marcos (funções puras)', () => {
  it('semana ISO, inclusive na virada de ano', () => {
    expect(semanaIso('2026-10-07')).toBe('2026-W41');
    expect(semanaIso('2026-10-11')).toBe('2026-W41'); // domingo fecha a semana
    expect(semanaIso('2026-10-12')).toBe('2026-W42');
    expect(semanaIso('2026-01-01')).toBe('2026-W01');
    expect(semanaIso('2027-01-01')).toBe('2026-W53');
    expect(semanaIso('2024-12-30')).toBe('2025-W01');
  });

  it('o dia é o de São Paulo, não o de UTC', () => {
    expect(hojeEmSaoPaulo(new Date('2026-10-07T02:30:00Z'))).toBe('2026-10-06');
    expect(hojeEmSaoPaulo(new Date('2026-10-07T11:00:00Z'))).toBe('2026-10-07');
  });

  it('D-7 só no dia exato, D0 no dia, atraso com a semana de hoje', () => {
    expect(marcoDoDia('2026-10-14', HOJE)).toBe('D-7');
    expect(marcoDoDia('2026-10-07', HOJE)).toBe('D0');
    expect(marcoDoDia('2026-10-06', HOJE)).toBe('atraso-2026-W41');
    expect(marcoDoDia('2026-09-01', HOJE)).toBe('atraso-2026-W41');
    expect(marcoDoDia('2026-10-10', HOJE)).toBeNull();
    expect(marcoDoDia('2026-10-15', HOJE)).toBeNull();
  });
});

describe('fontes do dia', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await projeto();
  });

  for (const fonte of Object.keys(SEMEAR)) {
    it(`${fonte}: D-7, D0 e atraso nos dias certos; fora da janela e resolvido não entram`, async () => {
      await db().batch([
        SEMEAR[fonte](`${fonte}-d7`, '2026-10-14', false),
        SEMEAR[fonte](`${fonte}-d0`, '2026-10-07', false),
        SEMEAR[fonte](`${fonte}-atr`, '2026-10-01', false),
        SEMEAR[fonte](`${fonte}-longe`, '2026-10-10', false),
        SEMEAR[fonte](`${fonte}-ok`, '2026-10-07', true),
      ]);
      const { itens, falhas } = await itensDoDia(db(), HOJE);
      expect(falhas).toEqual([]);
      const marcos = Object.fromEntries(itens.filter((i) => i.fonte === fonte).map((i) => [i.item_id, i.marco]));
      expect(marcos).toEqual({ [`${fonte}-d7`]: 'D-7', [`${fonte}-d0`]: 'D0', [`${fonte}-atr`]: 'atraso-2026-W41' });
    });
  }

  it('CAPA traz título, responsável e projeto; prazo com hora vale pelo dia, prazo ilegível é ignorado', async () => {
    await db().batch([
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, assigned_to, due_date, status) VALUES ('c-hora', 'p1', 'Trocar senha', 'Ana', '2026-10-07T00:00:00.000Z', 'In Progress')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES ('c-br', 'p1', 'Data brasileira', '07/10/2026', 'Open')`),
    ]);
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(falhas).toEqual([]);
    expect(itens).toEqual([{ fonte: 'capa', item_id: 'c-hora', project_id: 'p1', vence_em: '2026-10-07', titulo: 'Trocar senha', responsavel: 'Ana', marco: 'D0' }]);
  });

  it('link do auditor que vence às 02:00 UTC vence no dia anterior em Brasília', async () => {
    await db().prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES ('t-madrugada', 'p1', 'h', '2026-10-08 02:00:00')`).run();
    const { itens } = await itensDoDia(db(), HOJE);
    expect(itens.map((i) => [i.item_id, i.vence_em, i.marco])).toEqual([['t-madrugada', '2026-10-07', 'D0']]);
  });

  it('política: só com texto e as DUAS assinaturas; vence 12 meses após a mais recente, em qualquer formato', async () => {
    await db().batch([
      // Mais recente em formato legado: 2025-10-07 15:00 UTC → vence 2026-10-07.
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, owner, ciso_approved_at, ceo_approved_at) VALUES ('pol-ok', 'p1', 'ISO 27001:2022', 'A.5.1 Políticas', 'Texto', 'Ana', '2025-09-30T10:00:00.000Z', '2025-10-07 15:00:00')`),
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_at) VALUES ('pol-uma', 'p1', 'ISO 27001:2022', 'A.5.2 Papéis', 'Texto', '2025-10-07T15:00:00.000Z')`),
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_at, ceo_approved_at) VALUES ('pol-vazia', 'p1', 'ISO 27001:2022', 'A.5.3 Segregação', '  ', '2025-10-07T15:00:00.000Z', '2025-10-07T15:00:00.000Z')`),
    ]);
    const { itens } = await itensDoDia(db(), HOJE);
    expect(itens).toEqual([{ fonte: 'politica', item_id: 'pol-ok', project_id: 'p1', vence_em: '2026-10-07', titulo: 'A.5.1 Políticas', responsavel: 'Ana', marco: 'D0' }]);
  });

  it('um erro numa fonte não impede as outras', async () => {
    await SEMEAR.capa('c-ok', HOJE, false).run();
    await db().prepare('DROP TABLE certification_tracking').run(); // nenhuma FK aponta para ela; o beforeEach a recria
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(itens.map((i) => i.item_id)).toEqual(['c-ok']);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatch(/^certificado: /);
  });
});

describe('destinatários', () => {
  const usuario = (id: string, email: string, name: string, role: string, extra: { proj?: string; org?: string; ativo?: number } = {}) =>
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`)
      .bind(id, email, name, role, extra.proj ?? null, extra.org ?? 'org_ness', extra.ativo ?? 1);
  const consultorNoP1 = (email: string) =>
    db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Consultor', ?, 'consultor', 'Consultor')`).bind(email);

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await projeto('p1', 'org_ness');
    await projeto('pB', 'org_b');
    await db().batch([
      usuario('u-cons', 'cons@ness.lat', 'Carla Consultora', 'consultor'),
      usuario('u-ana', 'ana@cliente.com', 'Ana Souza', 'org_user', { proj: 'p1' }),
      usuario('u-adm', 'adm@ness.lat', 'Admin Ness', 'consultoria_admin'),
      usuario('u-bia', 'bia@cliente.com', 'Bia', 'org_user', { proj: 'p1', ativo: 0 }),
      usuario('u-anab', 'ana@outra.com', 'Ana Souza', 'org_user', { proj: 'pB', org: 'org_b' }),
      usuario('u-plat', 'plat@ness.lat', 'Ana Souza', 'platform_admin'),
      usuario('u-consb', 'cons@b.com', 'Consultor B', 'consultor', { org: 'org_b' }),
      usuario('u-admb', 'adm@b.com', 'Admin B', 'consultoria_admin', { org: 'org_b' }),
      usuario('u-com', 'com@ness.lat', 'Comercial', 'comercial', { proj: 'p1' }), // client_project_id não dá acesso ao comercial
      usuario('u-cons-sem', 'semdes@ness.lat', 'Sem designação', 'consultor', { proj: 'p1' }), // client_project_id não substitui a designação
      usuario('u-cons-off', 'off@ness.lat', 'Designado inativo', 'consultor', { ativo: 0 }),
      consultorNoP1('cons@ness.lat'),
      consultorNoP1('cons@b.com'), // e-mail de outra consultoria digitado na governança: não alcança
      consultorNoP1('off@ness.lat'),
    ]);
  });

  const destinos = async (resp: string | null) =>
    escolherDestinatarios(await pessoasDoProjeto(db(), 'p1'), resp).map((p) => p.id).sort();

  it('responsável por e-mail, sem caixa nem espaço, mais o consultor', async () => {
    expect(await destinos('  ANA@Cliente.com ')).toEqual(['u-ana', 'u-cons']);
  });

  it('responsável por nome ignorando caixa e espaços; homônimo de outra organização e da plataforma não recebe', async () => {
    expect(await destinos('ana   SOUZA')).toEqual(['u-ana', 'u-cons']);
  });

  it('responsável inativo ou desconhecido: só o consultor', async () => {
    expect(await destinos('Bia')).toEqual(['u-cons']);
    expect(await destinos('Fulano')).toEqual(['u-cons']);
    expect(await destinos(null)).toEqual(['u-cons']);
  });

  it('nome que casa com duas pessoas do projeto não resolve', async () => {
    await usuario('u-ana2', 'ana2@cliente.com', 'Ana Souza', 'org_admin', { proj: 'p1' }).run();
    expect(await destinos('Ana Souza')).toEqual(['u-cons']);
  });

  it('sem responsável resolvido e sem consultor: os consultoria_admin ativos da organização do projeto', async () => {
    await db().prepare(`DELETE FROM project_governance`).run();
    expect(await destinos('Fulano')).toEqual(['u-adm']);
    expect(await destinos('ana@cliente.com')).toEqual(['u-ana']);
  });

  it('paridade com requireProjectAccess: quem entra é exatamente quem alcança o projeto (fora a plataforma)', async () => {
    const pessoas = (await pessoasDoProjeto(db(), 'p1')).map((p) => p.id).sort();
    const { results: todos } = await db().prepare(`SELECT id, email, role, client_project_id, org_id, ativo FROM users WHERE role <> 'platform_admin'`)
      .all<{ id: string; email: string; role: string; client_project_id: string | null; org_id: string; ativo: number }>();
    const alcancam: string[] = [];
    for (const u of todos) {
      const ok = await requireProjectAccess(db(), { role: u.role, email: u.email, client_project_id: u.client_project_id, org_id: u.org_id }, 'p1').then(() => true, () => false);
      if (ok && u.ativo) alcancam.push(u.id);
    }
    expect(pessoas).toEqual(alcancam.sort());
    expect(pessoas).toEqual(['u-adm', 'u-ana', 'u-cons']);
    expect(pessoas).not.toContain('u-com');
  });
});

describe('rotina avisosDePrazo', () => {
  type Email = { to: string[]; subject: string; html: string };
  let emails: Email[] = [];
  let resendOk = true;
  const COM_CHAVE = () => ({ ...workerEnv(), RESEND_API_KEY: 'chave-de-teste' });
  const SEM_CHAVE = () => ({ ...workerEnv(), RESEND_API_KEY: undefined });
  const notificacoes = async () => (await db().prepare(`SELECT user_id, type, title, message, link FROM notifications ORDER BY user_id, type`).all<Record<string, string>>()).results;
  const avisos = async () => (await db().prepare(`SELECT fonte, item_id, marco, user_id, vence_em, email_enviado_em FROM avisos_prazo ORDER BY item_id, user_id, marco`).all<Record<string, string | null>>()).results;

  beforeEach(async () => {
    await applySchema();
    await resetData();
    await projeto('p1');
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Carla', 'consultor')`),
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-ana', 'ana@cliente.com', 'x', 'Ana Souza', 'org_user', 'p1')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Carla', 'cons@ness.lat', 'consultor', 'Consultor')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, assigned_to, due_date, status) VALUES ('cap-1', 'p1', 'Trocar <b>senhas</b>', 'Ana Souza', '2026-10-07', 'Open')`),
      db().prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES ('au-1', 'p1', 'Internal', 'Auditoria interna anual', '2026-10-14')`),
    ]);
    emails = []; resendOk = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: RequestInfo | URL, init?: RequestInit) => {
      emails.push(JSON.parse(String(init?.body)));
      return new Response(resendOk ? '{}' : 'falhou', { status: resendOk ? 200 : 500 });
    }) as typeof fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('cria o sino com título curto e link da tela; um e-mail-resumo por pessoa; rodar de novo no mesmo dia não duplica nada', async () => {
    const r1 = await avisosDePrazo(COM_CHAVE(), HOJE);
    expect(r1).toMatchObject({ avisos_criados: 3, emails_enviados: 2, falhas: [] });
    expect(await notificacoes()).toEqual([
      { user_id: 'u-ana', type: 'prazo_capa', title: 'CAPA vence hoje', message: 'Trocar <b>senhas</b> (prazo 07/10/2026)', link: '/projects/p1/capa' },
      { user_id: 'u-cons', type: 'prazo_auditoria', title: 'Auditoria em 7 dias', message: 'Auditoria interna anual (prazo 14/10/2026)', link: '/projects/p1/audits' },
      { user_id: 'u-cons', type: 'prazo_capa', title: 'CAPA vence hoje', message: 'Trocar <b>senhas</b> (prazo 07/10/2026)', link: '/projects/p1/capa' },
    ]);
    const paraCons = emails.find((e) => e.to[0] === 'cons@ness.lat')!;
    expect(paraCons.subject).toBe('n.iso: 2 prazos para acompanhar');
    expect(paraCons.html).toContain('Trocar &lt;b&gt;senhas&lt;/b&gt;');
    expect(paraCons.html).not.toContain('<b>senhas');
    expect(paraCons.html).toContain('Cliente p1');
    expect(paraCons.html).toContain('14/10/2026');
    expect(emails.find((e) => e.to[0] === 'ana@cliente.com')!.subject).toBe('n.iso: 1 prazo para acompanhar');
    expect((await avisos()).every((a) => a.email_enviado_em)).toBe(true);

    const r2 = await avisosDePrazo(COM_CHAVE(), HOJE);
    expect(r2).toMatchObject({ avisos_criados: 0, emails_enviados: 0 });
    expect(await notificacoes()).toHaveLength(3);
    expect(emails).toHaveLength(2);
  });

  it('e-mail recusado: o sino vale, email_enviado_em fica nulo; o dia seguinte reenvia sem notificação nova', async () => {
    resendOk = false;
    const r1 = await avisosDePrazo(COM_CHAVE(), HOJE);
    expect(r1.emails_enviados).toBe(0);
    expect(r1.falhas.some((f) => f.startsWith('email '))).toBe(true);
    expect(await notificacoes()).toHaveLength(3);
    expect((await avisos()).every((a) => a.email_enviado_em === null)).toBe(true);

    resendOk = true;
    emails = [];
    // Quinta: a CAPA vencida ontem já teve D0 nesta semana, e a auditoria está a 6 dias. Nada novo.
    const r2 = await avisosDePrazo(COM_CHAVE(), '2026-10-08');
    expect(r2).toMatchObject({ avisos_criados: 0, emails_enviados: 2 });
    expect(await notificacoes()).toHaveLength(3);
    expect(emails.find((e) => e.to[0] === 'cons@ness.lat')!.subject).toBe('n.iso: 2 prazos para acompanhar');
    expect((await avisos()).every((a) => a.email_enviado_em)).toBe(true);
  });

  it('sem RESEND_API_KEY: só o sino, nenhum envio e nada marcado como enviado', async () => {
    const r = await avisosDePrazo(SEM_CHAVE(), HOJE);
    expect(r).toMatchObject({ avisos_criados: 3, emails_enviados: 0, falhas: [] });
    expect(emails).toHaveLength(0);
    expect(await notificacoes()).toHaveLength(3);
    expect((await avisos()).every((a) => a.email_enviado_em === null)).toBe(true);
  });

  it('conta desativada não recebe o resumo pendente', async () => {
    await avisosDePrazo(SEM_CHAVE(), HOJE);
    await db().prepare(`UPDATE users SET ativo = 0 WHERE id = 'u-ana'`).run();
    await avisosDePrazo(COM_CHAVE(), '2026-10-08');
    expect(emails.map((e) => e.to[0])).toEqual(['cons@ness.lat']);
  });

  it('falha na marcação de uma pessoa não interrompe as seguintes', async () => {
    let falhou = false;
    const proxy = new Proxy(env.DB, { get(alvo, prop) {
      if (prop === 'prepare') return (sql: string) => {
        if (!falhou && sql.includes('UPDATE avisos_prazo SET email_enviado_em')) { falhou = true; throw new Error('D1 caiu para ana@cliente.com'); }
        return alvo.prepare(sql);
      };
      const v = (alvo as any)[prop]; return typeof v === 'function' ? v.bind(alvo) : v;
    } });
    const r = await avisosDePrazo({ ...COM_CHAVE(), DB: proxy as D1Database }, HOJE);
    expect(r.emails_enviados).toBe(1);
    expect(r.falhas).toEqual(['email u-ana: falha ao marcar o envio']);
    const marcado = (await avisos()).filter((a) => a.email_enviado_em).map((a) => a.user_id);
    expect(marcado).toEqual(['u-cons', 'u-cons']);
  });

  it('falha no batch de um destinatário não pula os demais do item', async () => {
    let falhou = false;
    const proxy = new Proxy(env.DB, { get(alvo, prop) {
      if (prop === 'batch') return async (s: D1PreparedStatement[]) => {
        if (!falhou) { falhou = true; throw new Error('batch caiu'); }
        return alvo.batch(s);
      };
      const v = (alvo as any)[prop]; return typeof v === 'function' ? v.bind(alvo) : v;
    } });
    const r = await avisosDePrazo({ ...SEM_CHAVE(), DB: proxy as D1Database }, HOJE);
    expect(r.avisos_criados).toBe(2); // cap-1 (só 1 dos 2 destinatários) + au-1
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]).toMatch(/^capa cap-1 /);
  });

  it('linha pendente de quem perdeu a designação não gera e-mail para ele', async () => {
    await avisosDePrazo(SEM_CHAVE(), HOJE);
    await db().prepare(`DELETE FROM project_governance`).run();
    await avisosDePrazo(COM_CHAVE(), '2026-10-08');
    expect(emails.map((e) => e.to[0])).toEqual(['ana@cliente.com']);
  });

  it('atraso: o primeiro sai na semana do vencimento se não houve D0; com D0, só na semana seguinte', async () => {
    await db().batch([
      db().prepare(`DELETE FROM corrective_actions`),
      db().prepare(`DELETE FROM audit_schedule`),
      // Venceu na segunda e a rotina não rodou: o atraso sai já nesta semana.
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date) VALUES ('cap-seg', 'p1', 'Segunda', '2026-10-05')`),
      // Vence na terça: D0 na terça; na quarta nada; na segunda seguinte, o atraso da semana 42.
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date) VALUES ('cap-ter', 'p1', 'Terça', '2026-10-06')`),
    ]);
    await avisosDePrazo(SEM_CHAVE(), '2026-10-06');
    await avisosDePrazo(SEM_CHAVE(), HOJE);
    await avisosDePrazo(SEM_CHAVE(), '2026-10-08');
    await avisosDePrazo(SEM_CHAVE(), '2026-10-12');
    const marcos = (await avisos()).filter((a) => a.user_id === 'u-cons').map((a) => `${a.item_id} ${a.marco}`);
    expect(marcos).toEqual([
      'cap-seg atraso-2026-W41', 'cap-seg atraso-2026-W42',
      'cap-ter D0', 'cap-ter atraso-2026-W42',
    ]);
  });

  it('um erro numa fonte vai para falhas e as outras avisam', async () => {
    await db().prepare('DROP TABLE certification_tracking').run();
    const r = await avisosDePrazo(SEM_CHAVE(), HOJE);
    expect(r.avisos_criados).toBe(3);
    expect(r.falhas).toEqual([expect.stringMatching(/^certificado: /)]);
  });
});

describe('scheduled despacha pelo cron', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
  });

  const disparar = async (cron: string) => {
    const pendentes: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { pendentes.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
    worker.scheduled({ cron, scheduledTime: Date.now(), noRetry() {} } as ScheduledController, workerEnv(), ctx);
    await Promise.all(pendentes);
  };

  it('o das 11:00 UTC roda os avisos com o dia de São Paulo; o das 04:10 roda a manutenção e não avisa', async () => {
    await projeto('p1');
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Carla', 'consultor')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Carla', 'cons@ness.lat', 'consultor', 'Consultor')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date) VALUES ('cap-hoje', 'p1', 'Hoje', ?)`).bind(hojeEmSaoPaulo()),
      db().prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES ('velho', 1, ?)`).bind(Math.floor(Date.now() / 1000) - 30 * 86400),
    ]);

    await disparar('10 4 * * *');
    expect(await db().prepare('SELECT count(*) AS n FROM avisos_prazo').first<{ n: number }>()).toEqual({ n: 0 });
    expect(await db().prepare(`SELECT key FROM rate_limits WHERE key = 'velho'`).first()).toBeNull();

    await disparar(CRON_AVISOS);
    expect(await db().prepare(`SELECT item_id, marco FROM avisos_prazo`).all()).toMatchObject({ results: [{ item_id: 'cap-hoje', marco: 'D0' }] });
  });

  it('wrangler.jsonc agenda os dois crons', () => {
    expect(CRON_AVISOS).toBe('0 11 * * *');
    expect(wrangler).toContain('"crons": ["10 4 * * *", "0 11 * * *"]');
  });
});
