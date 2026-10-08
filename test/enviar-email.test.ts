import { describe, it, expect, afterEach, vi } from 'vitest';
import { enviarEmail, sendEmail } from '../src/helpers';

/** `enviarEmail` só precisa do env: é o que o cron tem. `sendEmail(c)` é o invólucro das rotas. */
describe('enviarEmail', () => {
  const pedidos: { auth: string; corpo: Record<string, unknown> }[] = [];
  const resend = (status: number) => vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push({ auth: String((init?.headers as Record<string, string>).Authorization), corpo: JSON.parse(String(init?.body)) });
    return new Response(status === 200 ? '{}' : 'erro', { status });
  }) as typeof fetch);
  afterEach(() => { vi.restoreAllMocks(); pedidos.length = 0; });

  it('posta no Resend com a chave do env e o remetente padrão; devolve o ok do provedor', async () => {
    resend(200);
    expect(await enviarEmail({ RESEND_API_KEY: 'k1' }, 'a@b.com', 'Assunto', '<p>x</p>')).toBe(true);
    expect(pedidos[0]).toEqual({ auth: 'Bearer k1', corpo: { from: 'n.iso <noreply@ness.com.br>', to: ['a@b.com'], subject: 'Assunto', html: '<p>x</p>' } });
  });

  it('recusa do provedor devolve false', async () => {
    resend(500);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await enviarEmail({ RESEND_API_KEY: 'k1' }, 'a@b.com', 'Assunto', '<p>x</p>')).toBe(false);
  });

  it('recusa do provedor: o log leva o status, nunca o corpo da resposta nem o endereço', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () => new Response('{"name":"validation_error","message":"o endereço a@b.com é inválido"}', { status: 422 })) as typeof fetch);
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await enviarEmail({ RESEND_API_KEY: 'k1' }, 'a@b.com', 'Assunto', '<p>x</p>')).toBe(false);
    const saida = erro.mock.calls.flat().join(' ');
    expect(saida).toContain('422');
    expect(saida).toContain('validation_error');
    expect(saida).not.toContain('a@b.com');
  });

  it('simulação sem chave não loga o endereço', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await enviarEmail({}, 'a@b.com', 'Assunto', '<p>x</p>')).toBe(true);
    expect(log.mock.calls.flat().join(' ')).not.toContain('a@b.com');
  });

  it('sendEmail(c) delega com c.env', async () => {
    resend(200);
    expect(await sendEmail({ env: { RESEND_API_KEY: 'k2' } }, 'c@d.com', 'S', '<p>y</p>', { replyTo: 'r@x.com' })).toBe(true);
    expect(pedidos[0].auth).toBe('Bearer k2');
    expect(pedidos[0].corpo).toMatchObject({ to: ['c@d.com'], reply_to: 'r@x.com' });
  });
});
