import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { itensDoDia, tituloDoAviso } from '../src/services/avisos-prazo';

/**
 * Revisão vencida de documento (fatia 3.4): fonte `documento` da rotina diária de avisos. D1 real; a data é simulada
 * pelo parâmetro `hoje`. HOJE é uma quarta-feira, semana ISO 2026-W41.
 */
const HOJE = '2026-10-07';
const db = () => env.DB;

const documento = (id: string, p: { revisar_ate?: string | null; status?: string; titulo?: string; dono?: string | null } = {}) =>
  db().prepare(`INSERT INTO documentos (id, project_id, titulo, status, revisar_ate, dono_parte_id) VALUES (?, 'p1', ?, ?, ?, ?)`)
    .bind(id, p.titulo ?? `Documento ${id}`, p.status ?? 'vigente', p.revisar_ate === undefined ? HOJE : p.revisar_ate, p.dono ?? null);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).run();
});

describe('fonte documento', () => {
  it('vigente com revisão em 7 dias, hoje ou vencida entra com o marco certo; a data longe não', async () => {
    await db().batch([
      documento('d7', { revisar_ate: '2026-10-14' }),
      documento('d0', { revisar_ate: '2026-10-07' }),
      documento('atr', { revisar_ate: '2026-10-01' }),
      documento('longe', { revisar_ate: '2026-10-20' }),
    ]);
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(falhas).toEqual([]);
    expect(Object.fromEntries(itens.filter((i) => i.fonte === 'documento').map((i) => [i.item_id, i.marco]))).toEqual({
      d7: 'D-7', d0: 'D0', atr: 'atraso-2026-W41',
    });
  });

  it('só vigente com data: rascunho, obsoleto e sem data ficam de fora', async () => {
    await db().batch([
      documento('rasc', { status: 'rascunho' }),
      documento('obs', { status: 'obsoleto' }),
      documento('sem-data', { revisar_ate: null }),
      documento('ok'),
    ]);
    const { itens } = await itensDoDia(db(), HOJE);
    expect(itens.filter((i) => i.fonte === 'documento').map((i) => i.item_id)).toEqual(['ok']);
  });

  it('o responsável é o e-mail da parte dona (senão o nome), e título e projeto vêm do documento', async () => {
    await db().batch([
      db().prepare(`INSERT INTO partes (id, project_id, nome, email) VALUES ('pa1', 'p1', 'Ana Exemplo', 'ana@exemplo.com.br')`),
      db().prepare(`INSERT INTO partes (id, project_id, nome) VALUES ('pa2', 'p1', 'Beto Exemplo')`),
      documento('com-email', { dono: 'pa1', titulo: 'Política de Acesso' }),
      documento('so-nome', { dono: 'pa2' }),
      documento('sem-dono'),
    ]);
    const { itens } = await itensDoDia(db(), HOJE);
    const por = Object.fromEntries(itens.filter((i) => i.fonte === 'documento').map((i) => [i.item_id, i]));
    expect(por['com-email']).toMatchObject({ project_id: 'p1', titulo: 'Política de Acesso', responsavel: 'ana@exemplo.com.br', vence_em: HOJE });
    expect(por['so-nome'].responsavel).toBe('Beto Exemplo');
    expect(por['sem-dono'].responsavel).toBeNull();
  });

  it('marcar como revisado (a data anda) tira o item', async () => {
    await documento('rev', { revisar_ate: '2026-10-01' }).run();
    expect((await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'documento')).toHaveLength(1);
    await db().prepare(`UPDATE documentos SET revisar_ate = '2027-10-01' WHERE id = 'rev'`).run();
    expect((await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'documento')).toHaveLength(0);
  });

  it('o título do sino fala de documento', () => {
    expect(tituloDoAviso({ fonte: 'documento', marco: 'D0', titulo: 'Política de Acesso' })).toBe('Documento Política de Acesso precisa de revisão');
    expect(tituloDoAviso({ fonte: 'documento', marco: 'D-7', titulo: 'Política de Acesso' })).toBe('Documento Política de Acesso precisa de revisão em 7 dias');
  });
});
