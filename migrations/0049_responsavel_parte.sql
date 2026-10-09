-- 0049 — núcleo do n.privacy, fatia 1.3: o responsável em texto ganha uma parte ao lado (spec 4.2).
--
-- Só COLUNAS NOVAS, nulas: nenhuma linha muda. O texto (`owner`, `assigned_to`) fica como está; a parte é
-- ligada depois, por projeto, pela rota de conciliação (`POST /api/v1/projects/:id/partes/conciliar`), que
-- devolve o relatório do que não casou. O dono do ativo não ganha coluna: é um vínculo `responsavel` do item.
-- ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column".
ALTER TABLE risks ADD COLUMN owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE compliance_controls ADD COLUMN owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE ropa_records ADD COLUMN owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE corrective_actions ADD COLUMN assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
ALTER TABLE checklist_progress ADD COLUMN assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL;
