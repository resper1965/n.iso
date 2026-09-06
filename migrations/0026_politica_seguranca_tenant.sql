-- Migration 0026: política de segurança POR TENANT (item 4.3 do
-- enterprise-grade-plan.md).
--
-- O produto tem hoje uma única postura de segurança para todos os clientes: MFA
-- é opcional para qualquer um, a sessão dura o mesmo tempo para qualquer um, e
-- não há restrição de origem. Cliente com exigência regulatória própria — banco,
-- saúde, setor público — não tem como apertar sem que a plataforma inteira
-- aperte junto.
--
-- ADITIVA, e SEM efeito por si só. Tenant sem linha aqui continua exatamente
-- como está hoje: a ausência de política significa "sem restrição adicional",
-- nunca "restrição padrão". Aplicar um default apertado numa migration
-- trancaria clientes para fora no deploy seguinte.
--
-- O QUE CONFERIR ANTES DE APLICAR EM PRODUÇÃO: nada além do de sempre (backup).
-- A tabela nasce vazia e nenhum caminho de código muda de comportamento
-- enquanto ela estiver assim.

CREATE TABLE IF NOT EXISTS project_security_policy (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),

    -- Exige segundo fator para as contas DESTE cliente. As rotas de
    -- auto-serviço de MFA seguem alcançáveis mesmo com a política ativa — sem
    -- isso, ligar a exigência trancaria todo mundo para fora antes de qualquer
    -- um conseguir configurar o fator.
    mfa_obrigatorio INTEGER NOT NULL DEFAULT 0,

    -- Vida da sessão, em segundos. NULL = o padrão da plataforma.
    -- O teto de 24h do produto continua valendo como MÁXIMO: a política aperta,
    -- nunca afrouxa.
    sessao_ttl_seg INTEGER,

    -- Lista de origens permitidas, separada por vírgula. Aceita IP exato
    -- (`203.0.113.7`) e prefixo CIDR (`203.0.113.0/24`). Vazia ou NULL = sem
    -- restrição de origem.
    ip_allowlist TEXT,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
);
