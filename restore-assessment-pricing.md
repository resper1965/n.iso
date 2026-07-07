# Restauração do Assessment e Precificação

## Goal
Restaurar a estrutura completa de 92 questões e sincronizar o motor de precificação e nomes de projeto.

## Tasks
- [ ] Task 1: Extrair `BLOCK_QUESTIONS` completo do backup e aplicar em `src/constants.ts` → Verify: `cat src/constants.ts` mostra 10 blocos.
- [ ] Task 2: Sincronizar `SCORE_MAP` em `src/services/pricing.ts` com as novas opções → Verify: `npm run build` sem erros de tipo.
- [ ] Task 3: Atualizar `ASSESSMENT_BLOCKS` no `index.html` → Verify: Abrir assessment-detail mostra todas as questões.
- [ ] Task 4: Corrigir `INSERT INTO projects` no `src/index.ts` para usar `project_name` → Verify: Novos projetos têm nome e cliente separados.
- [ ] Task 5: Validar geração de proposta com o novo pricing → Verify: Botão "Gerar Proposta" abre PDF/HTML com valores coerentes.

## Done When
- [ ] O assessment "Ativu" exibe todas as respostas originais.
- [ ] O projeto "Ativu" exibe "TKM" como cliente e "Ativu" como projeto.
- [ ] A trilha de 41 fases está funcional e visível.
