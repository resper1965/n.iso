-- Proposta comercial (spec do sistema de propostas, seções 4 e 5). Cada revisão
-- é uma linha: mesmo numero, revisao + 1. O documento gerado é congelado.
CREATE TABLE IF NOT EXISTS propostas (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    lead_id TEXT REFERENCES leads(id),
    assessment_id TEXT REFERENCES assessments(id),
    numero TEXT,
    revisao INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_aprovacao', 'gerada', 'enviada', 'visualizada', 'aceita', 'recusada', 'expirada', 'substituida')),
    cliente TEXT NOT NULL,
    validade_dias INTEGER NOT NULL DEFAULT 30,
    pagamento TEXT NOT NULL DEFAULT '40/30/30',
    contexto TEXT NOT NULL DEFAULT '',
    escopo TEXT NOT NULL DEFAULT '',
    observacoes TEXT NOT NULL DEFAULT '',
    -- Seções de texto reescritas nesta proposta: JSON {secaoId: texto}. Ver documento-proposta.ts.
    secoes_editadas TEXT,
    consultor_email TEXT,
    total_projeto REAL NOT NULL DEFAULT 0,
    mensalidade REAL NOT NULL DEFAULT 0,
    memoria TEXT,
    margem TEXT,
    desconto_aprovado_por TEXT,
    desconto_aprovado_em DATETIME,
    documento_conteudo TEXT,
    documento_html TEXT,
    documento_hash TEXT,
    gerada_em DATETIME,
    valida_ate DATE,
    criada_por TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_numero ON propostas(org_id, numero, revisao);
CREATE INDEX IF NOT EXISTS idx_propostas_org ON propostas(org_id, status);

CREATE TABLE IF NOT EXISTS proposta_itens (
    id TEXT PRIMARY KEY,
    proposta_id TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    servico_id TEXT,
    servico TEXT NOT NULL,
    dias REAL,
    meses INTEGER,
    valor_base REAL NOT NULL DEFAULT 0,
    desconto_pct REAL NOT NULL DEFAULT 0,
    valor REAL NOT NULL DEFAULT 0,
    texto_cliente TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_proposta_itens ON proposta_itens(proposta_id, ordem);

-- Termos iniciais da ness. (prévia aprovada em 02/10/2026). Não sobrescreve termos já preenchidos.
UPDATE organizations SET textos = '{"sobre":"A ness. é uma consultoria de segurança da informação e privacidade. Implementa sistemas de gestão de segurança e de privacidade até a certificação, com método próprio e com o trabalho registrado no n.iso, onde o cliente acompanha cada controle, evidência e decisão.","comoTrabalhamos":"## Como trabalhamos\n\nO projeto segue o ciclo de melhoria contínua da própria norma: planejar o sistema, implementá-lo, verificar se funciona e corrigir o que não funciona. Cada fase termina com uma entrega aprovada pela empresa, e nenhuma começa sem que a anterior tenha critério de aceite cumprido.\n\n## Princípios\n\n- O sistema é da empresa, não da consultoria. Documentos são escritos com as áreas e na linguagem delas, para serem usados depois.\n- Evidência desde o primeiro dia. Tudo o que é feito fica registrado no n.iso, onde o auditor encontra o que precisa.\n- Quem implementa não audita. A auditoria interna é conduzida por auditor que não participou da implementação (cláusula 9.2).\n- Proporcionalidade. Controles na medida do risco, sem burocracia que a empresa não consiga manter.\n\n## Ritmo e comunicação\n\n- Reunião de acompanhamento, semanal, 1 h, com o ponto focal e o líder do projeto: andamento, bloqueios, próximas tarefas.\n- Oficinas temáticas, conforme a fase, com as áreas envolvidas: riscos, processos, privacidade, controles.\n- Comitê do projeto, mensal, 1 h, com a direção e o líder do projeto: decisões, aceite de riscos, aprovações.\n- Relatório de status, quinzenal, para o ponto focal e a direção: situação por fase, riscos do projeto.\n\n## O n.iso no projeto\n\nA empresa recebe acesso ao n.iso durante todo o projeto. Ali ficam o escopo, os riscos, a Declaração de Aplicabilidade, as políticas, as evidências por controle, o ROPA e os DPIAs. As aprovações da direção são registradas com data e responsável, e a trilha de auditoria guarda quem fez o quê.","premissas":"- A empresa designa um ponto focal com autoridade para decidir e com pelo menos 30% do tempo dedicado ao projeto.\n- A direção participa do comitê mensal e das aprovações nos marcos previstos.\n- As áreas cumprem os prazos de resposta combinados, de até cinco dias úteis por pedido.\n- O escopo aprovado em F1 não muda de forma relevante durante o projeto.\n- As correções técnicas apontadas pelo diagnóstico são executadas pela equipe da empresa ou por terceiros contratados por ela.","termos":"## Obrigações da ness.\n\n- Executar os serviços descritos com a equipe e a qualificação apresentadas.\n- Cumprir o cronograma, salvo atrasos causados por premissas não atendidas.\n- Manter sigilo sobre toda informação da contratante a que tiver acesso.\n- Comunicar por escrito qualquer fato que ameace prazo, escopo ou qualidade.\n\n## Obrigações da contratante\n\n- Disponibilizar pessoas, informações e acessos necessários nos prazos combinados.\n- Aprovar ou rejeitar entregas em até cinco dias úteis, com justificativa.\n- Executar as correções técnicas sob sua responsabilidade.\n- Contratar o organismo certificador e pagar as taxas correspondentes.\n- Efetuar os pagamentos nas datas acordadas.\n\n## Propriedade das entregas\n\nOs documentos produzidos para a contratante passam a pertencer a ela após o pagamento correspondente. Metodologias, modelos e ferramentas da ness. continuam de sua propriedade, com licença de uso perpétua para a contratante no escopo do sistema de gestão.\n\n## Confidencialidade\n\nAs partes mantêm em sigilo as informações trocadas durante a negociação e a execução, por todo o contrato e por cinco anos após o seu término. Não se aplica a informações públicas, já conhecidas pela parte receptora ou cuja divulgação seja exigida por lei ou ordem judicial.\n\n## Proteção de dados pessoais\n\nNa execução dos serviços, a ness. atua como operadora dos dados pessoais a que tiver acesso, tratando-os apenas conforme as instruções da contratante e para a finalidade deste contrato, nos termos da LGPD.\n\n- Medidas de segurança técnicas e administrativas compatíveis com a natureza dos dados.\n- Comunicação de incidente de segurança à contratante em até 48 horas da ciência.\n- Suboperadores, incluindo o n.iso, apenas com informação prévia à contratante.\n- Devolução ou eliminação dos dados ao fim do contrato, com confirmação por escrito.\n\n## Vigência\n\nO contrato vigora da assinatura até a conclusão da fase F7 ou até 30 semanas, o que ocorrer primeiro, podendo ser prorrogado por aditivo.\n\n## Rescisão\n\nQualquer parte pode rescindir mediante aviso por escrito com 30 dias de antecedência. Os serviços prestados até a data da rescisão são devidos proporcionalmente. Em caso de descumprimento não sanado em 15 dias após notificação, a rescisão é imediata.\n\nSe a contratante encerrar o contrato com a consultoria, os registros do projeto no n.iso podem ser transferidos para uma conta própria da contratante, mediante contratação direta.\n\n## Foro\n\nFica eleito o foro da comarca de São Paulo (SP) para dirimir questões oriundas deste contrato, com renúncia a qualquer outro.","pagamentoPadrao":"40/30/30"}'
WHERE id = 'org_ness' AND (textos IS NULL OR textos = '' OR json_extract(textos, '$.termos') IS NULL OR json_extract(textos, '$.termos') = '');
