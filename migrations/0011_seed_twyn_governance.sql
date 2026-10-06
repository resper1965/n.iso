-- Migration 0011 — conteúdo removido em 2026-10-06.
--
-- Esta migration semeava a matriz de Governança de um projeto de cliente, com nomes
-- e e-mails de pessoas reais. Ela já foi aplicada em produção (o nome do arquivo
-- está registrado em d1_migrations, por isso o arquivo continua aqui e não pode
-- ser renomeado). O repositório é público: o dado saiu, e banco novo não recebe
-- dado de cliente. Nenhum teste dependia dele (test/sem-dado-de-cliente.test.ts
-- impede a volta).
SELECT 1;
