# MÉMOIRE DU PROJET — TOUT EN UN BUSINESS MANAGER

> Fichier de référence persistant. Il résume le projet pour permettre une reprise rapide,
> même après une nouvelle session. **Les documents détaillés vivent dans `docs/`.**

- **Nom** : TOUT EN UN BUSINESS MANAGER (nom court : **TOUT EN UN**)
- **Créé le** : 22/11/2026
- **Statut** : **Phase 0 validée** · **Phase 1 terminée et déployée** (Lots 1 à 8) · **Finitions en cours** (2FA TOTP livrée)
- **Budget** : **0 FCFA** — aucun service payant activé, aucune carte, aucun domaine
- **Dépôt GitHub** : https://github.com/sergefabien56-eng/telegram-tout-en-un-.git

---

## 1. Le projet en une phrase

Un ERP/SaaS de gestion commerciale (type ERP) pour gérer **plusieurs dizaines de boutiques Jumia** depuis **une seule interface**, accessible à la fois :

1. dans **Telegram** (bot officiel + Mini App) ;
2. dans un **navigateur web** (PC, tablette, téléphone).

Les deux accès utilisent **la même application, la même base de données, les mêmes permissions**.

## 2. Modules visés (P1 → P8)

Commandes · Produits · Stocks · Factures officielles · Finances · Achats · Fournisseurs · Retours · Entrepôts · Clients · Rapports · Notifications · Synchronisations · **MIMI** (IA commerciale) · Automatisation.

Phases : **P1** fondations/interface · **P2** Jumia Connect · **P3** gestion commerciale · **P4** finances · **P5** MIMI · **P6** automatisation · **P7** expansion · **P8** validation finale.

## 3. Règles non négociables (à ne jamais violer)

- **R1 Vérité** : zéro donnée fictive en production ; démo seulement en dev/staging ; pas de bouton décoratif ; absent = « Bientôt disponible » ; inconnu = « — » (jamais `0`) ; données taguées réelle/estimée/indisponible.
- **R2 Propre** : TypeScript strict, modules étanches, migrations versionnées, tests, docs.
- **R3 Finances** : montants en **entiers + devise** ; taux de change **datés** ; dates **UTC** ; FCFA sans décime (entiers).
- **R4 Sécurité** : secrets serveur ; **AES-256-GCM** pour les jetons ; **Zod** ; permissions **côté serveur** ; rate limiting ; cookies sécurisés ; en-têtes ; **audit** ; 2FA.
- **R5 Budget** : rien de payant activé automatiquement ; comportement dégradé si quota atteint ; reprise possible ; exportable ; migration d'hébergeur sans réécrire le métier.

## 4. Décisions techniques (Phase 0)

| Sujet           | Décision                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Application     | **Next.js App Router + TypeScript strict** (une seule appli Web + Mini App)                     |
| ORM / BDD       | **Drizzle ORM + PostgreSQL**                                                                    |
| Hébergement     | **Render ou Netlify (gratuit, commercial autorisé)** — **Vercel écarté** (Hobby non commercial) |
| Base de données | **Neon** (gratuit 1 Go) — **Supabase en alternatif** (pause 7 j, pas de backup)                 |
| Fichiers        | **Cloudflare R2** (10 Go, egress gratuit) — sinon Supabase Storage (1 Go)                       |
| Planificateur   | **cron GitHub Actions** → route serverless ; **pas de worker permanent**                        |
| Tâches          | table `jobs` PostgreSQL (idempotence, reprise, verrous)                                         |
| IA (MIMI)       | **fournisseur branchable**, Gemini gratuit (disponible en CI) ; jamais d'appel payant auto      |
| Auth            | maison : web (Argon2id, sessions, 2FA) + Telegram (initData vérifié HMAC)                       |

## 5. Faits clés vérifiés (22/11/2026 — sources dans `docs/sources.md`)

- **Jumia** : API officielle **Vendor Center GPM/GOP** (OAuth2, multi-boutiques mastershop, **200 req/min, 4 req/s**) + **Seller Center API** (classique). Commissions CI : `Prix = (Prix vendeur + Frais fixe) / (1 − Commission)`, TVA 18 % incluse, ≈ 4–20 %.
- **Vercel Hobby** : 100 Go / 1 M invocations, **non commercial**.
- **Supabase Free** : 500 Mo, 5 Go + 5 Go cached, **pause 7 j**, **sans sauvegarde**.
- **Neon Free** : 1 Go, 100 CU-h/mois, scale-to-zero, 6 h PITR.
- **Render Free** : 750 h/mois, **sleep 15 min**, PG gratuit 30 j.
- **Netlify Free** : 300 crédits/mois, commercial autorisé.
- **Cloudflare R2** : 10 Go, 1 M A, 10 M B, egress gratuit.
- **GitHub Actions** : 2 000 min Linux/mois.
- **Telegram** : webhook HTTPS (ports 443/80/88/8443), `secret_token`, ≈1 msg/s/chat, 20/min/groupe, ≈30/s global ; initData = HMAC-SHA256.
- **Gemini** : gratuit, **disponible en Côte d'Ivoire**, quota limité et variable.

## 6. Avancement

| Phase                           | État                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| **0 — Cadrage**                 | ✅ **Livrée et validée** (9 documents + maquettes)                               |
| **1 — Fondations et interface** | ✅ **Terminée** — Lots 1 à 8 livrés et déployés sur Render · CI verte · build OK |
| 2 à 8                           | ⏳ Non démarrées                                                                 |

**Phase 1 — lots :**

- ✅ L1 Initialisation & qualité (Next.js 15, TS strict, Tailwind, ESLint/Prettier, Vitest, Playwright, CI GitHub Actions, `.env.example`)
- ✅ L2 Base de données & migrations (schéma Drizzle 12 tables + migration `drizzle/0000_*.sql`) · **base Neon connectée** (branche `production`, 12 tables, smoke OK)
- ✅ L3 Auth Web (scrypt, sessions serveur, réinitialisation, anti-abus 5/15 min, audit) · smoke 8/8 sur Neon · détails `docs/auth.md`
- ✅ L4 Telegram/Mini App (webhook + secret, liaison par code à usage unique, initData HMAC vérifié, Mini App) · smoke 8/8 + liaison réelle en base · détails `docs/telegram.md` · **en attente d'un vrai token bot + URL HTTPS publique** (déploiement Lot 8)
- ✅ L5 Boutiques/rôles/permissions (CRUD boutiques, membres, invitations, rôles owner/manager/stock/accountant/assistant, permissions module:action côté serveur) · smoke API 12/12 + 11 tests intégration · détails `docs/boutiques.md`
- ✅ L6 Interface commune (sidebar 8 sections dépliables + drawer mobile, topbar, sélecteur de boutique par cookie, recherche globale, notifications + préférences, **thème clair/sombre**, états « Bientôt disponible ») · 10 tests · détails `docs/design-system.md`
- ✅ L7 Audit/santé/sauvegarde (audit des actions sensibles, page `/sante` sur données réelles, `scripts/backup.mjs` + `restore.mjs`, **test de restauration 14/14 tables**)
- ✅ L8 CI/CD + déploiement gratuit (GitHub Actions lint/tests/build verte, **Render Free en production** : https://tout-en-un-business-manager.onrender.com, HTTPS, webhook Telegram actif, Mini App) · détails `docs/deploiement.md`

- ✅ **Finitions — 2FA TOTP** (double authentification activable : secret chiffré AES-256-GCM, QR + clé manuelle, codes de secours à usage unique, défi de connexion signé 5 min, page `/securite`) · smoke 15/15 local **et** production · détails `docs/securite-2fa.md`
- ✅ **Maquette interactive** : `docs/mockups/interactive.html` (bureau + mobile, bascule de version)

**Déploiement réel** : Render `srv-dc1m8rqfngtc7381n0rg` (Free, frankfurt) · Neon `production` (14 tables) · bot @tout_en_un_business_bot · **0 FCFA**.

## 7. Prochaine action

**Reste à faire (par priorité)** :

1. ~~Actions rapides dans la barre du haut~~ ✅ **livré** (commit `4fb888f`) — « Ajouter une boutique » ouvre une modale réelle ; « Nouvelle commande » porte le badge « Bientôt disponible » (module non branché, R1).
2. ~~Bottom nav + thème Telegram de la Mini App~~ ✅ **livré** (commit `701acc2`) — coquille basse (4 accès + « Plus »), en-tête compact avec retour natif, `themeParams` fusionnés, bascule web ↔ mini (`teu_ui`).
3. ~~Tests E2E complets + accessibilité~~ ✅ **livré** (commit `2b73435`) — contrastes mesurés par un test qui relit `globals.css` (102/102), audits axe-core WCAG 2.1 AA en CI, clavier complet (Échap, piège à focus, retour du focus).
4. ~~Déploiement automatique~~ ✅ **vivant** — secret `RENDER_DEPLOY_HOOK` créé ; le workflow « Déploiement Render » se déclenche **uniquement après une CI verte** et a déjà déployé les commits `bef9701`, `b258d5b`, `d87eef7` (dernier `dep-dc2f39an7ras7389utu0`, live).
5. **CI/E2E** ✅ **verte** — la CI tournait rouge jusque-là ; causes corrigées : stub `SESSION_SECRET` dans `totp.test.ts`, navigateurs Playwright + librairies système, nettoyage des comptes de test (`--attempts`), **bug réel du flux 2FA** (la page lisait `requiresTwoFactor` à la racine au lieu de `data` → redirection vers `/dashboard` sans second facteur), déconnexion qui affichait du JSON, contraste de la nav active (4,47:1 → 5,75:1), 503 lisible si la base est absente. 24 tests E2E + 103 tests unitaires passent.
6. ~~Sauvegarde~~ ✅ **livrée** — export en un clic dans l'appli (**Santé → Télécharger le dump**), script CLI, dump partagé `scripts/lib/dump-sql.mjs`, workflow quotidien optionnel — `.github/workflows/backup.yml` (quotidien 03:37 UTC, dump compressé + checksum, test de restauration le dimanche, artefact 14 j, copie R2 si configuré) ; doc `docs/sauvegarde.md`. Premier dump réel : 14 tables, SHA-256 `91ad6c20…`, restauré à l'identique (`backup-test.mjs` OK), exemplaire sur Google Drive. Le secret GitHub `DATABASE_URL` est en place et **vérifié** (run du 24/11 08:01 UTC réussi).
7. **Accès Vendor Center Jumia** — 🔵 **préparé** : `docs/jumia-acces.md` décrit le pas-à-pas exact (Settings → Applications → Create Application → **Self Authorization** → Generate Token). Il faut créer l'application et fournir `client_id` + `refresh_token` (hors dépôt). Points de vigilance : le refresh token **tourne à chaque appel**, durées non codées en dur, quotas 200 req/min & 4 req/s par mastershop, boutiques à rattacher au mastershop.

**Accès requis (Phase 2)** : `JUMIA_CLIENT_ID`, `JUMIA_REFRESH_TOKEN` (secrets GitHub + Render).

**Sauvegarde** : export en un clic depuis l'appli (bouton sur « Santé »), script CLI `npm run backup`, dump partagé `scripts/lib/dump-sql.mjs`, workflow quotidien optionnel. Le secret GitHub `DATABASE_URL` est **en place et vérifié** : sauvegarde automatique du 24/11/2026 08:01 UTC réussie (artefact `backup-sql`, 11 310 o). L'export manuel reste disponible.

**Jumia Vendor Center** : client livré (`src/lib/jumia/client.ts`) — `POST /token`, durées lues dans `expires_in`, rotation du refresh token ré-écrite en base chiffrée, erreurs OAuth traduites ; `POST /api/admin/jumia/test` (propriétaires, audité) + bouton « Tester la connexion Jumia » sur **Santé**. Identifiants en place (`JUMIA_CLIENT_ID`/`JUMIA_REFRESH_TOKEN`, puis jeton renouvelé en base chiffrée). **Vérifié en production le 24/11/2026** : `authenticated:true`, access token 86399 s, refresh ~365 j, `GET /shops` 200 → 1 boutique « NKSF Shop (CI) ».
**Phase 2 — lot 1 (rattachement des boutiques)** : livré le 24/11/2026. Colonnes `shops.remote_shop_id/name/linked_at` (migration `0004`), index unique ; `GET /api/jumia/shops` (propriétaires) liste les boutiques Jumia et leurs rattachements ; `POST/DELETE /api/shops/:id/jumia-link` (permission `shops:write`, vérification que la boutique distante existe, idempotent, 409 si déjà rattachée, dissociation → statut `pending`) ; audit `shop.jumia_linked/unlinked`. Bloc « Boutique Jumia rattachée » sur **Boutiques**. Vérifié en production sur boutique temporaire : liste 1 boutique « NKSF Shop (CI) », rattachement puis 409 en cas de doublon, dissociation OK. Tests : 110 unitaires + 25 E2E.

**Tests après ces changements** : 103 tests unitaires + 24 tests E2E verts, lint/typecheck OK, CI + déploiement Render success (`1e231b3`).

**Déploiement** : push sur `main` → CI verte → « Déploiement Render » via Deploy Hook. Vérifié en production : connexion + 2FA + code de vérification → `/dashboard` (11/2026).

## 8. Questions ouvertes (décisions du propriétaire)

1. Hébergement : Render/Netlify + Neon (recommandé) ? 2. Accès Jumia Vendor Center (OAuth2 Self Authorization) ? 3. Nombre de boutiques / pays ? 4. Devise de base : FCFA ? 5. Clé API gratuite Gemini pour MIMI ? 6. Bot Telegram déjà créé ? 7. Rôles conformes ? 8. Sauvegardes sur R2 ? 9. Aucun domaine payant ? 10. Phase 1 avec saisie manuelle sans Jumia ?

## 9. Documents de référence

`docs/index.md` · `securite-2fa.md` · `auth.md` · `architecture.md` · `database.md` · `jumia-integration.md` · `hebergement-gratuit.md` · `telegram-integration.md` · `formules-financieres.md` · `design-system.md` · `mimi.md` · `plan-phase-1.md` · `sources.md` · `docs/mockups/`
