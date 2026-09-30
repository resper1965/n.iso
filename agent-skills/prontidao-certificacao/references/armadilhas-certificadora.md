# Armadilhas recorrentes na certificação

Achados que o auditor da certificadora costuma encontrar. Severidade típica é ponto de partida: aplicar o critério de `SKILL.md` (≥3 itens do mesmo requisito = sistêmico = NC maior).

| # | Armadilha | Sintoma | Como verificar | Severidade típica |
|---|---|---|---|---|
| 1 | SoA × ferramenta divergentes | Controle "Sim" na SoA e "Não Aplicável" na n.iso (ou o inverso); estado de implementação diferente | Comparar a SoA local com os controles do snapshot, **um a um, sem amostragem** | NC menor por item; NC maior se ≥3 divergências (6.1.3 d) |
| 2 | Risco sem vínculo a controle | Risco tratado por "mitigar" sem controle associado, ou controle na SoA sem risco que o justifique | Rastrear risco → controle → documento → evidência (`niso_traceability`) | NC menor; NC maior se sistêmico (6.1.3, 8.3) |
| 3 | Aprovação sem data ou por papel indevido | Documento sem data de aprovação, aprovado por quem o redigiu ou por papel sem autoridade | Conferir cabeçalho/controle de versão de cada documento e o aprovador contra a matriz de papéis (5.3) | NC menor; NC maior se a política (5.2) ou a SoA estiver nessa situação |
| 4 | Controle "Implementado" sem registro | Estado "Implemented" na n.iso sem evidência vinculada ou com evidência fora do período | Listar evidências por controle no snapshot e checar data e conteúdo | NC menor por controle; NC maior se ≥3 no mesmo tema (8.1) |
| 5 | Análise crítica incompleta | Ata da 9.3 sem alguma das entradas da 9.3.2 ou sem decisões (9.3.3) | Checar a ata item a item contra a lista da 9.3.2 | NC menor por entrada ausente; NC maior se não houver análise crítica registrada |
| 6 | Auditoria interna sem independência | Auditor interno que implementou o que auditou; programa inexistente; escopo parcial | Conferir programa, relatório e quem executou (9.2.2) | NC maior se ausente ou sem imparcialidade; NC menor se escopo parcial |
| 7 | Objetivos sem medição | Objetivos de 6.2 sem indicador, meta, prazo ou resultado medido | Procurar medições do período (9.1) para cada objetivo | NC menor; NC maior se nenhum objetivo for medido |
| 8 | Treinamento sem reciclagem | Treinamento único na admissão, sem reciclagem nem avaliação de eficácia | Comparar datas de treinamento com a periodicidade definida (7.2, 7.3, A.6.3) | NC menor; OM se só faltar avaliação de eficácia |
| 9 | Exclusão sem justificativa | Controle excluído na SoA sem motivo, ou motivo genérico ("não se aplica") | Ler a justificativa de cada exclusão da SoA (27001 e 27701) | NC menor por item; NC maior se ≥3 exclusões sem justificativa (6.1.3 d) |
