import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedMatrizMsp } from './helpers/d1';
import { hidrataEscopo } from '../src/helpers';

describe('hidrataEscopo', () => {
  beforeAll(async () => { await applySchema(); await seedMatrizMsp(); });

  it('preenche a conta de sessão antiga que não a carrega', async () => {
    const user: any = { id: 'u-a-consultor', role: 'consultor' };
    await hidrataEscopo(env.DB, user);
    expect(user.conta_id).toBe('conta-a');
  });

  it('preenche o cliente de usuário de cliente', async () => {
    const user: any = { id: 'u-a1-user', role: 'org_user' };
    await hidrataEscopo(env.DB, user);
    expect(user.cliente_id).toBe('cli-a1');
  });

  it('não consulta o banco quando a sessão já traz o escopo', async () => {
    const user: any = { id: 'u-a-consultor', role: 'consultor', conta_id: 'conta-b', cliente_id: null };
    await hidrataEscopo(env.DB, user);
    // Mantém o que veio da sessão — a função não sobrescreve o que já existe.
    expect(user.conta_id).toBe('conta-b');
  });

  it('não explode com usuário inexistente', async () => {
    const user: any = { id: 'nao-existe', role: 'consultor' };
    await expect(hidrataEscopo(env.DB, user)).resolves.toBeUndefined();
    expect(user.conta_id).toBeUndefined();
  });
});
