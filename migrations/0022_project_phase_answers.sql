-- Migration 0022: questionário por fase da jornada (respostas).
--
-- Religa à jornada o questionário rico que se perdeu numa refatoração: as
-- respostas do consultor por fase passam a ser persistidas (antes viviam só no
-- estado do frontend, `S.jornadaAnswers`, e se perdiam). Aditiva — nenhuma
-- tabela existente é tocada.

CREATE TABLE IF NOT EXISTS project_phase_answers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    answer TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, phase_number, question_key)
);
