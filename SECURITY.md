# Política de Segurança

O nISO processa dados de conformidade e **dados pessoais sob a LGPD** (registros de
ROPA e DPIA, evidências de auditoria). Uma falha aqui não afeta só o sistema — afeta
os titulares de dados dos nossos clientes. Trate relatos de segurança com essa
gravidade.

## Reportar uma vulnerabilidade

**Não abra issue pública para vulnerabilidade.** Use um destes canais:

1. **GitHub Security Advisory** (preferencial) — aba *Security* → *Report a vulnerability*.
   Cria um canal privado com os mantenedores.
2. **E-mail** — `security@ness.lat`, com "nISO" no assunto.

Inclua, se possível: passos para reproduzir, impacto observado, versão/commit
afetado e se há exploração ativa.

**Retorno esperado:** confirmação de recebimento em até 3 dias úteis; avaliação
inicial de severidade em até 10 dias úteis.

## Escopo

Interessa especialmente (foi onde já encontramos problemas reais):

- **Isolamento entre clientes (multi-tenant)** — qualquer caminho que exponha dados
  de um projeto a usuário de outro
- **Autenticação e sessão** — bypass, escalonamento de privilégio, força bruta
- **Chaves de API e tokens** — previsibilidade, vazamento, escopo excessivo
- **Injeção** — SQL, XSS (inclusive stored, nos relatórios HTML), SSRF via webhooks
- **Trilha de auditoria** — qualquer forma de adulterar ou apagar `audit_logs`
- **Exposição de PII** — ROPA/DPIA acessíveis fora do projeto dono
- **Agente de IA (MCP remoto)** — qualquer caminho em que o agente alcance outro
  projeto, aja sobre a conta do consultor, amplie o próprio acesso ou execute ação
  destrutiva sem confirmação (modelo de ameaça em
  [`docs/agente/seguranca.md`](docs/agente/seguranca.md))

## Fora de escopo

- Ausência de rate limit em endpoints puramente de leitura
- Relatos gerados só por scanner automático, sem impacto demonstrado
- Engenharia social, ataque físico, DoS por volume
- Vulnerabilidades em dependências **sem** caminho de exploração no produto
  (reporte via issue normal, com a label `dependencies`)

## Compromissos deste repositório

Invariantes de segurança que o código mantém e que **não devem regredir**:

| Invariante | Onde é garantido |
|---|---|
| Isolamento de tenant em rotas de projeto | `src/middleware/project-access.ts` + teste cobrindo os 3 estilos de montagem |
| Consultor humano só alcança os projetos em que está designado como `consultor` na governança (rota de projeto, recurso por id e listagens entre projetos); só o `platform_admin` vê todos. Mesma regra do agente, falha fechada | `consultorDesignado` / `PROJETOS_DO_CONSULTOR_SQL` em `src/helpers.ts`, usados por `requireProjectAccess`, `requireResourceAccess`, `projetosVisiveis` e `concessaoValida` — `test/consultor-escopo.test.ts` |
| Escrita restrita para papéis read-only | `src/middleware/auth.ts` (allow-list por método+rota) |
| Segredos nunca no repositório | `SETUP_KEY` via `wrangler secret`; falha fechada se ausente |
| Tokens de segurança com CSPRNG | `genToken` / `genNumericCode` em `src/helpers.ts` — nunca `Math.random` |
| Trilha de auditoria imutável | Triggers `audit_logs_no_update` / `audit_logs_no_delete` |
| Código bate com o schema | `test/schema-contract.test.ts` roda contra D1 real |
| Agente de IA preso a um projeto, sem alcançar conta pessoal, acesso, credencial nem área comercial | `resolverAgente` e `FORA_DO_AGENTE` em `src/middleware/agente.ts`; os 12 invariantes e o checklist de PR em [`docs/agente/seguranca.md`](docs/agente/seguranca.md) — `test/agente-paridade.test.ts` |
| Ação destrutiva do agente (apagar, lote, eliminar titular, revogar aprovações) exige confirmação **no servidor** e deixa trilha com o projeto | `acaoDestrutiva` + `X-Agente-Confirmado`; hook em `src/middleware/auth.ts` — `test/agente-paridade.test.ts` |
| Concessão do agente revalidada a cada chamada; troca de senha a revoga | `concessaoValida` — `test/mcp-remoto.test.ts`, `test/agente-principal.test.ts` |
| Segredo de integração não sai (listagem de webhooks, export de portabilidade) | `src/routes/integrations.ts`, `src/portabilidade.ts` — `test/webhooks-segredo.test.ts` |
| 500 não devolve o interior do banco | `erro500` em `src/helpers.ts`: detalhe do D1 vai ao log, cliente recebe `request_id` — `test/erro-sem-vazamento.test.ts` |

Ao alterar qualquer um destes pontos, o PR precisa explicar por quê.

## Operação

Antes de aplicar migrations em produção: **faça backup** (`npm run db:backup`,
runbook em `backups/README.md`). Migrations que reconstroem tabela com PII exigem
verificação `PRAGMA table_info` antes — está documentado no cabeçalho de cada uma.
