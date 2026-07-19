-- Seed data para Governança do Projeto cliente
INSERT INTO project_governance (id, project_id, name, email, role_category, job_title, is_primary) VALUES
('gov-cliente-01', 'mr9c1qugo16zic2eko', 'Ricardo Esper', 'admin@exemplo.com.br', 'consultor', 'Consultor', 1),
('gov-cliente-02', 'mr9c1qugo16zic2eko', 'Consultor B', 'pessoa@exemplo.com.br', 'consultor', 'Consultor', 0),
('gov-cliente-03', 'mr9c1qugo16zic2eko', 'Consultor C', 'pessoa@exemplo.com.br', 'consultor', 'Consultor', 0),
('gov-cliente-04', 'mr9c1qugo16zic2eko', 'Executivo do Cliente', 'pessoa@exemplo.com.br', 'executivo', 'CEO', 0),
('gov-cliente-05', 'mr9c1qugo16zic2eko', 'Consultor D', 'pessoa@exemplo.com.br', 'executivo', 'CFO (Finanças)', 0),
('gov-cliente-06', 'mr9c1qugo16zic2eko', 'Consultor A', 'pessoa@exemplo.com.br', 'tech', 'CTO (Tech / Infra)', 0),
('gov-cliente-07', 'mr9c1qugo16zic2eko', 'Pessoa G', 'pessoa@exemplo.com.br', 'tech', 'CPO (Produto)', 0),
('gov-cliente-08', 'mr9c1qugo16zic2eko', 'Consultor E', 'pessoa@exemplo.com.br', 'tech', 'Equipe Técnica', 0),
('gov-cliente-09', 'mr9c1qugo16zic2eko', 'Pessoa F', 'pessoa@exemplo.com.br', 'operacoes', 'COO (Operações / RH)', 0),
('gov-cliente-10', 'mr9c1qugo16zic2eko', 'CISO do Cliente', 'pessoa@exemplo.com.br', 'operacoes', 'CIO (Identidade & Seg)', 0);
