#!/usr/bin/env bash
# Test de bout en bout de la double authentification (2FA TOTP).
# Usage : bash scripts/two-factor-smoke.sh [base_url]
# Prérequis : base Neon réelle, DATABASE_URL dans l'environnement.
set -uo pipefail

BASE="${1:-http://localhost:3000}"
EMAIL="2fa$(date +%s)@exemple.ci"
PASSWORD="MotDePasse123"
JAR="$(mktemp)"
PASS=0
FAIL=0

step() { printf '\n=== %s ===\n' "$1"; }
check() {
  if [ "$2" = "0" ]; then echo "OK   : $1"; PASS=$((PASS+1)); else echo "ÉCHEC: $1"; FAIL=$((FAIL+1)); fi
}
json() { sed -n '1p' | tr -d '\r'; }

step "1. Inscription d'un compte de test"
REGISTER=$(curl -s -c "$JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"Test 2FA\"}")
CODE=$(echo "$REGISTER" | tail -n1)
echo "$REGISTER" | head -n-1
[ "$CODE" = "201" ]; check "inscription -> 201" $?

step "2. État initial : 2FA désactivée"
STATUS=$(curl -s -b "$JAR" "$BASE/api/auth/2fa/status")
echo "$STATUS"
echo "$STATUS" | grep -q '"enabled":false'; check "2FA désactivée au départ" $?

step "3. Démarrage du paramétrage (secret + QR)"
SETUP=$(curl -s -b "$JAR" -X POST "$BASE/api/auth/2fa/setup")
echo "$SETUP" | head -c 400; echo
SECRET=$(echo "$SETUP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j?.data?.secret??"")})')
QR=$(echo "$SETUP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j?.data?.qrDataUrl?"ok":"")})')
[ -n "$SECRET" ]; check "secret Base32 fourni" $?
[ "$QR" = "ok" ]; check "QR code PNG fourni" $?

TOKEN=$(node --input-type=module -e "import {generateSync} from 'otplib';console.log(generateSync({secret:'$SECRET',digits:6,period:30}))")
echo "code TOTP calculé : $TOKEN"

step "4. Mauvais code -> refus"
BAD=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/2fa/confirm" \
  -H 'Content-Type: application/json' -d '{"code":"000000"}')
[ "$BAD" = "401" ] || [ "$BAD" = "400" ]; check "mauvais code refusé ($BAD)" $?

step "5. Bon code -> activation"
CONFIRM=$(curl -s -b "$JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/2fa/confirm" \
  -H 'Content-Type: application/json' -d "{\"code\":\"$TOKEN\"}")
CCODE=$(echo "$CONFIRM" | tail -n1)
echo "$CONFIRM" | head -c 300; echo
[ "$CCODE" = "200" ]; check "activation -> 200" $?
RECOVERY=$(echo "$CONFIRM" | head -n-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(Array.isArray(j?.data?.recoveryCodes)?j.data.recoveryCodes.length:0)}catch{console.log(0)}})')
[ "$RECOVERY" = "8" ]; check "8 codes de secours renvoyés" $?

step "6. État : 2FA activée"
STATUS2=$(curl -s -b "$JAR" "$BASE/api/auth/2fa/status")
echo "$STATUS2"
echo "$STATUS2" | grep -q '"enabled":true'; check "2FA activée" $?

step "7. Déconnexion puis reconnexion"
curl -s -b "$JAR" -X POST "$BASE/api/auth/logout" >/dev/null
LOGIN=$(curl -s -c "$JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
LCODE=$(echo "$LOGIN" | tail -n1)
echo "$LOGIN" | head -c 300; echo
echo "$LOGIN" | head -n-1 | grep -q 'requiresTwoFactor'; check "login signale requiresTwoFactor" $?
CHALLENGE=$(echo "$LOGIN" | head -n-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j?.data?.challenge??"")}catch{console.log("")}})')

step "8. Vérification du second facteur"
VERIFY=$(curl -s -c "$JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/2fa/verify" \
  -H 'Content-Type: application/json' \
  -d "{\"challenge\":\"$CHALLENGE\",\"code\":\"$TOKEN\"}")
VCODE=$(echo "$VERIFY" | tail -n1)
echo "$VERIFY" | head -c 300; echo
[ "$VCODE" = "200" ]; check "second facteur accepté" $?
ME=$(curl -s -b "$JAR" "$BASE/api/auth/me")
echo "$ME"
echo "$ME" | grep -q "$EMAIL"; check "session établie après 2FA" $?

step "9. Codes de secours à usage unique"
curl -s -b "$JAR" -X POST "$BASE/api/auth/logout" >/dev/null
LOGIN2=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
CH2=$(echo "$LOGIN2" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)?.data?.challenge??"")}catch{console.log("")}})')
RCODE=$(echo "$CONFIRM" | head -n-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)?.data?.recoveryCodes?.[0]??"")}catch{console.log("")}})')
V1=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/2fa/verify" \
  -H 'Content-Type: application/json' -d "{\"challenge\":\"$CH2\",\"code\":\"$RCODE\"}")
curl -s -b "$JAR" -X POST "$BASE/api/auth/logout" >/dev/null
LOGIN3=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
CH3=$(echo "$LOGIN3" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)?.data?.challenge??"")}catch{console.log("")}})')
V2=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/2fa/verify" \
  -H 'Content-Type: application/json' -d "{\"challenge\":\"$CH3\",\"code\":\"$RCODE\"}")
[ "$V1" = "200" ] && [ "$V2" = "401" ]; check "code de secours : 1er usage OK, 2e refusé ($V1/$V2)" $?

step "10. Désactivation (nettoyage)"
LOGIN4=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
CH4=$(echo "$LOGIN4" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)?.data?.challenge??"")}catch{console.log("")}})')
VERIFY2=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/2fa/verify" \
  -H 'Content-Type: application/json' -d "{\"challenge\":\"$CH4\",\"code\":\"$TOKEN\"}")
[ "$VERIFY2" = "200" ]; check "reconnexion complète avant désactivation" $?
DISABLE=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/2fa/disable" \
  -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}")
[ "$DISABLE" = "200" ]; check "désactivation après mot de passe" $?
STATUS3=$(curl -s -b "$JAR" "$BASE/api/auth/2fa/status")
echo "$STATUS3"
echo "$STATUS3" | grep -q '"enabled":false'; check "2FA bien désactivée" $?
rm -f "$JAR"

printf '\n%s\n' "----------------------------------------"
printf 'RÉSULTAT : %d OK, %d échec\n' "$PASS" "$FAIL"
echo "Compte de test à supprimer en base : $EMAIL"
echo "  -> node scripts/cleanup-test-accounts.mjs"
[ "$FAIL" = "0" ]
