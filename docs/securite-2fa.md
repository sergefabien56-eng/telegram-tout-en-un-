# Double authentification (2FA TOTP) — Lot « finitions »

> État : **implémenté et prouvé** (test de bout en bout 15/15 sur la base Neon réelle, le 2026-11-23).

## 1. Ce qui est implémenté

| Fonctionnalité | Détail |
|---|---|
| Secret TOTP | généré côté serveur (`otplib`, Base32, 20 octets), stocké **chiffré** AES-256-GCM |
| Applications compatibles | Google Authenticator, Authy, FreeOTP, 2FAS… (TOTP RFC 6238, SHA-1, 6 chiffres, 30 s) |
| Vérification | fenêtre ±1 pas (30 s) pour absorber le décalage d'horloge |
| Codes de secours | 8 codes `ABCD-EFGH` fournis **une seule fois** ; seules leurs empreintes SHA-256 sont conservées ; usage unique |
| Activation | paramétrage en 2 temps : QR + clé manuelle → confirmation par un code → activation |
| Connexion | `/api/auth/login` renvoie `{requiresTwoFactor, challenge}` ; page `/two-factor?challenge=…` |
| Défi de connexion | jeton signé HMAC-SHA256, **usage unique**, TTL 5 minutes |
| Désactivation | exige le mot de passe du compte |
| Audit | `auth.two_factor_setup_started`, `auth.two_factor_enabled`, `auth.two_factor_disabled`, `auth.two_factor_failed`, `auth.login` |

## 2. Parcours utilisateur

```
/login ──mot de passe correct──▶ { requiresTwoFactor: true, challenge }
   └─▶ /two-factor?challenge=… ──code TOTP ou code de secours──▶ session ouverte → /dashboard
```

Sans 2FA activée, le parcours reste inchangé (session ouverte immédiatement).

## 3. Choix de sécurité

- Le secret n'est **jamais** stocké en clair ni renvé après l'activation (seule l'étape de paramétrage le renvoie).
- Les codes de secours sont stockés en SHA-256 ; la normalisation (casse, espaces, tirets) est appliquée avant hachage.
- Le défi est signé avec `SESSION_SECRET` et porte une expiration ; il ne peut pas être réutilisé.
- La désactivation est impossible sans le mot de passe : un attaquant déjà connecté ne peut pas « retirer » la 2FA.
- La fenêtre de tolérance est limitée (±1 pas) : au-delà, le code est refusé.

## 4. API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/auth/2fa/status` | `{ enabled }` |
| POST | `/api/auth/2fa/setup` | démarre le paramétrage → `{ secret, uri, qrDataUrl }` |
| POST | `/api/auth/2fa/confirm` | confirme par un code à 6 chiffres → active + codes de secours |
| POST | `/api/auth/2fa/disable` | désactive (body : `{ password }`) |
| POST | `/api/auth/2fa/verify` | vérifie le second facteur (body : `{ challenge, code }`) |

Toutes ces routes exigent une session (sauf `verify`, qui n'exige que le défi).

## 5. Preuves

```bash
bash scripts/two-factor-smoke.sh http://localhost:3000
=== RÉSULTAT : 15 OK / 0 ÉCHEC ===
```

Couvert : état initial, génération du secret + QR, mauvais code refusé, activation, 8 codes de secours,
connexion interrompue par la 2FA, second facteur accepté, session établie, code de secours à usage unique
(1er usage accepté, 2e refusé), désactivation par mot de passe.

Tests automatisés : `src/lib/__tests__/totp.test.ts` (génération, fenêtre ±1, refus, codes de secours,
défi signé/falsifié) et `src/lib/__tests__/two-factor.integration.test.ts` (flux complet sur base réelle).

## 6. Données

Colonnes ajoutées à `users` (migration `drizzle/0003_strange_adam_destine.sql`) :

| Colonne | Type | Contenu |
|---|---|---|
| `two_factor_secret_enc` | text | secret chiffré (null si non paramétré) |
| `two_factor_recovery_codes` | jsonb | empreintes SHA-256 des codes encore valides |
| `two_factor_confirmed_at` | timestamptz | date d'activation |
| `two_factor_enabled` | boolean | interrupteur |

## 7. Limites honnêtes

- **Pas de vérification d'e-mail** au moment de l'activation : la confirmation repose sur le code TOTP,
  ce qui prouve la possession du téléphone mais pas l'identité de l'adresse.
- **Pas de récupération de compte** au-delà des codes de secours : si l'utilisateur perd son téléphone
  **et** ses codes, seul un administrateur peut réinitialiser (opération manuelle en base, tracée).
- **Une seule méthode 2FA** : pas encore de clé de sécurité (WebAuthn) ni de notification de confirmation.
- La 2FA protège la **connexion web** ; la liaison Telegram suit déjà sa propre vérification `initData`.
