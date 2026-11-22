#!/usr/bin/env bash
# Test de bout en bout de l'authentification web sur la base Neon réelle.
# Usage : bash scripts/auth-smoke.sh [base_url]
set -uo pipefail

BASE="${1:-http://localhost:3000}"
EMAIL="smoke$(date +%s)@exemple.ci"
PASSWORD="MotDePasse123"
JAR="$(mktemp)"
PASS=0
FAIL=0

step() { printf '\n=== %s ===\n' "$1"; }
check() {
  if [ "$2" = "0" ]; then echo "OK   : $1"; PASS=$((PASS+1)); else echo "ÉCHEC: $1"; FAIL=$((FAIL+1)); fi
}

step "1. Inscription"
REGISTER=$(curl -s -c "$JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"Test Smoke\"}")
echo "$REGISTER"
CODE=$(echo "$REGISTER" | tail -n1)
[ "$CODE" = "201" ]; check "inscription -> 201" $?

step "2. Session /api/auth/me"
ME=$(curl -s -b "$JAR" "$BASE/api/auth/me")
echo "$ME"
echo "$ME" | grep -q "$EMAIL"; check "session valide" $?

step "3. Déconnexion"
LOGOUT=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/logout")
echo "$LOGOUT"
echo "$LOGOUT" | grep -q '"ok":true'; check "déconnexion" $?

step "4. Connexion avec le bon mot de passe"
LOGIN=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
echo "$LOGIN"
echo "$LOGIN" | grep -q '"ok":true'; check "connexion" $?

step "5. Mauvais mot de passe refusé"
BAD=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Mauvais123\"}")
echo "$BAD"
CODE=$(echo "$BAD" | grep -o '"ok":false'); [ -n "$CODE" ]; check "mauvais mot de passe refusé" $?

step "6. /dashboard redirige sans cookie"
DASH=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/dashboard")
echo "code=$DASH"
[ "$DASH" = "307" ] || [ "$DASH" = "308" ]; check "protégé sans session" $?

step "7. Réinitialisation de mot de passe"
RESET_REQ=$(curl -s -X POST "$BASE/api/auth/password-reset" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
echo "$RESET_REQ"
TOKEN=$(echo "$RESET_REQ" | sed -n 's/.*"devToken":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then
  CONFIRM=$(curl -s -X POST "$BASE/api/auth/password-reset/confirm" \
    -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\",\"password\":\"NouveauMot99\"}")
  echo "$CONFIRM"
  echo "$CONFIRM" | grep -q '"ok":true'; check "réinitialisation" $?
  NEW_OK=1
else
  # En production, aucun jeton n'est renvoyé (comportement voulu) : étapes ignorées.
  echo "devToken absent (production) -> étapes 7/8 ignorées."
  NEW_OK=0
fi

if [ "$NEW_OK" = "1" ]; then
  step "8. Connexion avec le nouveau mot de passe"
  NEWLOGIN=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"NouveauMot99\"}")
  echo "$NEWLOGIN"
  echo "$NEWLOGIN" | grep -q '"ok":true'; check "nouveau mot de passe" $?
fi

printf '\n=== RÉSULTAT : %d OK / %d ÉCHEC ===\n' "$PASS" "$FAIL"
rm -f "$JAR"
[ "$FAIL" = "0" ]
