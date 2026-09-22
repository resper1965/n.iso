# n.360 — Arquitetura do Ecossistema GRC

**Data:** 2026-09-22
**Estado:** rascunho de design; aguarda revisão do autor
**Repositório destino:** `resper1965/n360` (privado)

---

## 1. O que é o n.360

Um ecossistema de plataformas GRC interconectadas sobre **uma única base de
dados**, multitenancy, com suporte a operação por MSP.

O n.360 nasce da convergência de dois sistemas que já existem e que são
complementares — cada um tem exatamente o que falta ao outro:

| | `resper1965/nISO` | `resper1965/standard-api` |
|---|---|---|
| Banco | D1 (SQLite) | PostgreSQL (Neon) + Drizzle, 65 migrations |
| Runtime | Hono / Cloudflare Workers | Cloudflare Workers + Workflows + Queues |
| Tenancy | por **projeto** | por **organização** |
| Identidade | MFA, SSO OIDC cifrado, SCIM, RBAC, matriz de governança, portal do auditor | sem membership nem papéis |
| Motor normativo | SoA da ISO 27001 embutida (93 regras) | SCF + STRM + crosswalk |
| Frontend | Vite vanilla, PT-BR, design system ness. | React 19 + Radix + Tailwind |
| Produção | clientes reais em `n-iso.ness.com.br` | — |

A lacuna de identidade do `standard-api` está declarada no próprio código,
em `packages/schemas/src/db/organization-schema.ts:6`:

> Não existe memberships nem roles — modelo simplificado para SaaS
> single-user-per-org.

E a lacuna de isolamento do nISO está em `src/helpers.ts:172`:

```js
if (user.role === 'consultor' || user.role === 'platform_admin' || user.role === 'consultant') return true;
```

Um `consultor` enxerga **todos** os projetos da instalação. Correto para uma
consultoria única; inaceitável no instante em que existir um segundo MSP na
mesma base. Corrigir isso é pré-requisito, não melhoria.

## 2. O que cada origem contribui

### 2.1 Do `standard-api`: apenas a camada normativa

O `standard-api` é refatorado até sobrar a camada normativa. **Entra:**

- as tabelas de catálogo SCF (`packages/schemas/src/db/scf.schema.ts`);
- as tabelas de relacionamento **STRM** — a semântica de conjunto do SCF
  (subconjunto de / intersecta / equivale / superconjunto de), que é o que
  permite projetar estado de controle para uma norma com fidelidade, em vez
  de um `de-para` sem qualificação;
- os importadores: `xlsx-importer`, `csv-importer`, `strm-bundle-importer`,
  `strm-operator`, `wide-crosswalk`, `authoritative-sources`;
- o versionamento de catálogo (`scf_version`, `is_synthetic`, hash de fonte).

**Não entra** (o GRC é do n.360): `soa`, `gap-analysis`, `maturity`, `poam`,
`privacy`, `tpra`, `assessment-engine`, `agent-runtime`, `reporting`, `kb`,
`apps/web`.

O `standard-api` deixa de ser um serviço no ar e passa a ser a **ferramenta de
importação do catálogo**: planilha oficial do SCF → tabelas do n.360, com a
versão carimbada. Atualizar catálogo vira um evento explícito e auditável.

> **Nota de licenciamento.** O catálogo SCF **não está versionado** no
> `standard-api`. O `packages/schemas/src/seed-scf-catalog.ts` importa a
> planilha oficial (SCF 2026.1.1) em tempo de seed; o que existe em
> `infra/docker/postgres/seeds/` é sintético (16 KB). O arquivo licenciado do
> SCF é insumo externo e precisa estar disponível no processo de seed.

### 2.2 Do `nISO`: identidade, entrega e marca

Portado peça a peça, **não clonado**:

- autenticação e identidade: sessão, TOTP/MFA, SSO OIDC com `client_secret`
  cifrado (`src/secret-crypto.ts`), SCIM 2.0, chaves de API com escopo;
- a **matriz de governança** (`project_governance`) que decide autoridade de
  assinatura separadamente do papel de plataforma — a mesma pessoa é DPO num
  cliente, consultor noutro e nada num terceiro;
- o portal do auditor externo por token, com alcance a um engagement só;
- a trilha de auditoria append-only por trigger e o arquivamento encadeado
  em R2;
- a jornada de certificação ISO 27001/27701 em PT-BR (fases, questionários,
  dossiê);
- o design system ness. (`design.md`).

## 3. Stack

| Camada | Escolha |
|---|---|
| Runtime | Cloudflare Workers |
| Banco | **PostgreSQL (Neon)** — base única |
| ORM | Drizzle |
| Arquivos | R2 (evidências e documentos; bucket separado para trilha arquivada) |
| Frontend | **em aberto** — decidido na spec do n.core (§10) |

O Postgres substitui o D1 porque o catálogo SCF/STRM foi modelado nele, porque
o D1 tem teto de tamanho por banco, e porque relatório analítico multi-cliente
de MSP é exatamente o perfil de consulta em que o SQLite é fraco.

## 4. Tenancy

```
providers              MSP, ou a ness. como provedor de si mesma
  └── organizations    O CLIENTE — esta é a fronteira de isolamento
        ├── entitlements       módulos que esta org licencia
        ├── registros comuns   pessoas · ativos · fornecedores · riscos · políticas · incidentes
        └── engagements        recorte de escopo de uma certificação
```

O `project` do nISO vira **engagement**: continua recortando escopo (uma org
pode certificar só uma unidade de negócio) e continua sendo o que o auditor
externo recebe por token. O que ele deixa de ser é o dono do dado.

Os registros comuns pendem de `organization_id`, nunca de engagement. Um
fornecedor cadastrado no n.tprm aparece na análise de risco do n.iso sem
redigitação — é essa a razão de o n.360 existir.

### 4.1 Autorização

`users.client_project_id` é substituído por:

```
memberships (user_id, scope_type: provider | org | engagement, scope_id, role)
```

| Ator | Alcance |
|---|---|
| `platform_admin` (ness.) | tudo — e cada acesso carimbado na trilha |
| staff de provedor | só as orgs cujo `provider_id` é o seu |
| staff de org | só a própria org |
| auditor externo | só o engagement do token |

A matriz de governança continua separada: `memberships` diz o que a pessoa
**opera**, `project_governance` diz quem ela **é** naquele engagement, e só o
segundo decide o que ela **assina**.

## 5. Espinha normativa

O catálogo SCF é o único lugar onde a organização implementa e evidencia. As
relações STRM projetam esse estado para cada norma:

```
controle SCF ──STRM──► requisito de norma (ISO 27001, 27701, 42001, LGPD, SOC 2, NIST CSF…)
     │
     └── implementação + evidência da org  (registrada UMA vez)
```

Gap por norma é consulta, não retrabalho. Evidenciar uma vez satisfaz N normas,
e a organização deixa de poder estar "conforme na ISO e não conforme no SOC 2"
pelo mesmo fato.

Como o catálogo vive na mesma base, o relatório é reprodutível por construção —
sem chamada de rede no caminho crítico e sem depender de serviço externo no ar.
Ainda assim, todo artefato **emitido** (SoA, relatório de gap, dossiê) carimba
o `scf_version` vigente, para que uma atualização futura de catálogo não
reescreva o passado.

## 6. Módulos

| Módulo | Origem | Papel |
|---|---|---|
| **n.core** | ambos | tenancy, identidade, trilha, catálogo SCF/STRM, registros comuns, design system. Sem UI própria. |
| **n.grc** | novo sobre a espinha | visão única, SoA multi-norma, gaps, acompanhamento contínuo |
| **n.iso** | nISO | jornada de certificação 27001/27701 |
| **n.privacy** | nISO (embrião) | regulatórios de privacidade, ROPA, DPIA, direitos do titular |
| **n.tprm** | nISO (embrião) | terceiros, questionários, risco de cadeia |
| **n.policies** | nISO (embrião) | ciclo de vida de política e ciência de aceite |
| **n.training** | nISO (embrião) | trilhas, campanhas, evidência de conclusão |
| **n.risk** | extraído do nISO | risco corporativo — o hub que recebe risco de terceiro, de incidente e de gap |
| **n.audit** | extraído do nISO | programa de auditoria, achados, CAPA, portal do auditor |
| **n.cirt** | greenfield | resposta a incidente |
| **n.bcm** | greenfield | BIA, planos de continuidade, exercícios (ISO 22301, A.5.29–5.30) |
| **n.ai** | greenfield | inventário de sistemas de IA, ISO 42001 |
| **n.console** | greenfield | cockpit do MSP: carteira, postura comparada, SLA, consumo |

`n.access` (revisão e recertificação de acesso, A.5.15–5.18) fica no backlog do
mapa — o SCIM já alimenta o dado, então acomodá-lo depois não é ruptura.

Cada módulo é montado condicionalmente pelo `entitlement` da organização.

## 7. Migração do n.ISO em produção

O n.ISO continua servindo `n-iso.ness.com.br` durante toda a transição. Ele
entra em **manutenção** — correção de bug e de segurança, sem feature nova — e
cada cliente é migrado para o n.360 por ferramenta de importação quando o n.360
alcançar paridade para aquele cliente. Desligado quando o último sair.

Isto não é uma escolha entre opções: é consequência de o n.360 nascer em
Postgres, numa base nova. Uma camada de compatibilidade sobre o D1 existente
deixou de ser possível no momento em que o banco mudou.

> **Pendente de confirmação do autor.** O que está acima é a consequência
> técnica, não uma decisão tomada. O que o autor precisa confirmar é a postura
> de produto: o n.ISO entra em manutenção (sem feature nova) durante a
> transição, ou segue evoluindo em paralelo? Seguir evoluindo move o alvo de
> paridade e faz toda feature nova nascer para ser portada de novo.

## 8. Decomposição em sub-projetos

Cada linha é um ciclo spec → plano → implementação próprio.

| # | Sub-projeto | Por que nesta posição |
|---|---|---|
| 0 | **n.core: tenancy e identidade** | Bloqueia tudo. Enquanto o tenant não for a organização, todo módulo novo nasce com o dado no lugar errado. Inclui a substituição de `helpers.ts:172` por `memberships`. |
| 1 | **n.core: registros comuns** | Promove pessoas, ativos, fornecedores e riscos a nível org. Faz o n.risk e metade do n.tprm existirem quase de graça. |
| 2 | **n.core: espinha SCF/STRM** | Define como qualquer módulo declara conformidade. Feito depois, cada módulo já terá inventado o seu jeito. |
| 3 | **n.privacy** | Maior valor comercial imediato, sobre o embrião mais maduro depois do n.iso. |
| 4 | **n.policies + n.training** | Juntos: política sem ciência de aceite não fecha, e a ciência é uma campanha de treinamento. Separá-los duplica o cadastro de pessoas. |
| 5 | **n.tprm** | Depende dos registros comuns (1) e envia risco para o n.risk. |
| 6 | **n.cirt** | Greenfield puro — o teste honesto de se o contrato de módulo do n.core serve a quem não herdou nada. |
| 7 | **n.bcm · n.ai** | Consomem tudo que já está de pé. Baratos nesta ordem, caros em qualquer outra. |
| 8 | **n.console** | Precisa de vários módulos vivos para ter o que comparar. |

O `n.iso`, o `n.grc`, o `n.risk` e o `n.audit` não aparecem como sub-projetos
separados: o n.grc é o produto dos itens 1 e 2, e os outros três são portes
que acompanham os sub-projetos de que dependem.

## 9. Decisões revogadas durante o desenho

Registradas para que não reapareçam como se nunca tivessem sido decididas:

1. **"`bstandard.bekaa.eu` consultada ao vivo por API" — revogada.** O catálogo
   passa a viver dentro do n.360 (§5). Some a dependência de disponibilidade no
   caminho crítico e o relatório fica reprodutível por construção.
2. **"Camada de compatibilidade, corte gradual" — revogada.** Pressupunha
   evoluir o D1 do nISO no lugar. Com base nova em Postgres, o que resta é o
   corte por cliente descrito em §7.
3. **"standard-api como tronco do n.360" — recusada pelo autor.** O
   `standard-api` entra apenas como camada normativa (§2.1); o GRC é do n.360.

## 10. Questões em aberto

Cada uma precisa estar fechada antes do sub-projeto que depende dela.

| Questão | Bloqueia | Quem decide |
|---|---|---|
| **Frontend: React (reaproveitando `apps/web`) ou vanilla (portando `ui.js`)?** O `AGENTS.md` do nISO registra "sem framework" como decisão; o n.360 é repositório novo e reabre a escolha. | n.core | autor + time |
| **Disponibilidade da planilha licenciada do SCF** no processo de seed. | n.core §2 (espinha) | autor |
| **PT-BR apenas, ou i18n?** O nISO removeu a camada de tradução por decisão explícita. MSP fora do Brasil reabriria a questão. | n.core | autor |
| **Modelo de faturamento por entitlement** (por módulo, por org, por assento). | n.console | autor |
| **Postura do n.ISO durante a transição** — manutenção ou evolução em paralelo (§7). | n.core | autor |

---

## Próximo passo

Revisar esta spec. Aprovada, o próximo passo é a skill `writing-plans` sobre o
**sub-projeto 0 (n.core: tenancy e identidade)** — não sobre o n.360 inteiro.
