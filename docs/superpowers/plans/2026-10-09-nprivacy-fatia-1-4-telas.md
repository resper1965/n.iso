# Núcleo do n.privacy, fatia 1.4 — o que fica visível

**Spec:** `docs/superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md` (fatia 1: "Inventário único; responsável clicável").

**Goal:** o consultor vê e mexe nas partes e departamentos, importa e concilia, e escolhe o responsável do risco no cadastro.

## Corte (ponytail)

Entra só o que tem consumidor hoje:

1. **API do risco** aceita `owner_parte_id` (valida na mesma lista de `refForaDoProjeto`, `TABELA_DA_REF.owner_parte_id = 'partes'`). PUT sem o campo mantém; `null` desliga. A listagem junta `partes` e devolve `owner_parte_nome`.
2. **Tela `partes.js`** (`/partes` na barra lateral): partes, departamentos, importar, conciliar, cadastro e edição de parte. Papéis só lidos, sem criar vínculo à mão.
3. **Seletor de responsável** nos dois modais de risco, com o texto livre mantido.

Fica fora, de propósito:

- **Seletor em controle, RoPA, CAPA e checklist:** a coluna `*_parte_id` já existe (1.3); cada tela ganha o seletor na sua vez, com a mesma regra do risco.
- **Chave de módulo na gestão do projeto:** `PUT /modulos/:modulo` existe (1.1), mas só há o módulo `iso`; a tela nasce com o segundo módulo.
- **Inventário único:** o inventário já é um só (`itens`, 1.2); a tela de ativos não muda.
- **Contato público do encarregado:** superfície pública nova, vai com a fatia que define o texto do aviso.

## Tarefas e provas

| # | Mudança | Prova |
|---|---|---|
| 1 | `src/schemas/resources.ts`, `src/helpers.ts`, `src/routes/risks.ts` | `test/risco-responsavel.test.ts` (vermelho antes: 3 falhas) |
| 2 | `frontend/src/views/partes.js`, `main.js`, `router.js`, `login.html` | `frontend/test/partes-view.test.js` |
| 3 | `frontend/src/views/grc.js` (modais e lista de risco) | `frontend/test/risco-responsavel.test.js` |
| 4 | `docs/openapi.json` (`npm run openapi`), contagens, CHANGELOG | `test/openapi.test.ts`, `test/contrato-tela-api.test.ts` |

## Depois do merge

Nada de migration. Depois do deploy de 1.1–1.3 (migrations 0047–0049 aplicadas pelo dono), o consultor abre Partes, importa e concilia.
