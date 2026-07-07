-- Seed inicial dos controles ISO 27001:2022 para o blueprint do nISO

INSERT INTO controls_blueprint (id, category, title, description, baseline_pd) VALUES
-- Cláusulas (Governança e SGSI)
('Cl.4.1', 'Clause', 'Understanding the organization and its context', 'Determinar questões externas e internas relevantes.', 1.5),
('Cl.4.2', 'Clause', 'Understanding the needs and expectations of interested parties', 'Identificar stakeholders e seus requisitos.', 1.0),
('Cl.4.3', 'Clause', 'Determining the scope of the information security management system', 'Definir fronteiras e aplicabilidade do SGSI.', 2.0),
('Cl.5.2', 'Clause', 'Policy', 'Estabelecer a política de segurança da informação.', 1.5),
('Cl.6.1', 'Clause', 'Actions to address risks and opportunities', 'Processo de avaliação e tratamento de riscos.', 3.0),
('Cl.9.2', 'Clause', 'Internal audit', 'Planejar e realizar auditorias internas periódicas.', 4.0),

-- Anexo A - Tema 5: Organizacional (Exemplos)
('A.5.1', 'Organizational', 'Policies for information security', 'Conjunto de diretrizes aprovadas pela direção.', 1.0),
('A.5.7', 'Organizational', 'Threat intelligence', 'Coleta e análise de informações sobre ameaças.', 2.0),
('A.5.9', 'Organizational', 'Inventory of information and other associated assets', 'Identificação e registro de ativos.', 2.5),
('A.5.15', 'Organizational', 'Identity management', 'Ciclo de vida de identidades digitais.', 2.0),
('A.5.23', 'Organizational', 'Information security for use of cloud services', 'Segurança na jornada e uso de nuvem.', 2.5),
('A.5.30', 'Organizational', 'ICT readiness for business continuity', 'Prontidão de TI para desastres e continuidade.', 3.0),

-- Anexo A - Tema 8: Tecnológico (Exemplos críticos)
('A.8.2', 'Technological', 'Privileged access rights', 'Gestão de acessos administrativos e permissões elevadas.', 1.5),
('A.8.8', 'Technological', 'Management of technical vulnerabilities', 'Correção e mitigação de falhas de software/infra.', 3.0),
('A.8.13', 'Technological', 'Information backup', 'Cópias de segurança e verificação de integridade.', 2.0),
('A.8.24', 'Technological', 'Use of cryptography', 'Implementação de cifragem em trânsito e repouso.', 2.5),
('A.8.25', 'Technological', 'Secure development life cycle', 'Security gates no pipeline de desenvolvimento (SSDLC).', 4.0),
('A.8.28', 'Technological', 'Secure coding', 'Práticas e guias de codificação segura.', 3.5),
('A.8.29', 'Technological', 'Security testing in development and acceptance', 'SAST/DAST e testes de aceitação.', 4.0);
