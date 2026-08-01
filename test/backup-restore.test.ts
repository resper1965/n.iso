import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';

/**
 * Restauração de backup.
 *
 * O runbook de backup existia; a restauração nunca tinha sido exercida. Backup
 * que ninguém restaurou não é backup — é um arquivo. E o modo de falha típico
 * não é o dump vir corrompido: é o dump não APLICAR, por causa de trigger,
 * constraint ou ordem de statement.
 *
 * Este teste reproduz o caminho do runbook: aplica o schema, popula, gera um
 * dump no formato que o `wrangler d1 export` produz, e reaplica num banco do
 * zero conferindo que os dados voltaram.
 */

/** Gera INSERTs no estilo do dump do wrangler, para as tabelas informadas. */
async function dumpDados(tabelas: string[]): Promise<string> {
  const linhas: string[] = [];
  for (const t of tabelas) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all<any>();
    for (const linha of results || []) {
      const colunas = Object.keys(linha);
      const valores = colunas.map(c => {
        const v = linha[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      linhas.push(`INSERT INTO ${t} (${colunas.join(',')}) VALUES (${valores.join(',')});`);
    }
  }
  return linhas.join('\n');
}

describe('Restauração de backup', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente Um','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u1','a@b.c','salt:hash','A','platform_admin')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c1','p1','ISO 27001:2022','Controle','Approved')`),
      env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES ('l1','teste','a@b.c','detalhe','p1')`),
      // Apóstrofo no dado é o clássico que quebra dump mal escapado.
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p2','O''Brien & Cia','ISO 27001','controller','Active')`),
    ]);
  });

  it('o schema.sql aplica num banco vazio sem erro', async () => {
    // Se isto falhar, não existe restauração possível: o passo 1 do runbook é
    // recriar a estrutura. Já quebrou uma vez, por índice antes da tabela.
    const linhas = await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").first<any>();
    expect(linhas.n).toBeGreaterThan(30);
  });

  it('o dump reaplica e os dados voltam idênticos', async () => {
    const tabelas = ['projects', 'users', 'compliance_controls', 'audit_logs'];
    const dump = await dumpDados(tabelas);
    expect(dump).toContain('INSERT INTO projects');

    // Simula o banco de destino: limpa e restaura.
    // audit_logs tem trigger que bloqueia DELETE — ver o teste seguinte.
    for (const t of ['compliance_controls', 'users', 'projects']) {
      await env.DB.prepare(`DELETE FROM ${t}`).run();
    }
    expect((await env.DB.prepare('SELECT count(*) AS n FROM projects').first<any>()).n).toBe(0);

    await execSql(dump.split('\n').filter(l => !l.startsWith('INSERT INTO audit_logs')).join('\n'));

    const projetos = await env.DB.prepare('SELECT id, client_name FROM projects ORDER BY id').all<any>();
    expect(projetos.results.map((p: any) => p.id)).toEqual(['p1', 'p2']);
    // Apóstrofo preservado: escape correto no dump.
    expect(projetos.results[1].client_name).toBe("O'Brien & Cia");

    const ctrl = await env.DB.prepare("SELECT status FROM compliance_controls WHERE id='c1'").first<any>();
    expect(ctrl.status).toBe('Approved');
  });

  it('ACHADO: o trigger append-only impede restaurar audit_logs por cima', async () => {
    // A migration 0018 tornou audit_logs imutável (append-only) — correto para
    // a trilha. Consequência que ninguém tinha exercitado: uma restauração
    // sobre um banco que JÁ tem trilha não consegue limpar a tabela antes.
    //
    // Não é bug: é o controle funcionando. Mas precisa estar no runbook, senão
    // a descoberta acontece durante o incidente. Este teste existe para que a
    // restrição fique documentada e testada, não para ser "corrigida".
    let bloqueou = false;
    try {
      await env.DB.prepare('DELETE FROM audit_logs').run();
    } catch {
      bloqueou = true;
    }
    expect(bloqueou).toBe(true);

    // O INSERT continua livre — restaurar num banco VAZIO funciona.
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, details) VALUES ('l2','restaurado','sistema','ok')`
    ).run();
    const n = await env.DB.prepare("SELECT count(*) AS n FROM audit_logs WHERE id='l2'").first<any>();
    expect(n.n).toBe(1);
  });

  it('restaurar duas vezes falha em vez de duplicar silenciosamente', async () => {
    // Chave primária protege contra reaplicar o mesmo dump por engano. É
    // preferível o erro barulhento à trilha duplicada.
    let falhou = false;
    try {
      await env.DB.prepare(
        `INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p1','Cliente Um','ISO 27001','controller','Active')`
      ).run();
    } catch {
      falhou = true;
    }
    expect(falhou).toBe(true);
  });
});
