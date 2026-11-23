# Authentification web — Phase 1 · Lot 3

> État : **livré et prouvé** (test de bout en bout 8/8 sur la base Neon réelle, le 2026-11-22).

## 1. Ce qui est implémenté

| Fonctionnalité | Détail |
|---|---|
| Inscription | `POST /api/auth/register` — e-mail + mot de passe + nom |
| Connexion | `POST /api/auth/login` — vérifie le mot de passe, ouvre une session |
| Session | cookie `teu_session` (httpOnly, sameSite=lax) contenant un jeton opaque ; seule son **empreinte SHA-256** est stockée en base |
| Déconnexion | `POST /api/auth/logout` — révoque la session |
| Session courante | `GET /api/auth/me` |
| Mot de passe oublié | `POST /api/auth/password-reset` + `POST /api/auth/password-reset/confirm` |
| Page d'accueil protégée | `/dashboard` — redirige vers `/login` sans session |
| Anti-abus | 5 échecs / 15 min par IP (`login_attempts`) |
| Audit | chaque action d'auth consignée (`audit_logs`) |

## 2. Choix de sécurité

- **Hachage** : `scrypt` (RFC 7914) — N=16384, r=8, p=1, sel aléatoire 16 octets, clé 64 octets.
  Nativement fourni par Node : **aucune dépendance supplémentaire**.
- **Temps constant** : `timingSafeEqual` pour la comparaison ; en cas d'adresse inconnue, un hachage
  factice est calculé pour ne pas révéler l'existence du compte par le temps de réponse.
- **Anti-énumération** : les réponses inscription / mot de passe oublié sont **identiques**
  que l'adresse existe ou non.
- **Jetons** : `crypto.randomUUID()` + `crypto.randomUUID()` pour la session, `base64url` 32 octets
  pour les jetons de réinitialisation. **Jamais stockés en clair** (empreinte SHA-256).
- **Validation** : Zod (e-mail normalisé en minuscules, mot de passe 8–128 caractères avec au moins
  une lettre et un chiffre).
- **Changement de mot de passe** : toutes les sessions existantes sont révoquées.

## 3. Identifiants d'accès

Les secrets ne sont **pas** stockés dans le code :

| Variable | Rôle | État |
|---|---|---|
| `DATABASE_URL` | base (poolée) | ✅ Neon |
| `DATABASE_URL_UNPOOLED` | migrations | ✅ Neon |
| `SESSION_SECRET` | **réservé** — les jetons de session sont stockés en empreinte, sans signature | ⬜ non requis |
| `ENCRYPTION_KEY` | chiffrement AES-256-GCM des secrets (Jumia, 2FA) | ⬜ Lot 4/5 |

## 4. Preuves

```
bash scripts/auth-smoke.sh http://localhost:3000
=== RÉSULTAT : 8 OK / 0 ÉCHEC ===
```

Couvert : inscription, session, déconnexion, connexion, mauvais mot de passe refusé,
protection de `/dashboard`, réinitialisation complète, nouveau mot de passe fonctionnel.

Tests unitaires : `src/lib/__tests__/password.test.ts`, `crypto.test.ts`, `validation.test.ts`.

## 5. Limites connues (honnête)

- **Aucun e-mail n'est encore envoyé** : le service d'e-mail n'est pas configuré. En développement,
  l'API renvoie `devToken` pour permettre le test (absent en production).
- **2FA** : ✅ livré et prouvé — voir [`docs/securite-2fa.md`](securite-2fa.md).
- **Vérification d'e-mail** : non mise en place (un compte peut se connecter immédiatement).
