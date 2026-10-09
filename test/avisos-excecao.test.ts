import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { itensDoDia, tituloDoAviso } from '../src/services/avisos-prazo';

/** Vencimento de exceção a documento (fatia 3.5): fonte `excecao` da rotina diária. HOJE é uma quarta, semana ISO 2026-W41. */
const HOJE = '2026-10-07';
const db = () => env.DB;

const exc = (id: string, vence: string, status = 'ativa') =>
  db().prepare(`INSERT INTO documento_excecoes (id, project_id, documento_id, escopo, motivo, vence_em, status) VALUES (?, 'p1', 'doc1', 'Equipe X', 'Motivo', ?, ?)`)
    .bind(id, vence, status);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO partes (id, project_id, nome, email) VALUES ('pa1', 'p1', 'Ana Exemplo', 'ana@exemplo.com.br')`),
    db().prepare(`INSERT INTO documentos (id, project_id, titulo, dono_parte_id) VALUES ('doc1', 'p1', 'Política de Acesso', 'pa1')`),
  ]);
});

describe('fonte excecao', () => {
  it('exceção ativa com vencimento em 7 dias, hoje ou vencida entra com o marco certo; longe não', async () => {
    await db().batch([exc('d7', '2026-10-14'), exc('d0', '2026-10-07'), exc('atr', '2026-10-01'), exc('longe', '2026-10-20')]);
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(falhas).toEqual([]);
    expect(Object.fromEntries(itens.filter((i) => i.fonte === 'excecao').map((i) => [i.item_id, i.marco]))).toEqual({
      d7: 'D-7', d0: 'D0', atr: 'atraso-2026-W41',
    });
  });

  it('revogada não avisa; o responsável é o dono do documento; o título cita o documento', async () => {
    await db().batch([exc('viva', HOJE), exc('morta', HOJE, 'revogada')]);
    const { itens } = await itensDoDia(db(), HOJE);
    const daFonte = itens.filter((i) => i.fonte === 'excecao');
    expect(daFonte.map((i) => i.item_id)).toEqual(['viva']);
    expect(daFonte[0]).toMatchObject({ project_id: 'p1', responsavel: 'ana@exemplo.com.br', titulo: 'Exceção a Política de Acesso', vence_em: HOJE });
  });

  it('prorrogar o prazo tira o item do dia', async () => {
    await exc('prorroga', '2026-10-01').run();
    expect((await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'excecao')).toHaveLength(1);
    await db().prepare(`UPDATE documento_excecoes SET vence_em = '2027-01-31' WHERE id = 'prorroga'`).run();
    expect((await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'excecao')).toHaveLength(0);
  });

  it('o título do sino fala da exceção e do documento', () => {
    const item = { fonte: 'excecao' as const, titulo: 'Exceção a Política de Acesso' };
    expect(tituloDoAviso({ ...item, marco: 'D-7' })).toBe('Exceção a Política de Acesso vence em 7 dias');
    expect(tituloDoAviso({ ...item, marco: 'D0' })).toBe('Exceção a Política de Acesso vence hoje');
    expect(tituloDoAviso({ ...item, marco: 'atraso-2026-W41' })).toBe('Exceção a Política de Acesso com prazo vencido');
  });
});
