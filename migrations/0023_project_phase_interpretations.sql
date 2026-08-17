-- Migration 0023: interpretação da IA por fase, PERSISTIDA (cache).
--
-- Antes, o diagnóstico do PhaseInterpretationAgent era recalculado a cada
-- abertura da fase (custo/latência de IA por visualização, e o resultado
-- evaporava). Agora fica salvo: uma linha por (projeto, fase). `answers_hash`
-- (SHA-256 das respostas) detecta staleness — respostas mudaram → reinterpreta;
-- enquanto isso a última interpretação salva ainda é servida (marcada
-- desatualizada). Aditiva — nenhuma tabela existente é tocada.

CREATE TABLE IF NOT EXISTS project_phase_interpretations (
    project_id TEXT NOT NULL REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    interpretacao TEXT NOT NULL,
    fonte TEXT NOT NULL,
    answers_hash TEXT NOT NULL,
    model TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, phase_number)
);
