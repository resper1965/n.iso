# Acesso de stakeholders e ciência de documentos — desenho

Data: 2026-10-04. Estado: partes 1 a 3 aprovadas pelo dono do produto; partes 4 e 5 são **proposta padrão**, a revisar.

## Problema

Pessoas da empresa cliente (diretoria, DPO, líderes) precisam **consultar** e **aprovar** documentos no n.iso, e a empresa precisa de **ciência** (prova de leitura) de política por muita gente, inclusive quem não terá conta.

## Decisões já tomadas

- Dois canais, por tipo de pessoa: **conta** (poucos, aprovam) e **link com código** (muitos, só dão ciência).
- Stakeholder com conta vê **só o que foi atribuído a ele**.
- A prova registra **qual versão foi lida** (hash SHA-256 do conteúdo congelado).
- MFA **opcional**; quando usado, fica registrado na prova.

## Parte 1 — Papel e convite (aprovada)

- Novo papel `stakeholder`, mínimo privilégio, com allow-list de caminhos: "Meus pedidos", perfil, senha, MFA. Nada mais.
- Convite nasce da linha da matriz de Governança ("Convidar para o n.iso"), reaproveitando o e-mail de boas-vindas existente. O vínculo é por `client_project_id`, como os demais papéis de cliente.
- "Revogar acesso" na mesma linha: desativa a conta e encerra sessões.

## Parte 2 — Pedidos (aprovada)

- Tabela `pedidos` (um pedido por documento/ação) e `pedido_destinatarios` (uma linha por pessoa).
- Ao criar, o conteúdo é **congelado** (snapshot + SHA-256).
- Aprovar dispara a rota de aprovação já existente; a senha continua exigida; MFA é opcional e gravado.
- Se o documento muda depois, o pedido vira `substituido` e um novo é aberto. Nunca se aprova texto diferente do lido.

## Parte 3 — Ciência em massa (aprovada)

- Estende o portal `/politicas` (OTP de 6 dígitos por e-mail já existe em `src/routes/public.ts`).
- Administrador escolhe documento + lista de e-mails; cada pessoa recebe link pessoal (token CSPRNG, só o SHA-256 guardado, como nas propostas).
- A ciência grava o hash da versão lida. Documento alterado invalida a ciência anterior; o painel mostra "ciente da v2, falta a v3".
- Painel: lido / pendente / não abriu; reenvio de lembrete só aos pendentes.
- Quem tem conta vê o mesmo pedido em "Meus pedidos"; a prova registra o canal (conta ou link).

## Parte 4 — Quem pede e quem aprova (PROPOSTA)

- **Pedir:** `org_admin` do projeto, consultor designado e `consultoria_admin` da org. Stakeholder nunca pede.
- **Aprovar:** só quem está **designado na matriz de Governança do projeto** e cujo cargo cobre o papel exigido, reaproveitando `autoridadeDeAssinatura` e `recusaDeAssinatura` (`src/helpers.ts`). Falha fechado: sem designação, sem aprovação.
- Segregação mantida: Líder SGSI não assina como Direção; `platform_admin` não aprova nada por cliente.
- Cada pedido declara o papel exigido (`ciso`, `ceo` ou `ciente`). Para `ciente` basta estar na lista de destinatários.

## Parte 5 — Segurança e prova (PROPOSTA)

- Prova por destinatário: quem (nome, e-mail), quando, IP, user-agent, hash lido, canal, MFA usado sim/não.
- Prova imutável: sem UPDATE/DELETE de ciência concluída; correção = novo registro.
- Rotas públicas: `rateLimitD1`, resposta uniforme "Link inválido ou expirado", token só no corpo, nunca na query.
- Isolamento: `pedidos` carrega `org_id` e `project_id`; entra no teste de contrato `contrato-isolamento-org`.
- Auditor lê a prova pelo caminho de auditor já existente (somente leitura).

## Fora de escopo agora

Lembrete automático por prazo, relatório PDF para auditor, listas reaproveitáveis de destinatários, assinatura ICP-Brasil.

## Riscos

- Papel novo no allow-list de caminhos: erro aqui abre acesso demais. Teste de varredura por rota × papel é obrigatório (padrão `contrato-isolamento-org`).
- Reuso do portal `/politicas`: hoje ele grava ciência sem hash; a migração precisa manter as linhas antigas legíveis (coluna nova nula = "versão não registrada").
