-- 0043 — o pedido também é prova (acesso de stakeholders, fatia 5).
-- O conteúdo congelado, o hash e a identidade do documento (tipo, ref_id, papel exigido) nunca
-- mudam: correção é pedido novo. Pedido fechado (status <> 'aberto') não muda de status nem de
-- substituto. `org_id` fica livre: a transferência de projeto entre organizações o atualiza.
-- DELETE não é bloqueado: apagar o projeto apaga os pedidos em cascata.
CREATE TRIGGER IF NOT EXISTS pedido_prova_imutavel
BEFORE UPDATE ON pedidos
WHEN NEW.hash IS NOT OLD.hash
  OR NEW.conteudo_json IS NOT OLD.conteudo_json
  OR NEW.tipo IS NOT OLD.tipo
  OR NEW.ref_id IS NOT OLD.ref_id
  OR NEW.papel_exigido IS NOT OLD.papel_exigido
  OR (OLD.status <> 'aberto' AND (NEW.status IS NOT OLD.status OR NEW.substituido_por IS NOT OLD.substituido_por))
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido e imutavel');
END;
