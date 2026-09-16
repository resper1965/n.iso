-- Migration 0033: normaliza `clientes.cnpj` para dígitos.
--
-- `resolveCliente` (Task 6, src/helpers.ts) limpa a entrada para dígitos antes
-- de comparar E antes de gravar — então todo cliente criado por ELA já nasce
-- normalizado. A assimetria está nas linhas que vieram de outro lugar: o
-- backfill 0032 copiou `MAX(projects.cnpj)` verbatim, e `projects.cnpj` sempre
-- aceitou entrada livre. Uma linha gravada como '11.222.333/0001-81' nunca
-- bate com a busca normalizada de `resolveCliente` (que procura
-- '11222333000181'), então a mesma empresa duplica na primeira vez que
-- alguém cria projeto novo para ela depois desta migration existir.
--
-- REPLACE encadeado sobre ponto, barra e hífen — as três máscaras de CNPJ
-- (00.000.000/0000-00). Idempotente: rodar duas vezes não muda nada, porque a
-- segunda passada não encontra mais os caracteres a remover.
UPDATE clientes
SET cnpj = REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '')
WHERE cnpj IS NOT NULL;

-- Nada de estrutural aqui (`clientes.cnpj` já era TEXT sem CHECK de formato),
-- então não há o que espelhar em schema.sql — é limpeza de dado existente,
-- não mudança de forma.
