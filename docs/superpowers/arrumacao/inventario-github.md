# Inventário de higiene — resper1965/n.iso (2026-10-06, somente leitura)

> Nome do cliente trocado por `<cliente>` ao entrar na `main` (2026-10-06). Levantamento somente leitura daquele dia; o estado atual pode ter mudado.

## 0. Segredos / arquivos sensíveis versionados (repo PÚBLICO)
- Nenhum segredo aparente: sem sk-/ghp_/github_pat_/AKIA/xox/-----BEGIN PRIVATE KEY no conteúdo versionado; nenhum .env, .dev.vars, .pem, .key, dump ou backup *.sql no histórico (git log --diff-filter=A). `backups/` só tem .gitignore e README.
- Chave pública Ed25519 em wrangler.jsonc:195 e docs/export-public-key.json (pública, ok).
- test/projects-token-encryption.test.ts:29 casou o padrão "token=" (fixture de teste; conferir que o valor é fictício).
- ATENÇÃO (dado de cliente, não segredo): migrations/0011_seed_twyn_governance.sql (e-mails @<cliente>.com x7, @ness.io x5, @ness.com x3), seed_<cliente>.sql, seed_<cliente>_full.sql (66 KB), scratch/seed_<cliente>_phases.js, scratch/gen_<cliente>_monitoring.js, scratch/extracted_checklist.sql, scratch/update_checklist_progress.sql, scratch/ness_labs_onboarding.ts. Avaliar se "<cliente>" é cliente real: dado de cliente em repo público. Pasta scratch/ inteira é candidata a remoção.
- debug.log e .impeccable/ NÃO versionados (só soltos no checkout; debug.log não está no .gitignore).
- Maior arquivo versionado: worker-configuration.d.ts (537 KB). Nada > 1 MB. 602 arquivos rastreados.
- Dependabot: 30 alertas de segurança abertos (gh api dependabot/alerts). Secret scanning: 0 alertas.

## 1. Branches remotas (após fetch --prune; 13 além da main). Nenhuma está mergeada na main (git branch -r --merged = só main; o repo faz squash-merge, então "ahead" não indica trabalho vivo).
| Branch | Último commit | À frente de main | PR | Classe |
|---|---|---|---|---|
| chore/inventario-2026-09-16 | 16/09 | 1 | sem | INVESTIGAR (STATE.md; provável apagar) |
| claude/avaliacao-niso-tprm-igs1m1 | 17/09 | 1 | #189 ABERTO (20 dias) | INVESTIGAR/fechar: nome claude/* viola regra de atribuição de IA se o repo é público |
| dependabot/npm_and_yarn/typescript-7.0.2 | 06/10 | 1 | #277 ABERTO | MANTER (CI falhando? major 5.9->7.0, avaliar) |
| docs/acesso-stakeholders | 06/10 | 5 | sem | MANTER (worktree niso-stakeholders, trabalho vivo) |
| docs/receita-agentes-mcp-remoto | 29/09 | 2 | sem | MANTER (checkout principal) |
| feat/agente-mcp-remoto | 29/09 | 15 | sem | INVESTIGAR (provável squash-mergeado; local é "gone" -> apagar) |
| feat/autoridade | 04/10 | 17 | sem | INVESTIGAR (tem -main duplicada) |
| feat/autoridade-main | 05/10 | 9 | sem | INVESTIGAR (duplicata; recria de main) |
| feat/camada-msp | 17/09 | 38 | sem | INVESTIGAR (MSP não publicado; ver memória: 38 commits MSP) |
| feat/ciencia-link | 04/10 | 14 | sem | INVESTIGAR |
| feat/prova-auditor | 05/10 | 24 | sem | INVESTIGAR |
| feat/prova-auditor-main | 05/10 | 17 | sem | INVESTIGAR (duplicata) |
| fix/refs-entre-projetos | 06/10 | 10 | #283 ABERTO | MANTER |
Já apagadas pelo prune (eram remotas): chore/oauth-kv-ids, chore/zod-4-6, feat/conectar-agente-layout, feat/papel-comercial, feat/stakeholder-papel, feat/trocar-senha, fix/agente-gap-traceability, etc. (delete_branch_on_merge=true funciona).
Sugestão: APAGAR candidatas após confirmar por `gh pr list --state all --head <br>` que há PR mergeado/fechado: feat/agente-mcp-remoto, feat/autoridade(-main), feat/prova-auditor(-main), feat/ciencia-link, chore/inventario-2026-09-16. feat/camada-msp NÃO apagar sem decisão (trabalho MSP).

## 2. PRs e issues abertos
- #283 fix(isolamento) — 06/10, vivo.
- #277 dependabot typescript 5.9.3 -> 7.0.2 — 06/10; salto de major, revisar/fechar se CI falha.
- #189 docs avaliação TPRM (branch claude/*) — 17/09, 20 dias, obsoleto provável.
- Issues abertas: 0.

## 3. Worktrees (git worktree list)
- niso-bloco2 (fix/dpia-status-e-colunas): ALTERAÇÃO NÃO COMMITADA — M docs/openapi.json, src/openapi.ts, src/routes/governance.ts, src/routes/projects.ts, src/schemas/domain.ts, test/entrevistas-resumo.test.ts; ?? test/colunas-catraca.test.ts. NÃO REMOVER. Upstream aponta para fix/refs-entre-projetos (ahead 1, behind 3).
- niso-zod (chore/zod-4-6): M src/openapi.ts (não commitado). Remota apagada ("gone") -> branch já mergeada; só remover após decidir sobre a mudança.
- niso-sh1 (feat/stakeholder-papel): limpo; remota "gone" -> REMOVÍVEL.
- niso-refs (fix/refs-entre-projetos): limpo; PR #283 aberto -> manter.
- niso-stakeholders (docs/acesso-stakeholders): limpo; vivo (é este relatório).

## 4. Stashes e branches locais
- stash@{0}: WIP on main sobre 83ff1b5 (PR #32, observabilidade); stash@{1}: WIP sobre 3a63b50 (re-auth de assinatura). Ambos antigos (PRs #32 ou anteriores, hoje estamos em #283) -> provável lixo, inspecionar com `git stash show -p` antes de dropar.
- Locais com remota "gone" (apagáveis, squash-merge): chore/oauth-kv-ids, chore/zod-4-6 (worktree), feat/conectar-agente-layout, feat/papel-comercial, feat/stakeholder-papel (worktree), feat/trocar-senha, fix/agente-gap-traceability, fix/comercial-so-interno, fix/email-remetente-nome-niso, fix/governanca-designacao-consultor, fix/nome-cliente-vazio, fix/sessao-primeiro-acesso.
- Locais sem remota: docs/camada-msp, feat/autoridade, feat/autoridade-main, feat/prova-auditor, feat/prova-auditor-main(2), feat/onda2-f3, fix/tela-conectar-agente (checar se têm commits únicos: `git cherry origin/main <br>`).
- main LOCAL: ahead 38, behind 70 (commits MSP não publicados, igual feat/camada-msp 1f7b109). NÃO resetar sem salvar.

## 5. Checkout principal
Branch docs/receita-agentes-mcp-remoto (limpa em relação à remota). Soltos: M .vscode/settings.json; ?? .impeccable/; ?? debug.log; ?? docs/superpowers/plans/2026-10-01-entrega-final.md.

## 6. Configuração do repo
- visibility public; default main; delete_branch_on_merge true; wiki e projects habilitados (sem uso aparente -> desabilitar).
- description: "Sistema agêntico de GRC para ISO 27001/27701 — ..."; homepage https://n-iso.ness.com.br (CONFERIR: AGENTS.md cita niso.ness.com.br); topics: 12 definidos.
- Ruleset "main protegida" (id 20312002) ativo: deletion, non_fast_forward, pull_request, required_status_checks.
- Environment: production. Secrets de repo: CLOUDFLARE_API_TOKEN (03/08/2026). Secrets do env production: nenhum listado (o AGENTS.md diz que o token é environment secret; na realidade está como secret de REPOSITÓRIO -> divergência, qualquer job o enxerga).
- Deploy keys: nenhuma. Webhooks: nenhum.
- Labels: bug, documentation, duplicate, enhancement, good first issue, help wanted, invalid, question, wontfix, deploy-failure, uptime, slo.
- dependabot.yml existe; CODEOWNERS e templates existem.
- Workflows: ci, codeql, db-backup, db-migrate, deploy, schema-drift, slo, uptime. Últimas execuções: Backup D1 success; CodeQL success (repo público, ok; AGENTS.md diz que foi removido -> doc desatualizada); Deploy success; CI success em push, failure em 2 PRs (06/10 10:38 e 07:26 — checar se é o #283/#277); "Sonda externa de produção" (uptime) falhou 06/10 08:34, voltou a success depois (intermitente, ver issue label uptime: 0 abertas).
- Nota: docs/acesso-stakeholders cita bloqueio por cobrança do GitHub Actions; hoje as execuções rodam.

## 7. Regra 6 / atribuição
Nenhum "Co-Authored-By"/"Generated with" encontrado fora de docs/superpowers (git grep). Branch claude/avaliacao-niso-tprm-igs1m1 e PR #189 têm prefixo claude/.
