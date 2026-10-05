---
name: prontidao-certificacao
description: Use ao avaliar se um SGSI/PIMS ISO 27001:2022 / 27701:2025 está pronto para Stage 1 e Stage 2 da certificadora, cruzando documento, registro na n.iso e prova operacional
---

# Pré-avaliação de prontidão para certificação (ISO/IEC 27001:2022 + ISO/IEC 27701:2025)

## Papel

- Você é avaliador com o critério de uma certificadora: pergunta o que o auditor do organismo de certificação perguntaria e só aceita o que ele aceitaria.
- O trabalho é **pré-avaliação de prontidão da consultoria**. Não é auditoria interna (ISO/IEC 27001, 9.2): quem implementou o sistema não o avalia como auditor interno, e o resultado não substitui o programa de auditoria interna da organização.
- Nenhum achado é gravado na n.iso. Leitura apenas (`niso_ler`, `niso_coherence_check`, `niso_gap_analysis`, `niso_traceability`). Nenhuma escrita em repositório remoto. Não use `niso_executar` nesta avaliação.
- Esta skill chega pelo MCP: `niso_skill` sem argumentos lista o que existe; `niso_skill` com `nome` traz este arquivo; com `arquivo` traz uma referência ou o validador (ex.: `arquivo=references/armadilhas-certificadora.md`).

## Fontes

Todo requisito é cruzado em três fontes, todas somente leitura:

1. **Documento** — a informação documentada do SGSI/PIMS na pasta de trabalho (políticas, procedimentos, SoA, registro de fatos canônicos).
2. **Registro** — o snapshot da n.iso, montado por você no início (ver "Como montar o snapshot"): controles, evidências (lista e conteúdo), riscos, ativos, políticas, auditorias, análises críticas, CAPA, treinamentos, fornecedores, governança, ROPA, DPIA, coherence check e gap analysis.
3. **Prova operacional** — só o que já existe nos insumos locais e na n.iso. O agente não acessa o ambiente de nuvem do cliente: prova que o consultor não trouxe vira achado e gera um item em `export_pedido` (comando só-leitura, ver `references/anexo-a-27001.md`; os exemplos são AWS e GitHub, adapte ao que o cliente usa).

Se uma rota do snapshot falhou (erro, 404), trate como "sem registro no snapshot", nunca como "não existe"; o erro está em `_snapshot/_erros.md`.

## Como montar o snapshot

Antes de avaliar, leia o registro com `niso_ler` (o mapa de caminhos está em `niso_contexto`; `{p}` = projectId) e grave cada resposta como arquivo em `_snapshot/` na pasta de trabalho:

- controles `/api/v1/projects/{p}/controls`; riscos `/api/v1/projects/{p}/risks`; ativos `/api/v1/projects/{p}/assets`
- evidências `/api/v1/projects/{p}/evidence` e, para cada uma de texto, `/api/v1/evidence/{id}/content` (binário volta só como metadado: registre como "conteúdo não lido")
- políticas e versões `/api/v1/projects/{p}/controls/{controle}/versions`
- auditorias `/api/v1/projects/{p}/audits`; análises críticas `/api/v1/projects/{p}/management-reviews`; CAPA `/api/v1/projects/{p}/capa`
- treinamento `/training`, fornecedores `/vendors`, governança `/governance`, ROPA `/ropa`, DPIA `/dpia` (todos sob `/api/v1/projects/{p}/`)
- diagnóstico: `niso_coherence_check`, `niso_gap_analysis`, `niso_traceability`

Anote em `_snapshot/_erros.md` toda rota que falhou e liste em `_snapshot/ids.txt` os ids que aparecem (um por linha); é o arquivo que o validador usa em `--fontes`. Respostas grandes vêm cortadas em 100.000 caracteres: nesse caso peça por item e registre o corte.

## Regra de fechamento

- Um item só é `atende` quando **documento, registro e prova** fecham entre si.
- Duas de três = `parcial`. Nenhuma ou só documento sem aprovação = `nao_atende`.
- Achado sem `fonte` (caminho relativo à raiz de trabalho ou id da n.iso: `ctrl-…`, `audit-…`, id de evidência etc.) é **descartado**.
- Não inventar evidência, data, pessoa, valor ou número de controle. Na dúvida, registre a dúvida como achado ou pergunta, não como fato.

## Severidade

| Severidade | Quando usar |
|---|---|
| `NC maior` | Requisito obrigatório ("deve") da norma ausente; **ou** falha que se repete em 3 ou mais itens do mesmo requisito (falha sistêmica); **ou** ausência total de registro de uma cláusula 9 ou 10 (monitoramento, auditoria interna, análise crítica, não conformidade/ação corretiva, melhoria). Impede a recomendação para certificação. |
| `NC menor` | Falha pontual ou isolada no atendimento de um requisito; o requisito existe e funciona na maior parte. |
| `OM` | Oportunidade de melhoria: nenhum requisito violado. Boa prática, clareza, eficiência. |

NC maior precisa de fundamento normativo (cláusula ou controle citado em `requisito`). "Boa prática" sozinha nunca sustenta NC maior; rebaixe para NC menor ou OM.

## Vereditos S1/S2

- **`veredito_s1` (Stage 1, documental)** — o documento existe; está aprovado, com data e aprovador de papel válido; é coerente com a SoA e com o registro na n.iso.
- **`veredito_s2` (Stage 2, operação)** — há registro de operação no período avaliado, verificável por amostra (ex.: 3 a 5 ocorrências: tickets, logs, atas, exports).
- Valores: `atende` | `parcial` | `nao_atende` | `na` (use `na` apenas quando o requisito não se aplica ao stage, com a razão na constatação).

## Formato do achado

Uma linha por achado em `bloco-N.csv`, separador `;`, codificação `utf-8-sig`, cabeçalho exato:

```
id;bloco;requisito;severidade;veredito_s1;veredito_s2;pergunta_auditor;constatacao;fonte;correcao;dono;export_pedido
```

- `id`: `B<bloco>-<nn>` (ex.: `B3-07`), único no arquivo.
- `requisito`: cláusula ou controle (ex.: `9.3.2`, `A.8.15`, `27701 A.1.x (a confirmar)`).
- `pergunta_auditor`: a pergunta que o auditor faria.
- `constatacao`: o que foi observado, factual, sem adjetivo.
- `fonte`: obrigatória; várias fontes separadas por `|`.
- `correcao`: ação concreta que fecha o achado.
- `dono`: um papel, nunca nome de pessoa (ex.: CEO, COO, CIO / Líder de Operações de Segurança, CTO, DevOps Lead, Encarregado (parecer), consultoria). Use os papéis da governança do projeto (`/api/v1/projects/{p}/governance`) ou a lista que o consultor fixou para a rodada.
- `export_pedido`: comando só-leitura ou artefato pedido quando falta prova; vazio se não houver.
- Campos obrigatórios: todos, exceto `pergunta_auditor` e `export_pedido`.

Consultar: `references/clausulas-27001.md`, `references/clausulas-27701.md`, `references/anexo-a-27001.md`, `references/anexo-a-27701.md`, `references/armadilhas-certificadora.md`.

## Proibições

- Não gravar nada na n.iso nem em repositório remoto.
- Não chamar o próprio trabalho de "auditoria", nem usar "auditado" ou "conforme" para descrevê-lo. Use "pré-avaliação", "avaliado", "atende".
- Não usar "100%" nem termos vedados para este cliente (o validador reprova; o consultor informa a lista e você a passa em `--proibidos`).
- Não inventar evidência, data, pessoa, valor ou numeração normativa.
- Não citar contexto fora do escopo definido para o SGSI/PIMS avaliado (nenhum cliente, parceiro ou projeto externo nomeado).
- Não copiar texto normativo das ISO: parafrasear.
- Numeração das Tabelas A.1/A.2/A.3 da ISO/IEC 27701:2025: tratar como item a confirmar contra o texto oficial.

## Como validar

O validador é um arquivo desta skill: traga com `niso_skill` (`arquivo=scripts/check_achados.py`), grave na pasta de trabalho e rode com Python 3.

```
python check_achados.py bloco-N.csv
python check_achados.py bloco-N.csv --fontes <raiz de trabalho> _snapshot/ids.txt
python check_achados.py bloco-N.csv --proibidos "termo1,termo2"
python check_achados.py --selftest
```

Saída `OK <n> achados` (exit 0) ou uma linha `ERRO linha <n>: <motivo>` por problema (exit 1). Com `--fontes`, cada fonte precisa existir como arquivo sob a raiz ou constar em `snapshot_ids.txt`. Corrija até passar antes de entregar o bloco.
