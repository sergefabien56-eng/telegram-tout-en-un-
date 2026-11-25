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

### Scripts métier (`scripts/`)

| Script | Rôle |
|---|---|
| `node scripts/backup.mjs` | Sauvegarde SQL complète (schéma + données), `--compress` pour `.gz` |
| `node scripts/restore.mjs <fichier>` | Restauration (`--yes`, `--dry-run`, `--schema`) |
| `node scripts/backup-test.mjs` | **Test de sauvegarde/restauration** sur schéma jetable |
| `node scripts/telegram-setup.mjs` | Déclare le webhook Telegram |
| `node scripts/telegram-bot-setup.mjs` | Commandes + bouton de menu du bot |
| `node scripts/shops-smoke.mjs <url>` | 12 vérifications API boutiques |
| `node scripts/render-deploy.mjs` | Déploiement Render piloté par API |

> Les sauvegardes partent dans `backups/` (**hors git**) et ne doivent jamais être
> commitées ni envoyées sur un dépôt public.

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

## 12. Interface, santé & sauvegarde

- **Sidebar** 8 sections (A–H) dépliables, filtrées par permission ; drawer mobile.
- **Barre supérieure** : sélecteur de boutique (cookie `teu_shop`), recherche globale,
  notifications, interrupteur **clair/sombre**, profil.
- **Notifications** : page `/notifications` (historique réel + préférences par canal/type).
- **Santé** : page `/sante` — volumétrie réelle, dernières syncs, journal d'audit.
- **Sauvegarde** : `node scripts/backup.mjs` puis `node scripts/backup-test.mjs`
  (14/14 tables restaurées à l'identique).

```
npm test                                  # 73 tests (Vitest)
node scripts/backup-test.mjs              # sauvegarde → restauration → comparaison
```

## 13. Règles du projet

- Aucune donnée fictive en production ; démo uniquement en `dev`/`staging`.
- Inconnu → `—` (jamais `0`) ; absent → « Bientôt disponible ».
- Montants en entiers + devise ; dates en UTC.
- Permissions vérifiées **côté serveur**.
- Voir [`PROJET.md`](PROJET.md) et [`docs/`](docs/index.md).

## 14. Diagnostic multiboutique

L'écran **Administration → Diagnostic des boutiques** (`/admin/diagnostics`)
prouve, pour chaque boutique, que les données affichées viennent bien de son
Seller Center Jumia : état de connexion factuel, volumétrie source ↔ locale,
écarts chiffrés, anomalies qualifiées (mélange, doublon, péremption,
provenance absente), test réseau du compte vendeur. L'action « Resynchroniser »
produit une **sauvegarde** de la base avant toute écriture et journalise
l'opération.

- Audit complet : [`docs/audit-multiboutique.md`](docs/audit-multiboutique.md).
- Rapport par l'API : `GET /api/admin/diagnostics?deep=1`.
- Contrôle planifié quotidien (0 FCFA, cron GitHub Actions) :
  `POST /api/cron/coherence`, protégé par `CRON_SECRET`. Chaque passage
  compare les **montants** des commandes et des relevés au centime et écrit
  l'instantané du jour : une dérive se voit alors dans le temps.

### 14 bis. Alertes de cohérence

Quand un contrôle détecte une anomalie **critique**, un **avertissement**
actionnable ou une **dérive**, le vendeur est prévenu — sans qu'il ait à
ouvrir le diagnostic.

- **Deux canaux** : notification dans l'application (cloche, page
  `/notifications`) et message **Telegram** direct.
- **Préférences respectées** : un canal ou un type désactivé n'est jamais
  envoyé.
- **Une seule alerte** par boutique, par jour et par problème : la clé de
  déduplication est unique **par destinataire** (le propriétaire et le
  gestionnaire d'une même boutique sont tous les deux prévenus).
- **Traçable** : chaque envoi est écrit dans `notifications` avec son canal
  (`web` / `telegram`) et son statut (`sent` / `failed`).
- **Référence locale** : la dérive est mesurée par rapport à la **médiane
  des 7 contrôles précédents** (et non à la veille), sur **180 jours**
  d'historique — les variations saisonnières ne déclenchent donc pas de
  fausse alerte. Seuil : **20 %**.
