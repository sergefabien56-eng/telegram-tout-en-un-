#!/usr/bin/env bash
# Test de bout en bout du lot Telegram (webhook + Mini App + liaison).
# Prérequis : serveur lancé AVEC TELEGRAM_BOT_TOKEN et TELEGRAM_WEBHOOK_SECRET.
# Usage : bash scripts/telegram-smoke.sh [base_url] [webhook_secret]
set -uo pipefail

BASE="${1:-http://localhost:3000}"
SECRET="${2:-$TELEGRAM_WEBHOOK_SECRET}"
JAR="$(mktemp)"
EMAIL="tg-smoke$(date +%s)@exemple.ci"
PASS=0
FAIL=0

step() { printf '\n=== %s ===\n' "$1"; }
check() {
  if [ "$2" = "0" ]; then echo "OK   : $1"; PASS=$((PASS+1)); else echo "ÉCHEC: $1"; FAIL=$((FAIL+1)); fi
}

step "1. Webhook sans en-tête secret -> 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/telegram/webhook" \
  -H 'Content-Type: application/json' -d '{"message":{"message_id":1,"from":{"id":1},"chat":{"id":1},"text":"/start"}}')
echo "code=$CODE"; [ "$CODE" = "401" ] || [ "$CODE" = "500" ]; check "refusé sans secret" $?

step "2. Webhook avec mauvais secret -> 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/telegram/webhook" \
  -H 'Content-Type: application/json' -H 'X-Telegram-Bot-Api-Secret-Token: mauvais' \
  -d '{"message":{"message_id":1,"from":{"id":1},"chat":{"id":1},"text":"/start"}}')
echo "code=$CODE"; [ "$CODE" = "401" ]; check "refusé avec mauvais secret" $?

if [ -z "$SECRET" ]; then
  echo "SECRET absent : tests suivants ignorés (configurez TELEGRAM_WEBHOOK_SECRET)."
else
  step "3. Webhook avec bon secret -> 200 (accepté)"
  RESP=$(curl -s -X POST "$BASE/api/telegram/webhook" \
    -H 'Content-Type: application/json' -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
    -d '{"message":{"message_id":1,"from":{"id":1,"first_name":"Test"},"chat":{"id":1},"text":"/start"}}')
  echo "$RESP"; echo "$RESP" | grep -q '"ok":true'; check "accepté avec bon secret" $?

  step "4. Inscription (pour générer un code de liaison)"
  REG=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"MotDePasse123\",\"fullName\":\"TG Smoke\"}")
  echo "$REG"; echo "$REG" | grep -q '"ok":true'; check "inscription" $?

  step "5. Code de liaison (authentifié)"
  LINK=$(curl -s -b "$JAR" -X POST "$BASE/api/telegram/link-code")
  echo "$LINK"; CODE_LINK=$(echo "$LINK" | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
  [ -n "$CODE_LINK" ]; check "code généré" $?

  step "6. Code de liaison refusé sans session -> 401"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/telegram/link-code")
  echo "code=$CODE"; [ "$CODE" = "401" ]; check "refusé sans session" $?

  step "7. Mini App avec initData falsifié -> 401"
  BAD=$(curl -s -X POST "$BASE/api/telegram/mini-app/session" -H 'Content-Type: application/json' \
    -d '{"initData":"auth_date=1&user=%7B%22id%22%3A1%7D&hash=deadbeef"}')
  echo "$BAD"; echo "$BAD" | grep -q '"ok":false'; check "initData falsifié refusé" $?
fi

step "8. Mini App avec initData vide -> 422"
EMPTY=$(curl -s -X POST "$BASE/api/telegram/mini-app/session" -H 'Content-Type: application/json' -d '{}')
echo "$EMPTY"; echo "$EMPTY" | grep -q '"ok":false'; check "initData manquant refusé" $?

printf '\n=== RÉSULTAT : %d OK / %d ÉCHEC ===\n' "$PASS" "$FAIL"
rm -f "$JAR"
[ "$FAIL" = "0" ]
