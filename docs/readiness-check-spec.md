# Spec — Diagnóstico de Prontidão ("gap em voo") no nISO

> **Status:** proposta para aprovação (spec-only, sem código ainda).
> **Escopo:** feature self-service DENTRO do nISO que dá ao cliente um raio-x
> rápido do próprio ISMS: documentos obrigatórios faltando, documentos
> inconsistentes e controles sem evidência.

## O que é (e o que NÃO é)

- **É** um **auto-diagnóstico de prontidão** — a plataforma olhando o próprio
  estado e apontando lacunas, na hora.
- **NÃO é auditoria.** Auditoria independente (ISO 27001 §9.2) é do agente
  externo **Aegis-Auditor**, que lê o nISO via MCP com credencial read-only.
  Esta feature não substitui aquilo — prepara o cliente para ela.
- **NÃO emite parecer de certificação.** Rótulo em toda a UI e no payload:
  "auto-diagnóstico de prontidão".

### Guarda-rails (invioláveis)
- Documento/evidência ausente = **gap declarado**. Nunca "completar", supor ou
  dar como conforme sem lastro.
- Read-only: o diagnóstico **não altera** nenhum dado do projeto.
- A camada de IA **cita a evidência** que sustenta cada observação; sem
  evidência, é gap, não achado de IA.

## Onde vive

- **Backend:** nova rota em `src/routes/` (ex.: `readiness.ts`), montada no app.
- **Frontend:** botão **"Diagnóstico de prontidão"** na view `compliance.js`
  (e atalho na `project.js`), abrindo um painel com o resultado.
- **IA (fase 2):** novo agente `ReadinessAgent extends BaseAgent`
  (`src/agents/readiness.ts`), no mesmo padrão de `AssessmentAgent`.

## Endpoint

`GET /api/v1/projects/:id/readiness-check`

- Auth: sessão autenticada com acesso ao projeto (mesmo escopo das demais rotas
  de projeto; honra `client_project_id`).
- Sem corpo. Opcional `?ai=1` para incluir a camada de IA (fase 2).
- Resposta `200`:

```jsonc
{
  "generated_at": "2026-08-09T12:00:00Z",
  "project_id": "proj_...",
  "rotulo": "Auto-diagnóstico de prontidão (não é auditoria nem parecer de certificação)",
  "resumo": { "critico": 3, "alto": 5, "medio": 2, "total": 10 },
  "achados": [
    {
      "categoria": "doc_faltante | doc_inconsistente | evidencia_faltante",
      "severidade": "critico | alto | medio",
      "requisito": "Cláusula 6.1.3 d) — SoA",   // referência, em nossas palavras
      "referencia": "control_id ou nome do documento",
      "descricao": "Frase objetiva do gap."
    }
  ],
  "ai_observacoes": []   // preenchido só com ?ai=1 (fase 2), cada item cita evidência
}
```

## Camada 1 — determinística (SQL, o coração)

Barata, confiável, **sem alucinação**. Regras sobre as tabelas reais:

| # | Categoria | Regra (dados reais) | Severidade |
|---|---|---|---|
| 1 | evidencia_faltante | `compliance_controls` com `status` em ('Implemented','Compliant'…) **sem** linha em `evidence` (`control_id`) | alto |
| 2 | doc_inconsistente | controle com `ciso_approved_by` ou `ceo_approved_by` preenchido **e sem** evidência | **crítico** (assinou sem lastro) |
| 3 | doc_inconsistente | `status='Missing'` porém `maturity>0` (diz que não tem, mas marca maturidade) | médio |
| 4 | evidencia_faltante | `evidence.evaluation_status` pendente/rejeitada em controle aplicável | alto |
| 5 | doc_faltante | documento obrigatório do checklist (abaixo) sem correspondente em `policy_versions`/controle | **crítico** ou alto |
| 6 | doc_inconsistente | controle aplicável (SoA `status != 'Not Applicable'`) sem justificativa/lastro | alto |

### Checklist de documentos obrigatórios (ISO 27001:2022 — títulos/estrutura, em nossas palavras)
Escopo do SGSI (4.3); Política de Segurança da Informação (5.2); processo de
avaliação e tratamento de risco (6.1.2–6.1.3); Declaração de Aplicabilidade
(6.1.3 d); Plano de Tratamento de Riscos (6.1.3 e / 6.2); objetivos de segurança
(6.2); evidência de competência (7.2); resultados da avaliação de riscos (8.2);
resultados do tratamento de riscos (8.3); resultados de monitoramento/medição
(9.1); programa e resultados de auditoria interna (9.2); resultados da análise
crítica pela direção (9.3); não-conformidades e ações corretivas (10.2). Mais os
documentos dos controles **aplicáveis** do Anexo A conforme a SoA.

> Onde o nISO ainda não tiver como verificar um item automaticamente, o achado
> sai como **"não verificável automaticamente — conferir manualmente"**, nunca
> como "conforme".

## Camada 2 — IA (fase 2, opcional `?ai=1`)

`ReadinessAgent` (reusa `BaseAgent`, como o `AssessmentAgent`): recebe o estado
consolidado + o conhecimento da skill `iso27001` no prompt, e aponta
**inconsistências de conteúdo** que a query não pega (ex.: escopo não cobre um
ativo citado na RoPA; duas políticas se contradizem). Cada observação **cita** o
documento/controle que a sustenta. É seção separada no payload
(`ai_observacoes`), claramente marcada como "assistida por IA — revisar".

**Modelo:** `@cf/meta/llama-3.3-70b-instruct` (Workers AI), roteado pelo AI
Gateway já configurado (`AI_GATEWAY_URL` / gateway `n-iso`) — bem mais capaz que
o `llama-3.1-8b` do `AssessmentAgent`, sem sair da Cloudflare. Parâmetros de
aterramento obrigatórios: **temperatura baixa** (~0.2), **chunking** do conteúdo
grande do ISMS, e prompt que **exige citação** da evidência em cada observação
(sem citação, vira gap da camada determinística, não achado de IA). Como a F2 é
sob demanda (`?ai=1`), o custo do modelo maior fica contido.

## UI

- Botão **"Diagnóstico de prontidão"** no topo da `compliance.js`.
- Painel com: selo do rótulo, contador de severidade, e os achados agrupados por
  categoria (doc faltante / doc inconsistente / evidência faltante), cada um com
  requisito, referência e descrição.
- Botão **"Exportar"** (liga ao trabalho futuro do *book* para stakeholders).

## Não-objetivos

- Não é auditoria independente nem parecer de certificação.
- Não escreve/gera documento (isso é do implantador / Aegis-Consultor).
- Não altera dados do projeto.

## Fases de entrega

1. **F1** — camada determinística + endpoint + painel na UI + testes (worker
   para as regras; Playwright para o botão/painel).
2. **F2** — camada de IA (`ReadinessAgent`) sob `?ai=1`.
3. **F3** — export do resultado (ponte para o "book" de stakeholders).

## Verificação (definição de pronto de cada fase)

- Testes de worker cobrindo cada regra determinística (com e sem o gap).
- E2E Playwright: botão dispara, painel renderiza, severidades corretas.
- Nenhuma regressão nas suítes existentes; cobertura não regride.
