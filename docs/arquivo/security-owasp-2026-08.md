# Avaliação de segurança — OWASP Top 10 (2021) + RFC 9116

Revisão da aplicação nISO (Workers/Hono/D1) contra o OWASP Top 10:2021 e a
disponibilidade de `security.txt`. Baseada em **leitura de código** (`src/`,
`frontend/`), não em pentest dinâmico — onde a conclusão depende do ambiente em
execução (ex.: entrega do endpoint), isso é dito explicitamente.
Legenda: ✅ adequado · ⚠️ gap/hardening · 🔴 corrigir.

## Resumo

O app tem base endurecida: `secureHeaders` (HSTS + CSP restritiva), CORS,
rate-limit, PBKDF2 salgado com comparação em tempo constante (e auto-migração de
hash legado no login), MFA/TOTP, isolamento de tenant, log estruturado + trilha de
auditoria, e `security.txt` (RFC 9116) implementado em código.

Achados: **1 🔴** (S1 token em claro — corrigido no #110) · **1 🔴 web** (S7 XSS
armazenado — corrigido no #112) · **6 ⚠️** de hardening (S2, S3, S5, S6, S8, S-log,
com S4 já implementado). Queries são parametrizadas (sem SQL injection).

| OWASP | Situação | Item |
|-------|----------|------|
| A01 Broken Access Control | ✅ | isolamento por `requireResourceAccess` (endurecido no #107) |
| A02 Cryptographic Failures | 🔴→✅ ⚠️ | S1 token (corrigido #110) · S4 senha legada (já implementado) |
| A03 Injection | 🔴→✅ | S7 XSS armazenado em `pricing_notas` (corrigido #112); SQL parametrizado |
| A04 Insecure Design | ✅ | rate-limit por custo, invalidação de aprovação por integridade |
| A05 Security Misconfiguration | ⚠️ | S2 CSP `unsafe-inline` · S3 CORS `*` |
| A06 Vulnerable Components | ⚠️→✅ | S5 `npm audit` no CI (adicionado #111, informativo) |
| A07 Auth Failures | ✅ ⚠️ | PBKDF2 100k + MFA · S6 login rate-limit por IP (adicionado por-conta #113) |
| A08 Integrity Failures | ✅ | CI + deploy versionado; sem desserialização insegura |
| A09 Logging & Monitoring | ✅ ⚠️ | log JSON + `logAudit` presentes — **mas gravam PII** (ver S-log) |
| A10 SSRF | ⚠️ | S8 webhook: guard bloqueia IP interno literal, mas **não resolve DNS** (rebinding) |

## security.txt (RFC 9116)

`GET /.well-known/security.txt` **implementado em `src/index.ts`** (não verificado
em produção — revisão só de código): `Contact` (e-mail + advisory), `Expires`
**calculado** (180 d — não vence esquecido), `Canonical`, `Policy` → `SECURITY.md`
(presente), `Preferred-Languages`. Confirmar a entrega no Worker publicado
(`curl https://<host>/.well-known/security.txt`) antes de anunciar a operadores.

---

## Achados

### S1 · Token do repositório em texto claro no D1 — 🔴 → corrigido (#110) (A02)
`projects.repository_token` era gravado em claro. Cifrado em repouso (AES-GCM) no
#110; leitura decifrada por `getRepositoryToken`; migração do legado por endpoint
admin. Rastreado no plano do backlog (PR #108, `docs/backlog-plan.md`, item D1/P1).

### S7 · XSS armazenado em `pricing_notas` — 🔴 → corrigido (#112) (A03)
`pricing_notas` (texto livre, `PUT /assessments/:id/pricing`, sem sanitização) era
interpolado cru num `<textarea>` passado a `openModal` (innerHTML). `</textarea>
<img src=x onerror=...>` executava ao abrir o modal — e o CSP `unsafe-inline`
permite o handler. Escapado no sink (`escapeHTML`) no #112.

### S2 · CSP com `script-src 'unsafe-inline'` — ⚠️ (A05/A03)
Concessão consciente (~324 `onclick=` inline). Enquanto durar, o CSP não barra XSS
injetado (ver S7); o valor vem de `object-src/base-uri/form-action/frame-ancestors
'none'` e do escape no sink. **Upgrade:** migrar `onclick` → `addEventListener` e
trocar por `nonce`. Refactor grande — decidir escopo com o time.

### S3 · CORS `origin: '*'` — ⚠️ (A05)
Risco real baixo (auth por Bearer em `localStorage`, sem cookies → sem CSRF por
credencial). Restringir aos domínios conhecidos (app + preview) reduz superfície.
**Ação:** allowlist de origens (requer a lista canônica de domínios).

### S4 · Senha legada SHA-256 — ✅ já implementado (A02/A07)
O login (`auth.ts:61-65`) já re-hasheia para PBKDF2 no acesso bem-sucedido de uma
conta com hash legado. O ramo de verificação legado permanece até toda a base
migrar; removê-lo depois é a única pendência (cleanup, não risco aberto).

### S5 · `npm audit` no CI — ✅ adicionado (#111) (A06)
Job `audit` (root + frontend + mcp-server), `--audit-level=high`, **informativo**
(não bloqueante — só `test` é required). Apertar para bloqueante quando a base
estiver limpa.

### S6 · Login rate-limit por IP — ✅ endurecido (#113) (A07)
Somado um teto por **conta-alvo** (`login:acct:<email>` 10/5min) ao teto por IP,
para frear ataque distribuído sobre uma conta.

### S8 · Webhook SSRF — DNS rebinding — ⚠️ (A10)
`POST /projects/:id/webhooks` persiste a URL do chamador e a consome via `fetch`.
`isValidWebhookUrl` já bloqueia IP interno **literal** (loopback, privado,
link-local/metadata, IPv6 interno, codificações alternativas), mas **não resolve
DNS** — um hostname público que resolva para IP interno (rebinding) passa. Fechar
exige resolver e validar/pinar o IP resolvido, ou allowlist de egress — decisão de
política, não corrigido aqui.

### S-log · Trilha de auditoria contém PII — ⚠️ (A09)
`logAudit` grava `actor` e `details` verbatim no D1; chamadores passam e-mail, nome
e trechos de conteúdo (ex.: prefixo de prompt de IA). Não é ausência de PII — os
logs precisam do ciclo de vida/retenção e das proteções LGPD correspondentes.
**Ação:** classificar o dado, definir retenção e minimizar o que entra em `details`.

---

## Ordem sugerida (restante)

**S2** (CSP nonce — maior, decisão de escopo) · **S3** (CORS allowlist — precisa a
lista de domínios) · **S8** (SSRF/DNS — decisão de política de egress) ·
**S-log** (retenção/minimização de PII no audit). Itens 🔴 e os rápidos (S5/S6/S7)
já entraram ou têm PR.
