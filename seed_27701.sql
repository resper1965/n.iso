-- Seed dos controles ISO 27701:2026 (Privacidade/SGPI) para o blueprint do nISO
-- Extraído do Anexo A (normativo) da ABNT NBR ISO/IEC 27701:2026

INSERT INTO controls_blueprint (id, category, title, description, baseline_pd) VALUES
-- Cláusulas do SGPI (Integração com ISO 27001)
('27701.Cl.4.1', 'Clause', 'Contexto da Organização (Privacidade)', 'Entendimento da organização, contexto e mudanças climáticas sob a ótica de DP.', 1.0),
('27701.Cl.5.2', 'Clause', 'Política de Privacidade', 'Estabelecer e manter a política de privacidade da informação.', 1.5),
('27701.Cl.6.1.2', 'Clause', 'Avaliação de Riscos de Privacidade', 'Processo para identificar e avaliar riscos ao titular de dados.', 2.5),

-- Anexo A - Condições para coleta e tratamento (Controladores)
('A.1.2.2', 'Privacy Control', 'Identificação e documentação do propósito', 'Documentar os propósitos específicos para tratamento de DP.', 1.0),
('A.1.2.3', 'Privacy Control', 'Identificação de bases legais', 'Determinar e demonstrar compliance com a base legal (ex: LGPD).', 1.5),
('A.1.2.4', 'Privacy Control', 'Determinação do consentimento', 'Processo para demonstrar se e como o consentimento foi obtido.', 2.0),
('A.1.2.6', 'Privacy Control', 'Avaliação de impacto de privacidade (DPIA)', 'Realizar avaliação de impacto sempre que houver novos tratamentos.', 3.0),
('A.1.2.7', 'Privacy Control', 'Contratos com operadores de DP', 'Garantir contratos escritos com operadores incluindo controles do Anexo A.', 1.5),

-- Anexo A - Obrigações com os titulares de DP
('A.1.3.4', 'Privacy Control', 'Fornecimento de informações aos titulares', 'Informações claras e acessíveis sobre o controlador e o tratamento.', 1.5),
('A.1.3.5', 'Privacy Control', 'Mecanismo para retirar consentimento', 'Oferecer meios para o titular modificar ou retirar o consentimento.', 2.0),
('A.1.3.7', 'Privacy Control', 'Acesso, correção ou exclusão', 'Mecanismos para o titular exercer seus direitos fundamentais.', 2.5),
('A.1.3.11', 'Privacy Control', 'Tomada de decisão automatizada', 'Capacidade de demonstrar compliance em decisões sem intervenção humana.', 3.0),

-- Anexo A - Privacidade por Design e por Default
('A.1.4.2', 'Privacy Control', 'Limitação da coleta', 'Coletar apenas o mínimo necessário para o propósito identificado.', 1.5),
('A.1.4.5', 'Privacy Control', 'Objetivos de minimização de DP', 'Uso de técnicas como desidentificação para reduzir riscos.', 2.0),
('A.1.4.8', 'Privacy Control', 'Retenção', 'Não reter DP por período superior ao necessário.', 2.0),

-- Anexo A - Compartilhamento e Transferência
('A.1.5.2', 'Privacy Control', 'Bases para transferências internacionais', 'Documentar a base legal para envio de dados para fora da jurisdição.', 2.5);
