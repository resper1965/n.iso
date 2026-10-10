-- 0060 — n.iso e n.privacy como produtos separados: o projeto NOVO nasce com o que a organização contratou.
--
-- Até aqui o gatilho da 0047 dava `iso` a todo projeto novo, e um cliente só de n.privacy nasceria com um produto que não contratou.
-- Agora o módulo inicial sai de `organizations.modulos_contratados` (padrão `["iso"]`, então nada muda para quem só tem o n.iso);
-- projeto sem organização (ou com contrato vazio) continua com `iso`. Os projetos EXISTENTES não mudam: nenhum ganha `privacy`.
DROP TRIGGER IF EXISTS projeto_modulo_iso_padrao;
CREATE TRIGGER IF NOT EXISTS projeto_modulos_do_contrato AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, j.value, 'sistema' FROM organizations o, json_each(CASE WHEN json_valid(o.modulos_contratados) THEN o.modulos_contratados ELSE '[]' END) j
         WHERE o.id = NEW.org_id AND j.value IN ('iso', 'privacy');
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, 'iso', 'sistema' WHERE NOT EXISTS (SELECT 1 FROM projeto_modulos WHERE project_id = NEW.id);
END;
