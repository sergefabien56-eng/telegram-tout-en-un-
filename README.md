# TOUT EN UN BUSINESS MANAGER

ERP/SaaS de gestion commerciale **multi-boutiques Jumia**, accessible sur **Telegram** (bot + Mini App) et sur le **web** (PC, tablette, téléphone). Une seule application, une seule base de données, les mêmes permissions.

> **Phase actuelle : Phase 1 — Fondations et interface.** Les modules non livrés sont marqués « Bientôt disponible ». Aucune donnée fictive en production.

---

## 1. Stack

| Domaine | Choix |
|---|---|
| Application | **Next.js (App Router)** + **React 19** |
| Langage | **TypeScript strict** |
| Base de données | **PostgreSQL** via **Drizzle ORM** |
| UI | **Tailwind CSS** + **shadcn/ui** (progressif) + **Lucide** |
| Tests | **Vitest** (unitaires/intégration) + **Playwright** (E2E) |
| CI/CD | **GitHub Actions** |
| Hébergement (prévu) | **Render** ou **Netlify** (gratuit, usage commercial autorisé) |
| Base (prévue) | **Neon** (PostgreSQL gratuit) |
| Fichiers (prévu) | **Cloudflare R2** |
| Notifications | **Telegram Bot API** |

Détails et justifications : [`docs/architecture.md`](docs/architecture.md) · [`docs/hebergement-gratuit.md`](docs/hebergement-gratuit.md).

---

## 2. Prérequis

- **Node.js ≥ 20** (voir `.nvmrc`)
- npm ≥ 10

## 3. Démarrage rapide

```bash
npm install
cp .env.example .env.local     # puis renseigner les variables
npm run dev                    # http://localhost:3000
```

## 4. Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Développement |
| `npm run build` | Build de production |
| `npm run start` | Serve le build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification de types (`tsc --noEmit`) |
| `npm test` | Tests unitaires (Vitest) |
| `npm run e2e` | Tests E2E (Playwright, navigateurs requis) |
| `npm run format` | Prettier |
| `npm run db:generate` | Génère une migration Drizzle |
| `npm run db:migrate` | Applique les migrations |

## 5. Variables d'environnement

Copier `.env.example` → `.env.local`. **Jamais de secret versionné.** Variables principales :

```
DATABASE_URL=...            # PostgreSQL
ENCRYPTION_KEY=...          # 32 octets en base64 (AES-256-GCM)
SESSION_SECRET=...
JWT_SECRET=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
R2_*=...                    # Stockage documents
GEMINI_API_KEY=...          # MIMI (optionnel)
```

La page d'accueil affiche **l'état réel** de la configuration (jamais les valeurs).

## 6. Structure

```
src/
  app/                 # routes (App Router)
    page.tsx           # accueil (état réel + modules)
    api/health/        # santé (présences de config)
  components/          # composants UI
  config/env.ts        # validation Zod de l'environnement
  lib/                 # utilitaires (money, cn, ...)
  navigation.config.ts # navigation unique Web + Mini App
docs/                  # documentation de conception (Phase 0)
e2e/                   # tests Playwright
```

## 7. Tests

```bash
npm test          # Vitest
npm run e2e       # Playwright (npx playwright install au préalable)
```

## 8. Base de données (Neon)

Le projet est branché sur **Neon** (PostgreSQL serverless, offre gratuite) via `neon.ts` :

```bash
# Provisionne les services déclarés dans neon.ts et récupère les variables dans .env.local
npx neon@latest deploy

# Applique les migrations (utilise DATABASE_URL_UNPOOLED)
npm run db:migrate

# Vérifie la base de bout en bout (tables + lecture/écriture)
node scripts/db-smoke.mjs
```

- **`DATABASE_URL`** (poolée) → utilisée par l'application (serverless).
- **`DATABASE_URL_UNPOOLED`** (directe) → utilisée par les migrations Drizzle.
- La config de lien locale est dans `~/.neon` et `~/.config/neon` (ignorés par Git).

## 9. Authentification

```bash
npm run dev
# inscription  → POST /api/auth/register   (ou page /register)
# connexion    → POST /api/auth/login
# session      → GET  /api/auth/me
# déconnexion  → POST /api/auth/logout
# mot de passe oublié → POST /api/auth/password-reset
```

- Hachage **scrypt** (aucune dépendance externe), comparaison à temps constant.
- Cookie `teu_session` httpOnly ; seule l'empreinte SHA-256 du jeton est stockée.
- Réponses inscription / réinitialisation identiques (anti-énumération).
- Anti-abus : 5 échecs / 15 min par IP ; journal d'audit `audit_logs`.
- Voir `docs/auth.md`.

## 10. Telegram

```bash
# 1. Renseigner TELEGRAM_BOT_TOKEN et TELEGRAM_WEBHOOK_SECRET dans .env.local
# 2. Configurer le webhook (nécessite une URL HTTPS publique)
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... APP_URL=https://... node scripts/telegram-setup.mjs

# Tests (serveur lancé avec les variables Telegram)
bash scripts/telegram-smoke.sh http://localhost:3000 "$TELEGRAM_WEBHOOK_SECRET"
```

- Webhook `POST /api/telegram/webhook` (secret vérifié à temps constant).
- Liaison : `POST /api/telegram/link-code` → code 8 caractères, 10 min, usage unique → `/lier CODE`.
- Mini App `/mini-app` : `initData` vérifié (HMAC-SHA256) puis session posée.
- Voir `docs/telegram.md`.

## 11. Boutiques & permissions

```bash
node scripts/shops-smoke.mjs http://localhost:3000
```

- Rôles : `owner` (tout), `manager`, `stock`, `accountant`, `assistant`.
- Permissions `module:action` vérifiées **côté serveur** (`src/lib/permissions.ts`).
- Invitation par e-mail : ajout immédiat si le compte existe, sinon invitation en attente.
- Voir `docs/boutiques.md`.

## 12. Règles du projet

- Aucune donnée fictive en production ; démo uniquement en `dev`/`staging`.
- Inconnu → `—` (jamais `0`) ; absent → « Bientôt disponible ».
- Montants en entiers + devise ; dates en UTC.
- Permissions vérifiées **côté serveur**.
- Voir [`PROJET.md`](PROJET.md) et [`docs/`](docs/index.md).
