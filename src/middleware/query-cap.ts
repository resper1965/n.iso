import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { MAX_PAGE_SIZE } from '../helpers';

/**
 * Teto automático de linhas em SELECT.
 *
 * 63 das 67 listagens não tinham LIMIT nenhum. Num projeto com milhares de
 * evidências, `SELECT * FROM evidence WHERE project_id = ?` carrega tudo na
 * memória do worker e estoura o limite de CPU antes de responder — e o cliente
 * não fez nada de errado, só cresceu.
 *
 * ponytail: em vez de editar 63 handlers (e esquecer o 64º na próxima feature),
 * o teto entra uma vez, no `prepare`, por onde todas as consultas passam.
 * A regra é deliberadamente conservadora — só mexe no que é inequivocamente
 * um SELECT sem LIMIT:
 *
 *   - statement precisa começar com SELECT (ignorando espaço e comentário);
 *   - não pode conter a palavra LIMIT em lugar nenhum (inclusive subconsulta);
 *   - não pode ser CTE (WITH), UNION ou terminar em ponto e vírgula.
 *
 * Na dúvida, não mexe. O custo de deixar passar é uma consulta sem teto; o de
 * reescrever errado é resultado incorreto — e resultado incorreto num sistema
 * de conformidade vira relatório errado para auditor.
 *
 * Teto de MAX_PAGE_SIZE. Handler que precisa de mais usa `listPaged` com
 * `?limit`/`?offset` explícitos, e aí já tem LIMIT — este middleware não toca.
 */

/** Comentários e espaço à esquerda não devem impedir o reconhecimento do SELECT. */
function limpaInicio(sql: string): string {
  return sql.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, '').trimStart();
}

export function precisaDeTeto(sql: string): boolean {
  const s = limpaInicio(sql);
  if (!/^select\b/i.test(s)) return false;
  if (/\blimit\b/i.test(s)) return false;
  if (/\bunion\b/i.test(s)) return false;
  if (s.trimEnd().endsWith(';')) return false;
  return true;
}

export function aplicaTeto(sql: string, max = MAX_PAGE_SIZE): string {
  return precisaDeTeto(sql) ? `${sql} LIMIT ${max}` : sql;
}

/** Envolve o D1 para aplicar o teto em todo `prepare`. */
export function comTeto(db: D1Database, max = MAX_PAGE_SIZE): D1Database {
  return new Proxy(db, {
    get(alvo, prop, receptor) {
      if (prop === 'prepare') {
        return (sql: string) => alvo.prepare(aplicaTeto(sql, max));
      }
      const v = Reflect.get(alvo, prop, receptor);
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  });
}

export const queryCapMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  if (c.env?.DB) {
    (c.env as any).DB = comTeto(c.env.DB);
  }
  await next();
});
