# Policy Template Suite Implementation

## Goal
Implementar o motor de geração de rascunhos automáticos do nISO baseado na suíte de 5 políticas mestres ISO 27001:2022.

## Tasks
- [ ] Task 1: Criar diretório `src/templates/policies` e adicionar os 5 arquivos Markdown base com os placeholders estruturados. → Verify: `ls src/templates/policies` lista 5 arquivos.
- [ ] Task 2: Criar `src/services/doc-generator.ts` para realizar o "find & replace" dos placeholders dinamicamente. → Verify: Teste unitário validando a substituição de `[Organization Name]`.
- [ ] Task 3: Enriquecer o `PolicyAgent` para que ele use os templates como base ao ser acionado para esses temas específicos. → Verify: Logs do agente confirmando uso de template local.
- [ ] Task 4: Criar endpoint `POST /api/v1/policies/generate` para entrega do rascunho preenchido. → Verify: Chamada via chat retorna rascunho personalizado.
- [ ] Task 5: Integrar botão de "Gerar Rascunho" na UI do Dashboard para controles específicos. → Verify: Visualização do botão no card do controle A.5.1/A.5.9.

## Done When
- [ ] O nISO é capaz de entregar rascunhos personalizados das 5 políticas principais com base nos dados do Discovery do cliente.

## Notes
* Placeholder mapping:
  - `{{date_modified}}` -> Current ISO Date
  - `[Organization Name]` -> From `organizations` table in D1
  - `{{policy_owner}}` -> From `organizations.metadata` or placeholder
