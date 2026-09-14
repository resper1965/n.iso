// Política de tentativas de login do caminho de CONTA LOCAL: erro genérico,
// desafio anti-abuso a partir da 2ª tentativa, bloqueio de 15 min na 5ª e
// expiração por inatividade. Um teste por regra.
//
// O caminho federado (SSO/SLO) fica de fora de propósito: lá senha e segundo
// fator são do provedor do cliente, e nada disto se aplica.
import { describe, it, expect } from 'vitest';
import {
  decisaoLogin,
  mensagemCredencialInvalida,
  mensagemBloqueio,
  expirouPorInatividade,
  limiteInatividadeSeg,
  FALHAS_ATE_BLOQUEIO,
  BLOQUEIO_SEG,
  INATIVIDADE_CLIENTE_SEG,
  INATIVIDADE_CONSULTOR_SEG,
} from '../src/auth-policy';

describe('regra: a mensagem de credencial nunca diz qual campo errou', () => {
  it('fala de e-mail OU senha, nunca de um dos dois', () => {
    const m = mensagemCredencialInvalida(3);
    expect(m).toContain('E-mail ou senha incorretos');
    // Se algum dia alguém "melhorar" a mensagem, estes são os vazamentos.
    expect(m).not.toMatch(/não (existe|encontrad|cadastrad)/i);
    expect(m).not.toMatch(/senha (incorreta|errada|inválida)\b/i);
    expect(m).not.toMatch(/usuário (não|inexistente)/i);
  });

  it('informa quantas tentativas restam, com plural por palavra inteira', () => {
    expect(mensagemCredencialInvalida(4)).toContain('Restam 4 tentativas');
    expect(mensagemCredencialInvalida(2)).toContain('Restam 2 tentativas');
    expect(mensagemCredencialInvalida(1)).toContain('Resta 1 tentativa');
  });

  it('não desce abaixo de zero', () => {
    expect(mensagemCredencialInvalida(-3)).toContain('Restam 0 tentativas');
  });

  it('o bloqueio também não revela se a conta existe', () => {
    const m = mensagemBloqueio();
    expect(m).toContain(`${BLOQUEIO_SEG / 60} minutos`);
    expect(m).not.toMatch(/conta|e-mail|usuário/i);
  });
});

describe('regra: desafio anti-abuso a partir da 2ª tentativa', () => {
  it('a 1ª tentativa (zero falhas) não pede desafio', () => {
    expect(decisaoLogin(0, true).exigeDesafio).toBe(false);
  });

  it('depois da 1ª falha, toda tentativa pede desafio', () => {
    expect(decisaoLogin(1, true).exigeDesafio).toBe(true);
    expect(decisaoLogin(2, true).exigeDesafio).toBe(true);
    expect(decisaoLogin(4, true).exigeDesafio).toBe(true);
  });

  // Pedir na tela um desafio que o servidor não sabe conferir é teatro:
  // atrapalha quem é legítimo e não custa nada a quem automatiza.
  it('sem segredo configurado, o desafio não é exigido nem anunciado', () => {
    expect(decisaoLogin(1, false).exigeDesafio).toBe(false);
    expect(decisaoLogin(4, false).exigeDesafio).toBe(false);
  });

  it('mas o bloqueio continua valendo sem o segredo — é ele que segura a força bruta', () => {
    expect(decisaoLogin(FALHAS_ATE_BLOQUEIO, false).bloqueado).toBe(true);
  });
});

describe('regra: bloqueio temporário na 5ª falha', () => {
  it('não bloqueia antes da quinta', () => {
    for (let i = 0; i < FALHAS_ATE_BLOQUEIO; i++) {
      expect(decisaoLogin(i, true).bloqueado).toBe(false);
    }
  });

  it('bloqueia na quinta e daí em diante', () => {
    expect(decisaoLogin(FALHAS_ATE_BLOQUEIO, true).bloqueado).toBe(true);
    expect(decisaoLogin(FALHAS_ATE_BLOQUEIO + 7, true).bloqueado).toBe(true);
  });

  it('o bloqueio dura 15 minutos', () => {
    expect(BLOQUEIO_SEG).toBe(15 * 60);
  });

  it('a contagem regressiva bate com as falhas', () => {
    expect(decisaoLogin(0, true).tentativasRestantes).toBe(5);
    expect(decisaoLogin(3, true).tentativasRestantes).toBe(2);
    expect(decisaoLogin(4, true).tentativasRestantes).toBe(1);
    expect(decisaoLogin(9, true).tentativasRestantes).toBe(0);
  });

  it('contagem corrompida no KV não vira bloqueio nem passe livre', () => {
    expect(decisaoLogin(NaN, true)).toEqual({ bloqueado: false, exigeDesafio: false, tentativasRestantes: 5 });
    expect(decisaoLogin(-5, true).bloqueado).toBe(false);
    expect(decisaoLogin(2.7, true).tentativasRestantes).toBe(3);
  });
});

describe('regra: expiração por inatividade', () => {
  const agora = 1_800_000_000_000;

  it('papel de Cliente expira em 30 min; consultor, em 8 h', () => {
    expect(limiteInatividadeSeg('client')).toBe(INATIVIDADE_CLIENTE_SEG);
    expect(limiteInatividadeSeg('org_user')).toBe(INATIVIDADE_CLIENTE_SEG);
    expect(limiteInatividadeSeg('org_admin')).toBe(INATIVIDADE_CLIENTE_SEG);
    expect(limiteInatividadeSeg('consultor')).toBe(INATIVIDADE_CONSULTOR_SEG);
    expect(limiteInatividadeSeg('platform_admin')).toBe(INATIVIDADE_CONSULTOR_SEG);
  });

  it('cliente parado 29 min segue dentro; 31 min, fora', () => {
    expect(expirouPorInatividade(agora, agora - 29 * 60_000, 'client')).toBe(false);
    expect(expirouPorInatividade(agora, agora - 31 * 60_000, 'client')).toBe(true);
  });

  it('consultor parado 7 h segue dentro; 9 h, fora', () => {
    expect(expirouPorInatividade(agora, agora - 7 * 3_600_000, 'consultor')).toBe(false);
    expect(expirouPorInatividade(agora, agora - 9 * 3_600_000, 'consultor')).toBe(true);
  });

  it('a mesma parada de 2 h derruba o cliente e não o consultor', () => {
    const duasHoras = agora - 2 * 3_600_000;
    expect(expirouPorInatividade(agora, duasHoras, 'client')).toBe(true);
    expect(expirouPorInatividade(agora, duasHoras, 'consultor')).toBe(false);
  });

  it('papel desconhecido cai no limite de consultor, não em sessão eterna', () => {
    expect(limiteInatividadeSeg(undefined)).toBe(INATIVIDADE_CONSULTOR_SEG);
    expect(expirouPorInatividade(agora, agora - 9 * 3_600_000, undefined)).toBe(true);
  });

  // Sessão cuja idade não dá para provar não é sessão que se renova sozinha.
  it('sessão sem marca de último acesso expira', () => {
    expect(expirouPorInatividade(agora, undefined, 'consultor')).toBe(true);
    expect(expirouPorInatividade(agora, NaN, 'consultor')).toBe(true);
    expect(expirouPorInatividade(agora, 0, 'consultor')).toBe(true);
  });
});
