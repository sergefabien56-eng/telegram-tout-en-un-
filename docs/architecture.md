# Architecture — TOUT EN UN BUSINESS MANAGER

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Statut** : À valider par le propriétaire avant tout code applicatif
- **Périmètre** : architecture générale, décisions, flux, Telegram + Web, évolution

> Règle de Phase 0 : ce document ne contient **aucune donnée fictive** et ne promet que ce que les services gratuits ou les API officielles permettent réellement (voir `hebergement-gratuit.md` et `jumia-integration.md`).

---

## 1. Principes directeurs (issus du cahier des charges)

| Règle | Conséquence architecture |
|---|---|
| **R1 Vérité / zéro simulation** | Aucun mock en production ; toute fonctionnalité absente est absente ou marquée « Bientôt disponible » ; valeur inconnue = `—` ; chaque donnée est taguée `réelle` / `estimée` / `indisponible`. |
| **R2 Construction propre** | TypeScript strict, modules étanches, migrations versionnées, tests, docs. |
| **R3 Intégrité financière** | Montants en entiers (unité mineure), devise obligatoire, taux de change datés, dates UTC, affichage au fuseau configuré. |
| **R4 Sécurité** | Secrets serveur, AES-256-GCM au repos, Zod, permissions serveur, rate limiting, cookies sécurisés, en-têtes, audit, 2FA. |
| **R5 Budget 0 FCFA** | Aucun service payant activé automatiquement ; comportement dégradé explicite quand un quota est atteint ; reprise possible ; exportable. |

---

## 2. Vue d'ensemble

```
┌─────────────────────┐        ┌──────────────────────┐
│  Telegram (client)  │        │  Navigateur (Web)    │
│  - Bot / commandes  │        │  Chrome/Safari/...   │
│  - Mini App (WebView)│       │  PC / tablette / mob │
└─────────┬───────────┘        └───────────┬──────────┘
          │ HTTPS (webhook)                │ HTTPS
          ▼                                ▼
┌───────────────────────────────────────────────────────┐
│            Next.js (App Router) — une seule appli      │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Route      │  │ Server       │  │ UI partagée    │  │
│  │ Handlers   │  │ Actions      │  │ (composants)   │  │
│  └─────┬──────┘  └──────┬───────┘  └────────┬───────┘  │
│        └────────────────┼───────────────────┘          │
│                         ▼                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Modules métier (services internes, pas de SQL    │  │
│  │ cross-module) — auth, shops, sync, products,     │  │
│  │ orders, inventory, invoices, finance, mimi, ...  │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│  ┌──────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Drizzle ORM  │  │ Stockage   │  │ Files de tâches│  │
│  │ (repositories)│  │ objets R2  │  │ (PostgreSQL)   │  │
│  └──────┬───────┘  └─────┬──────┘  └───────┬────────┘  │
└─────────┼────────────────┼─────────────────┼───────────┘
          ▼                ▼                 ▼
   ┌────────────┐   ┌────────────┐   ┌──────────────────┐
   │ PostgreSQL │   │ Cloudflare │   │ Déclencheur      │
   │ (Neon/     │   │ R2         │   │ (cron GitHub     │
   │  Supabase) │   │ (factures, │   │  Actions ou hôte)│
   └────────────┘   │  images)   │   └──────────────────┘
                    └────────────┘
          │
          ▼
   ┌────────────────────────────────────┐
   │ Sortant : Bot Telegram (notifications)│
   └────────────────────────────────────┘
```

**Point clé** : Telegram et le Web sont deux *clients* de la **même** application. Il n'y a qu'une seule base de données, une seule API, un seul jeu de permissions.

---

## 3. Décisions techniques

| Composant | Choix retenu (Phase 1) | Justification (coût / limites / remplaçabilité) |
|---|---|---|
| Langage | **TypeScript strict** | Exigence R2 ; typage des outils MIMI et des montants. |
| Framework | **Next.js App Router** | RSC + Route Handlers ; un rendu adapté Mobile (Mini App) et Desktop ; déployable sur plusieurs hébergeurs. |
| ORM | **Drizzle ORM** | Léger, SQL explicite, migrations versionnées, pas de magie ; portable vers un autre hébergeur PostgreSQL. |
| Base de données | **PostgreSQL** (Neon gratuit en primaire, Supabase en alternatif) | Voir `hebergement-gratuit.md` ; choisi pour quota/remplaçabilité, pas pour une fonction propriétaire. |
| Auth | **Maison** (sessions web + initData Telegram vérifiée) | Évite une dépendance Auth propriétaire ; permet la liaison sécurisée des comptes. |
| UI | **Tailwind CSS + shadcn/ui + Lucide** | Design system maîtrisé, composants accessibles, icônes libres. |
| Stockage documents | **Cloudflare R2** (10 Go, egress gratuit) ; alternatif Supabase Storage (1 Go) | Factures officielles, images produits. |
| Files de tâches | **PostgreSQL** (table `jobs`) | Aucun worker permanent requis ; reprise après interruption. |
| Planificateur | **Cron GitHub Actions** (ou cron hôte) qui appelle une route protégée | Gratuit (2 000 min Linux/mois), sans serveur permanent. |
| CI/CD | **GitHub Actions** | 2 000 minutes Linux/mois gratuites ; public = illimité. |
| IA (MIMI) | **Fournisseur branchable**, Gemini gratuit par défaut | Voir `mimi.md` ; jamais d'appel payant automatique. |

### 3.1 Pourquoi pas « Vercel + Supabase » par défaut ?

Ce sont de bonnes technologies, mais **leurs conditions gratuites ne conviennent pas à un usage commercial** :

- **Vercel Hobby** : 100 Go, 1 M d'invocations, 4 CPU-h/mois — mais **réservé à un usage personnel et non commercial** ; tout usage commercial exige Pro (20 $/siège/mois). [1](https://zplatform.ai/guides/is-vercel-free/) [5](https://sofast.host/vercel-vs-netlify.html)
- **Supabase Free** : 500 Mo, 5 Go + 5 Go cached d'egress, 50 000 MAU — mais **pause après 7 jours de faible activité** et **aucune sauvegarde automatique**. [2](https://park23.io/insights/supabase-free-tier-limits/) [3](https://selfhost.dev/blog/supabase-pricing-explained/)

On les conserve comme **alternatives** (Vercel si usage non commercial/avitamine ; Supabase pour son Auth/Realtime si besoin), mais la stack primaire est choisie pour l'usage commercial gratuit (détail en `hebergement-gratuit.md`).

---

## 4. Découpage modulaire

Règle : **un module n'accède pas directement aux tables métier d'un autre module** ; il appelle son service public (ex. `ordersService`). Chaque module expose :

```
src/modules/<module>/
  schema.ts        # tables Drizzle (si le module possède des tables)
  repository.ts    # accès SQL local au module
  service.ts       # logique métier publique
  validators.ts    # schémas Zod des entrées
  types.ts
  __tests__/
```

| Module | Responsabilité principale |
|---|---|
| `auth` | Comptes web, sessions, 2FA, liaison Telegram, permissions de base |
| `users` | Profils, préférences, notifications choisies |
| `shops` | Boutiques, membres, rôles, statuts |
| `telegram` | Bot, webhook, notifications, Mini App auth |
| `jumia-integration` | Connecteurs officiels, jetons, mapping |
| `sync` | Orchestration des synchronisations, reprises, verrous |
| `products` | Catalogue, prix, images, doublons |
| `orders` | Commandes, lignes, statuts, anomalies |
| `inventory` | Stocks, mouvements, réservations, inventaires |
| `warehouses` | (P7) Entrepôts, emplacements, transferts |
| `invoices` | Factures officielles/internes, empreintes, documents |
| `finance` | Achats, dépenses, commissions, marges, rapprochement |
| `purchasing` | Fournisseurs, commandes fournisseurs |
| `returns` | Retours, remboursements, réintégration |
| `reports` | Indicateurs, exports, consolidations |
| `notifications` | Files et préférences de notifications |
| `mimi` | Assistante IA, outils typés, Product Creator |
| `jobs` | File de tâches générique |
| `monitoring` | Santé, quotas, erreurs |
| `audit` | Journal d'audit |

---

## 5. Architecture d'accès : Telegram + Web

### 5.1 Parité fonctionnelle

Un **seul** arbre de routes et un **seul** jeu de composants. La différence est une couche de présentation :

- **Web** : layout avec menu latéral large + barre supérieure (desktop), navigation bottom-bar (mobile).
- **Mini App** : layout compact, bottom navigation, theme Telegram (couleurs du client via SDK), safe-area.

La configuration de navigation est **unique** : `navigation.config.ts` (voir `design-system.md`).

### 5.2 Authentification Web

1. Email + mot de passe (hachage **Argon2id** / `scrypt`, jamais MD5/SHA brut).
2. Session : cookie `httpOnly`, `Secure`, `SameSite=Lax`, durée limitée + rotation.
3. **2FA** (TOTP) pour les rôles sensibles (propriétaire, comptable) — activable.
4. Tentatives limitées (rate limiting + `login_attempts`).
5. Aucun secret dans le code : variables d'environnement serveur.

### 5.3 Authentification Telegram (Mini App)

1. Le client envoie le `initData` brut au serveur (**jamais** `initDataUnsafe` comme preuve).
2. Le serveur vérifie `hash = HMAC-SHA256(data_check_string, HMAC-SHA256("WebAppData", bot_token))` en comparaison à temps constant, et vérifie `auth_date` (fraîcheur). [1](https://core.telegram.org/bots/webapps)
3. On récupère un `telegram_id` **prouvé**. S'il est lié à un utilisateur → session JWT courte.
4. S'il n'est pas lié → écran de liaison sécurisée (voir 5.4).

### 5.4 Liaison de comptes (sécurisée)

- L'utilisateur connecté sur le **Web** génère un **code de liaison à usage unique** (ex. 8 caractères, expiration 10 min, usage unique, taux limité).
- Dans Telegram, il envoie `/lier <code>` au bot.
- Le serveur vérifie le code puis associe `telegram_id ↔ user_id`.
- Une confirmation est affichée des deux côtés ; le code est invalidé immédiatement.
- **Jamais** un simple identifiant Telegram fourni par le navigateur ne suffit.

### 5.5 Bot Telegram

- **Commandes** : `/start`, `/tableau`, `/boutiques`, `/commandes`, `/stocks`, `/finance`, `/mimi`, `/rapport`, `/notifications`, `/lier`, `/aide`.
- **Notifications** : seulement celles choisies par l'utilisateur, regroupées, dans les limites Telegram (≈1 msg/s par chat, 20/min par groupe, ≈30/s global). [1](https://www.conferbot.com/limits/telegram)
- Le bot **n'est pas** l'application : il ouvre la Mini App pour toute action riche.

---

## 6. Flux de données

### 6.1 Synchronisation Jumia (exemple)

```
Déclencheur (cron / manuel / webhook)
  → syncService.createJob(shopId, resource)        [statut: queued]
  → jobs.run() prend le lot (verrou par boutique+ressource)
  → pagination complète (next token / offset)       [point de reprise persisté]
  → upsert idempotent (clé externe unique)
  → mise à jour sync_profiles.cursor / last_success
  → sync_events (historique) + audit
  → notification si nouveau/erreur
  → reprise automatique sur erreur transitoire (backoff exponentiel, Retry-After)
```

Une boutique en erreur **ne bloque jamais** les autres (lots indépendants).

### 6.2 Commande → notification

```
Webhook Jumia (ou polling) → order upsert → statut
  → notificationsService.plan(user_id, type, ...)
  → file → envoi Bot (respect préférences + limites)
  → tracing (sent_at / erreur)
```

### 6.3 Audit

Toute action sensible (connexion, modification prix/stock, changement de rôle, export, suppression) écrit dans `audit_logs` : utilisateur, boutique, action, entité, ancienne/nouvelle valeur, résultat, IP, user-agent, date UTC.

---

## 7. Tâches sans worker permanent

Contrainte : **pas de serveur 24 h/24** (budget 0). Architecture retenue :

- Table `jobs` dans PostgreSQL : `type`, `payload`, `status`, `run_at`, `locked_at`, `locked_by`, `attempts`, `idempotency_key`.
- **Exécutant** : une route serverless protégée (`/api/cron/run`) appelée par un cron (GitHub Actions) toutes les X minutes ; elle traite **un lot borné** puis s'arrête.
- **Idempotence** : chaque traitement est rejouable sans duplication (clés externes uniques + `idempotency_key`).
- **Reprise** : en cas d'interruption, le verrou expire et le lot est retenté.
- **Limite honnête** : pas de synchronisation « continue » en temps réel. La fraîcheur dépend de la fréquence du cron. On affichera la **date d'actualisation** et l'**état de sync** sur le tableau de bord.
- Les webhooks Jumia (si activés) permettent un **déclenchement événementiel** sans polling permanent.

---

## 8. Sécurité (design)

- **Secrets** : uniquement côté serveur (env). Aucun secret dans les logs.
- **Chiffrement au repos** : jetons Jumia et 2FA chiffrés **AES-256-GCM** ; la clé de chiffrement est **séparée de la base** (variable d'environnement / gestionnaire). Structure : `ciphertext || iv || tag`.
- **Validation** : Zod sur **toutes** les entrées (API, formulaires, webhooks, CSV).
- **Permissions** : vérifiées **côté serveur** sur chaque requête, par module/action/boutique ; le front ne fait que masquer.
- **Isolation boutiques** : filtre `shop_id` obligatoire côté serveur (défense en profondeur : RLS possible, voir `database.md`).
- **CSRF** : jetons pour les actions mutantes web (SameSite + double validation).
- **Rate limiting** : par IP et par compte (connexion, API, webhooks).
- **Cookies** : `HttpOnly`, `Secure`, `SameSite`, domaine restreint.
- **En-têtes** : `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP adaptée.
- **2FA** : TOTP pour rôles sensibles.
- **Audit** : journal complet (voir 6.3).

---

## 9. Intégrité financière

- Montants en **entiers**, unité mineure. Pour le **FCFA (XOF)**, la subdivision officielle est **0 décimale** : on stocke donc des **FCFA entiers** (`minor_unit = 0`). Pour d'autres devises (EUR/USD), on stocke les centimes.
- Chaque montant porte sa **devise** (ISO 4217) ; jamais d'addition de devises sans conversion explicite.
- **Taux de conversion datés** (`exchange_rates`) et conservés ; les calculs gardent le taux utilisé.
- Dates en **UTC** en base ; affichage au fuseau configuré (défaut `Africa/Abidjan`).
- Formules et arrondis documentés en `formules-financieres.md`.

---

## 10. Observabilité

- Logs **structurés** (JSON), sans secret, avec `request_id`, `shop_id`, `user_id`.
- Suivi des erreurs (route dédiée + table `monitoring_events`), santé base, état des files.
- **Tableau de quotas** : consommation estimée vs limites gratuites ; alerte avant seuil.
- Tableau de bord « Administration → Santé » (réel, pas simulé).

---

## 11. Stratégie d'évolution (zéro réécriture métier)

On isole le métier derrière des **interfaces** (ports) :

| Port | Implémentation Phase 1 | Remplaçable par |
|---|---|---|
| `DatabaseProvider` | PostgreSQL via Drizzle | autre PG, autre ORM |
| `StorageProvider` | Cloudflare R2 | S3, Supabase Storage, disque |
| `QueueProvider` | Table `jobs` + cron | worker permanent, BullMQ, SQS |
| `NotifierProvider` | Bot Telegram | email/SMS, webhooks |
| `AiProvider` | Gemini gratuit | Groq, OpenRouter, local |

**Migration future prévue** (sans changer le métier) :

1. Export complet `pg_dump` + fichiers R2.
2. VPS / serveur dédié → Docker Compose (app + PostgreSQL).
3. Caddy (HTTPS automatique) + domaine personnalisé.
4. Worker permanent (remplace le cron) + file de tâches inchangée.
5. Stockage externe + sauvegardes externalisées.
6. Vérification : import, comptes, historiques, jetons externes, continuité.

---

## 12. Limites connues à la Phase 0

- Pas de worker permanent : pas de temps réel garanti (voir §7).
- API Jumia : surface officielle à qualifier par marché (voir `jumia-integration.md`).
- Quotas gratuits : à surveiller (voir `hebergement-gratuit.md`).
- IA : quota gratuit limité et variable ; MIMI dégrade proprement si le quota est atteint (voir `mimi.md`).

---

## 13. Questions ouvertes

Voir `plan-phase-1.md` § « Questions ouvertes » (liste consolidée des décisions attendues).
