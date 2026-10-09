# Núcleo do n.privacy, fatia 8 — visões do encarregado, evidência com validade e casca

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md`, seções 4.7 (evidência), 4.9 (efeitos), 6 (lacunas) e 9 (fatia 8). Depende das fatias 2 a 7. Plano mestre: `2026-10-09-nprivacy-plano-mestre-fatias-2-a-8.md`.

**Goal:** o encarregado abre uma tela e vê, por projeto, tudo o que está atrasado ou faltando (pedidos do titular, incidentes, tratamentos sem avaliação, terceiros vencidos, documentos a revisar, artigos da LGPD sem cobertura); a evidência passa a ter validade e a poder servir a um requisito, e a que vence volta a pendente; o menu agrupa o n.privacy.

## Decisões de desenho (rulings)

1. **A visão do encarregado é consulta, não tabela nova.** `GET /projects/:id/encarregado` monta, em uma chamada, contagens e as listas mais urgentes lendo as tabelas das fatias anteriores; nada é gravado. Cada bloco traz o que fazer e a tela de destino. Bloco sem dado (ex.: catálogo da LGPD ainda não carregado) aparece como "não carregado", sem número inventado.
2. **Evidência com validade (spec 4.7):** `evidence.valido_ate` anulável (migration 0059) e `evidencia_requisitos (evidencia_id, requisito_id, project_id)`. Uma evidência pode servir a um requisito sem controle ISO. A rota é nova e fica no router de requisitos, **sem tocar** nos fluxos de upload, avaliação e assinatura de `evidence.ts`.
3. **Vencimento da evidência (spec 4.9):** a rotina diária de avisos (08:00) faz, antes de avisar, `evaluation_status = 'pending'` nas evidências com `valido_ate` anterior a hoje que não estejam pendentes, com uma linha na trilha por evidência. **A assinatura gravada não é apagada** (ela atesta o conteúdo; o que venceu é a avaliação). Nova fonte de aviso `evidencia` (D-7/D0/atraso) enquanto a evidência não é reavaliada com validade nova.
4. **A cobertura da LGPD passa a contar evidência:** requisito é **coberto** por evidência ligada com `evaluation_status = 'conforming'` e validade em dia (ou sem validade); **parcial** com `partial`. Documento vigente e controle por mapeamento validado continuam como na fatia 2.
5. **Casca n.privacy: só o que a spec e as decisões do dono sustentam.** O menu lateral ganha um grupo "n.privacy" (Encarregado, Requisitos, Terceiros, Titular e incidentes) com a marca no estilo do produto (nome em minúsculo, ponto em destaque). **Não** há bloqueio por módulo no frontend nesta fatia: a gestão de módulos existe só na API e esconder a tela deixaria o trabalho inalcançável. A casca visual própria (identidade, página de entrada) exige uma decisão de design do dono e fica como gap declarado.

## Global Constraints

- Migration aditiva: `ALTER ADD COLUMN` anulável e `CREATE TABLE IF NOT EXISTS`. Backup antes; aplicar pelo terminal antes do merge.
- Tabela nova com `project_id`; banco real nos testes; sem dado real de cliente.
- A visão só lê; o agente lê. Marca: `n.privacy` com o ponto em destaque, sem emoji, sem itálico.
- Commits com `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com"`; sem trailer de coautoria.

## Review Focus

- Evidência de outro projeto nunca é ligada a requisito nem ganha validade (404/400).
- Evidência vencida volta a pendente **uma vez** (rodar a rotina duas vezes não duplica trilha) e não perde a assinatura.
- Cobertura da LGPD: evidência vencida ou `non_conforming` não cobre.
- A visão do encarregado não vaza dado de outro projeto e funciona com todas as tabelas vazias.

## Tasks

### 8.1 Evidência com validade e requisito

- [ ] Migration 0059 + teste; `schema.sql`.
- [ ] Rotas `GET/PUT /projects/:id/evidence/:eid/requisitos` e `PUT .../validade`; `lacunasDaFonte` conta evidência.
- [ ] `vencerEvidencias` na rotina diária + fonte `evidencia` nos avisos; testes.

### 8.2 Visão do encarregado

- [ ] `src/services/encarregado.ts` e `GET /projects/:id/encarregado`; teste de cada bloco e de isolamento.
- [ ] Tela Encarregado.

### 8.3 Casca e fechamento

- [ ] Grupo "n.privacy" no menu; docs (AGENTS, README, CHANGELOG, migrations/README); `npm run openapi`; suítes e build.

## Rollout

Backup → `wrangler d1 migrations apply niso-db --remote` → `PRAGMA` da coluna e da tabela e `count(*)` → merge → `/health`.

## Gaps declarados

- Casca visual própria do n.privacy (identidade e página de entrada) e bloqueio por módulo no frontend: dependem de decisão de design do dono.
- A visão do encarregado não notifica por e-mail (os avisos de prazo já cobrem os vencimentos).
