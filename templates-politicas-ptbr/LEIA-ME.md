# Suíte de templates em pt-BR

Tradução dos templates de `src/templates/policies/v2022/` do repositório `resper1965/nISO`.
Motivo: os originais estão em inglês, enquanto toda a interface do produto é pt-BR — o consultor
gera política em inglês para cliente brasileiro.

## O que mudou

- Conteúdo traduzido e desenvolvido onde o original era esquemático (uma linha por seção).
- **Estrutura normalizada.** Os originais tinham dois formatos: uns com bloco de identificação
  (`# [Organization Name] - Título` + linha de `Document ID`), outros começando em
  `# POLICY 2: ...` sem identificação nenhuma. Todos aqui seguem o primeiro formato.
- Numeração de seções contínua e tabela de controle de versões em todos.

## Placeholders — preservados de propósito

O `PolicyGeneratorService` substitui estes tokens; eles precisam continuar existindo,
exatamente assim:

| Token | Vira |
| --- | --- |
| `[Organization Name]` | nome da organização |
| `{{policy_owner}}` | dono da política |
| `{{approver}}` | aprovador |
| `{{status}}` | Rascunho / Final / Aprovada |
| `{{date_modified}}` | data da geração |
| `{{next_review_date}}` | data da próxima revisão |

Os campos entre `[colchetes]` que não são `[Organization Name]` são lacunas para o consultor
preencher, não tokens do gerador.

## Mudança necessária no código

`src/services/policy-generator.ts` injeta o ID do documento procurando a string **em inglês**:

```ts
'Document ID: [^|]+': `Document ID: ${dynamicDocId} `,
```

Com os templates em pt-BR, a chave precisa virar:

```ts
'Identificação: [^|]+': `Identificação: ${dynamicDocId} `,
```

O outro padrão (`POL-[A-Z]+-[0-9]+`) continua funcionando: os IDs seguem o mesmo formato.

Sem essa troca, o ID dinâmico deixa de ser injetado e o documento sai com o ID fixo do template.

## Traduzidos — 24 de 24

**Políticas e normas:** isms-policy · pims-privacy-policy · risk-policy · access-control-policy ·
asset-policy · supplier-policy · secure-development-policy · bcp-policy · sdlc-standard

**Documentos do sistema de gestão:** isms-scope · soa-template (os 93 controles do Anexo A:2022
nomeados um a um) · risk-treatment-plan · disaster-recovery-plan · training-plan ·
performance-dashboard

**Procedimentos:** internal-audit-procedure

**Registros:** management-review-minutes · asset-inventory · risk-register · incident-log ·
data-inventory-ropa · vendor-risk-assessment

**Privacidade:** privacy-notice · dpia-template

## Correções feitas durante a tradução

Além do idioma, quatro coisas nos originais não sobreviveriam a uma auditoria ou ao design system:

1. **Edição da norma errada.** `pims-privacy-policy` citava a ISO 27701:2019. A plataforma atende
   a **27701:2025**, que é o que o próprio repo instancia em `src/routes/projects.ts`.
2. **Nome de fornecedor real no template.** `asset-inventory` e `data-inventory-ropa` traziam
   nomes de provedores de nuvem e de repositório como se fossem conteúdo do modelo. Viraram
   lacunas — o inventário é do cliente, não nosso.
3. **Emoji como dado.** `performance-dashboard` usava círculos coloridos para indicar situação.
   O design system proíbe emoji; a situação agora é palavra ("Dentro da meta", "Fora da meta"),
   que também funciona em leitor de tela e em impressão preto e branco.
4. **Prazo de resposta ao titular ausente.** `privacy-notice` não dizia prazo nenhum. Agora traz
   o do art. 19 da LGPD: formato simplificado de imediato, declaração completa em até 15 dias.

Também acrescentei o que faltava para servir como evidência: seção de aprovação e controle de
versões onde não havia, vínculo entre risco e controle do Anexo A, regra de comunicação de
incidente com dado pessoal (art. 48 da LGPD) e prazo de reavaliação de fornecedor.
