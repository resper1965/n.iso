#!/usr/bin/env bash
#
# Smoke E2E da separação de papéis das API keys (consultor × auditor) contra o
# ambiente PUBLICADO. Testa a barreira REAL — o enforcement no backend
# (middleware/auth.ts + auth-policy.ts) — de forma deterministica, por curl.
#
# A separação de papéis é conferida no middleware ANTES do handler da rota, entao
# as recusas (casos 3 e 7) nao dependem de existir auditoria/controle real: basta
# as duas chaves e o id do projeto de teste.
#
# Uso:
#   NISO_BASE_URL=https://niso.ness.workers.dev \
#   PROJ=<id-do-projeto-de-teste> \
#   KEY_CONSULTANT=<chave-e2e-consultor> \
#   KEY_AUDITOR=<chave-e2e-auditor> \
#   [OTHER_PROJ=<id-de-outro-projeto>] [AUDIT_ID=<id-de-uma-auditoria-do-projeto>] \
#   scripts/mcp-e2e-smoke.sh
#
# As chaves saem da tela "API Keys" (Platform Admin) — cada uma presa ao projeto.
# Sai com codigo 1 se qualquer assercao obrigatoria falhar.

set -u

BASE="${NISO_BASE_URL:-https://niso.ness.workers.dev}"
PROJ="${PROJ:-}"
KEY_CONSULTANT="${KEY_CONSULTANT:-}"
KEY_AUDITOR="${KEY_AUDITOR:-}"
OTHER_PROJ="${OTHER_PROJ:-}"
AUDIT_ID="${AUDIT_ID:-}"

if [ -z "$PROJ" ] || [ -z "$KEY_CONSULTANT" ] || [ -z "$KEY_AUDITOR" ]; then
  echo "ERRO: defina PROJ, KEY_CONSULTANT e KEY_AUDITOR (ver cabecalho do script)." >&2
  exit 2
fi

falhas=0
ok=0
STATUS=""   # status HTTP da ultima chamada
BODY=""     # corpo (uma linha) da ultima chamada

# req METODO PATH CHAVE [CORPO_JSON]
req() {
  local metodo="$1" path="$2" chave="$3" corpo="${4:-}"
  local args=(-s -o /tmp/mcp-e2e-body -w '%{http_code}' -X "$metodo"
              "$BASE$path" -H "X-API-Key: $chave" -H 'Content-Type: application/json')
  [ -n "$corpo" ] && args+=(-d "$corpo")
  STATUS="$(curl "${args[@]}")"
  BODY="$(tr -d '\n' < /tmp/mcp-e2e-body)"
}

pass() { printf '  \033[32m✅ %s\033[0m\n' "$1"; ok=$((ok+1)); }
fail() { printf '  \033[31m❌ %s\033[0m — %s\n' "$1" "$2"; falhas=$((falhas+1)); }
skip() { printf '  \033[33m— %s\033[0m\n' "$1"; }

# espera_status NOME STATUS_ESPERADO [substring_no_corpo]
espera_status() {
  local nome="$1" want="$2" needle="${3:-}"
  if [ "$STATUS" != "$want" ]; then fail "$nome" "status $STATUS (esperava $want)"; return; fi
  if [ -n "$needle" ] && ! printf '%s' "$BODY" | grep -qF "$needle"; then
    fail "$nome" "corpo sem \"$needle\""; return
  fi
  pass "$nome"
}

# nega_recusa_papel NOME substring_de_recusa  (positivo: qualquer coisa MENOS a recusa de papel)
nega_recusa_papel() {
  local nome="$1" needle="$2"
  if printf '%s' "$BODY" | grep -qF "$needle"; then
    fail "$nome" "recusado por papel (status $STATUS) — nao deveria"
  else
    pass "$nome (status $STATUS, sem recusa de papel)"
  fi
}

echo "Alvo: $BASE  | projeto: $PROJ"
echo
echo "CONSULTOR (implementa, NAO audita):"

req GET  "/api/v1/projects" "$KEY_CONSULTANT"
espera_status "1. lista projetos (leitura)" "200"

req POST "/api/v1/projects/$PROJ/generate-policy" "$KEY_CONSULTANT" '{}'
nega_recusa_papel "2. gerar politica (escrita de implementacao)" "consultor não registra"

req POST "/api/v1/audits/e2e-smoke/findings" "$KEY_CONSULTANT" '{}'
espera_status "3. registrar achado → RECUSADO" "403" "consultor não registra achado"

if [ -n "$OTHER_PROJ" ]; then
  req GET "/api/v1/projects/$OTHER_PROJ" "$KEY_CONSULTANT"
  if [ "$STATUS" = "200" ]; then
    fail "4. ler OUTRO projeto ($OTHER_PROJ) → BARRADO" "200 — vazou dado de outro tenant"
  else
    pass "4. ler OUTRO projeto ($OTHER_PROJ) → BARRADO (status $STATUS)"
  fi
else
  skip "4. escopo de projeto: pulado (defina OTHER_PROJ p/ testar)"
fi

echo
echo "AUDITOR (audita, NAO implementa):"

req GET "/api/v1/projects" "$KEY_AUDITOR"
espera_status "5. lista projetos (leitura)" "200"

req POST "/api/v1/projects/$PROJ/generate-policy" "$KEY_AUDITOR" '{}'
espera_status "7. gerar politica → RECUSADO" "403" "auditor só registra achado"

if [ -n "$AUDIT_ID" ]; then
  req POST "/api/v1/audits/$AUDIT_ID/findings" "$KEY_AUDITOR" '{"description":"smoke e2e","severity":"minor"}'
  nega_recusa_papel "6. registrar achado (escrita de auditoria)" "auditor só registra"
else
  skip "6. escrita de auditoria: pulado (defina AUDIT_ID p/ testar o positivo)"
fi

echo
echo "Resultado: $ok ok, $falhas falha(s)."
if [ "$falhas" -eq 0 ]; then
  echo "APROVADO: separacao de papeis confirmada em producao."
else
  echo "REPROVADO: alguma recusa NAO ocorreu — a separacao esta furada."
fi
[ "$falhas" -eq 0 ]
