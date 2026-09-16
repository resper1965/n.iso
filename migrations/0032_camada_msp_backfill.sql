-- Migration 0032: povoa a camada MSP com o que já existe.
--
-- Toda a base atual pertence a uma consultoria só, a ness. Este backfill a
-- declara como conta MSP e pendura o que existe nela, SEM ampliar o acesso de
-- ninguém.
--
-- O PASSO QUE NÃO PODE ERRAR é a concessão em `acesso_projeto`: emitir uma linha
-- por usuário que já tinha `client_project_id` mantém o alcance dele EXATAMENTE
-- como era — um projeto, o dele. Ninguém acorda enxergando projeto novo. Visão
-- ampliada só aparece para quem for promovido a `org_admin` depois, de propósito.
--
-- A criação de clientes é 1:1 com `client_name` distinto. Sondagem da produção em
-- 2026-09-16 não encontrou nenhuma colisão de grafia, então não há heurística de
-- dedup aqui. Se colisão aparecer no futuro, a regra é deduplicar por CNPJ —
-- nunca por nome: fundir duas empresas mistura evidência e política, e é
-- irreversível depois que alguém escreve por cima.
--
-- `client_project_id` e `client_name` continuam preenchidas de propósito: são o
-- que torna o rollback uma migration reversa em vez de restauração de backup.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO:
--   SELECT COUNT(*) FROM projects WHERE cliente_id IS NULL;   -- deve ser 0 depois
--   SELECT COUNT(*) FROM users WHERE client_project_id IS NOT NULL;
--   -- o segundo tem de bater com: SELECT COUNT(*) FROM acesso_projeto,
--   -- SALVO usuário cujo client_project_id aponte para projeto inexistente
--   -- (ver guarda mais abaixo — esse usuário fica de fora de propósito).
--   SELECT COUNT(*) FROM users WHERE client_project_id IS NULL
--     AND role NOT IN ('consultor','consultant','auditor','platform_admin');
--   -- Esperado 0. Linha aqui é conta que ja esta orfa no modelo atual e que a
--   -- migration nao alcanca — resolver antes, nao depois.

INSERT OR IGNORE INTO contas (id, tipo, nome, plano, status)
VALUES ('conta-ness', 'msp', 'ness', 'interno', 'Active');

-- Um cliente por client_name distinto. O id é derivado do nome para ser
-- determinístico: rodar a migration duas vezes não duplica.
INSERT OR IGNORE INTO clientes (id, conta_id, nome, cnpj, status)
SELECT
    'cli-' || LOWER(HEX(client_name)),
    'conta-ness',
    client_name,
    MAX(cnpj),
    'Active'
FROM projects
WHERE client_name IS NOT NULL
GROUP BY client_name;

UPDATE projects
SET cliente_id = 'cli-' || LOWER(HEX(client_name))
WHERE cliente_id IS NULL AND client_name IS NOT NULL;

-- Usuário de cliente: herda a empresa do projeto a que estava preso.
UPDATE users
SET cliente_id = (SELECT p.cliente_id FROM projects p WHERE p.id = users.client_project_id)
WHERE client_project_id IS NOT NULL AND cliente_id IS NULL;

-- A CONCESSÃO. Sem esta linha, o usuário comum perde acesso a tudo (fail-closed)
-- ou ganha acesso a mais do que tinha — as duas saídas erradas.
--
-- A guarda `client_project_id IN (SELECT id FROM projects)` existe porque
-- `acesso_projeto.project_id` é FK NOT NULL e `INSERT OR IGNORE` não engole
-- violação de FK (só de UNIQUE) — sem ela, um único usuário travado num
-- projeto que não existe mais aborta a migration inteira no meio do deploy.
-- Semântica escolhida: usuário preso a projeto inexistente NÃO recebe
-- concessão. Ele já não tinha acesso real, porque o projeto não existe.
INSERT OR IGNORE INTO acesso_projeto (user_id, project_id)
SELECT id, client_project_id FROM users
WHERE client_project_id IS NOT NULL
  AND client_project_id IN (SELECT id FROM projects);

-- Staff da ness entra na conta dela. `platform_admin` fica de fora: ele opera o
-- SaaS e é o único papel global que sobra.
UPDATE users
SET conta_id = 'conta-ness'
WHERE conta_id IS NULL
  AND client_project_id IS NULL
  AND role IN ('consultor', 'consultant', 'auditor');

-- O funil comercial acumulado é da ness.
UPDATE leads       SET conta_id = 'conta-ness' WHERE conta_id IS NULL;
UPDATE assessments SET conta_id = 'conta-ness' WHERE conta_id IS NULL;
UPDATE proposals   SET conta_id = 'conta-ness' WHERE conta_id IS NULL;

DROP TABLE IF EXISTS organizations;
