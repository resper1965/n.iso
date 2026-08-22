-- Migration 0025: normaliza evidence.evaluation_status (D2).
--
-- O caminho de IA (/evaluate) grava conforming|partial|non_conforming|pending,
-- mas o wizard de políticas e o doc interno do SGSI gravavam 'conforme' (grafia
-- divergente do mesmo status). Isso é a "caixa inconsistente" reportada. Os três
-- sites já foram corrigidos no código para 'conforming'; aqui normalizamos as
-- linhas existentes. Aditiva, sem mudança de esquema.

UPDATE evidence SET evaluation_status = 'conforming' WHERE evaluation_status = 'conforme';
