# MÉMOIRE DU PROJET — TOUT EN UN BUSINESS MANAGER

> Fichier de référence persistant. Il résume le projet pour permettre une reprise rapide,
> même après une nouvelle session. **Les documents détaillés vivent dans `docs/`.**

- **Nom** : TOUT EN UN BUSINESS MANAGER (nom court : **TOUT EN UN**)
- **Créé le** : 22/11/2026
- **Statut** : **Phase 0 validée** · **Phase 1 en cours** (Lots 1 et 2 livrés, tests + build verts)
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

| Sujet | Décision |
|---|---|
| Application | **Next.js App Router + TypeScript strict** (une seule appli Web + Mini App) |
| ORM / BDD | **Drizzle ORM + PostgreSQL** |
| Hébergement | **Render ou Netlify (gratuit, commercial autorisé)** — **Vercel écarté** (Hobby non commercial) |
| Base de données | **Neon** (gratuit 1 Go) — **Supabase en alternatif** (pause 7 j, pas de backup) |
| Fichiers | **Cloudflare R2** (10 Go, egress gratuit) — sinon Supabase Storage (1 Go) |
| Planificateur | **cron GitHub Actions** → route serverless ; **pas de worker permanent** |
| Tâches | table `jobs` PostgreSQL (idempotence, reprise, verrous) |
| IA (MIMI) | **fournisseur branchable**, Gemini gratuit (disponible en CI) ; jamais d'appel payant auto |
| Auth | maison : web (Argon2id, sessions, 2FA) + Telegram (initData vérifié HMAC) |

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

| Phase | État |
|---|---|
| **0 — Cadrage** | ✅ **Livrée et validée** (9 documents + maquettes) |
| **1 — Fondations et interface** | 🔵 **En cours** — Lots 1 (socle/qualité) et 2 (schéma + migration) livrés · CI verte · build OK |
| 2 à 8 | ⏳ Non démarrées |

**Phase 1 — lots :**
- ✅ L1 Initialisation & qualité (Next.js 15, TS strict, Tailwind, ESLint/Prettier, Vitest, Playwright, CI GitHub Actions, `.env.example`)
- ✅ L2 Base de données & migrations (schéma Drizzle 12 tables + migration `drizzle/0000_*.sql`) · **base Neon connectée** (branche `production`, 12 tables, smoke OK)
- ✅ L3 Auth Web (scrypt, sessions serveur, réinitialisation, anti-abus 5/15 min, audit) · smoke 8/8 sur Neon · détails `docs/auth.md`
- ✅ L4 Telegram/Mini App (webhook + secret, liaison par code à usage unique, initData HMAC vérifié, Mini App) · smoke 8/8 + liaison réelle en base · détails `docs/telegram.md` · **en attente d'un vrai token bot + URL HTTPS publique** (déploiement Lot 8)
- ✅ L5 Boutiques/rôles/permissions (CRUD boutiques, membres, invitations, rôles owner/manager/stock/accountant/assistant, permissions module:action côté serveur) · smoke API 12/12 + 11 tests intégration · détails `docs/boutiques.md`
- ⏳ L6 Interface commune · L7 Audit/santé/sauvegarde · L8 CI/CD + déploiement (préparé : `render.yaml` + `docs/deploiement.md`, build prod prouvé 12/12)

## 7. Prochaine action (après validation)

Commencer **Phase 1 — Lot 1** : dépôt GitHub + Next.js + TypeScript strict + ESLint/Prettier + CI (lint/tests/build) + `.env.example`.

## 8. Questions ouvertes (décisions du propriétaire)

1. Hébergement : Render/Netlify + Neon (recommandé) ? 2. Accès Jumia Vendor Center (OAuth2 Self Authorization) ? 3. Nombre de boutiques / pays ? 4. Devise de base : FCFA ? 5. Clé API gratuite Gemini pour MIMI ? 6. Bot Telegram déjà créé ? 7. Rôles conformes ? 8. Sauvegardes sur R2 ? 9. Aucun domaine payant ? 10. Phase 1 avec saisie manuelle sans Jumia ?

## 9. Documents de référence

`docs/index.md` · `architecture.md` · `database.md` · `jumia-integration.md` · `hebergement-gratuit.md` · `telegram-integration.md` · `formules-financieres.md` · `design-system.md` · `mimi.md` · `plan-phase-1.md` · `sources.md` · `docs/mockups/`
