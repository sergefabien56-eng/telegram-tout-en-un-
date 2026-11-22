# TOUT EN UN BUSINESS MANAGER — Phase 0 (cadrage)

**Date** : 22/11/2026 · **Statut** : en attente de validation · **Budget** : 0 FCFA

## Documents de conception

| # | Document | Contenu |
|---|---|---|
| 1 | [architecture.md](architecture.md) | Architecture générale, décisions, flux, Telegram + Web, évolution |
| 2 | [database.md](database.md) | Tables, relations, contraintes, index, isolation, diagramme |
| 3 | [jumia-integration.md](jumia-integration.md) | API officielle Jumia, endpoints, sync, limites |
| 4 | [hebergement-gratuit.md](hebergement-gratuit.md) | Offres gratuites réelles, quotas, risques, migration |
| 5 | [telegram-integration.md](telegram-integration.md) | Bot, Mini App, auth `initData`, notifications |
| 6 | [formules-financieres.md](formules-financieres.md) | Commissions, marges, règles de calcul |
| 7 | [design-system.md](design-system.md) | Couleurs, typographie, composants, navigation, responsive |
| 8 | [mimi.md](mimi.md) | Architecture IA, outils, coûts, limites |
| 9 | [plan-phase-1.md](plan-phase-1.md) | Lots, tests, démonstration, risques, questions ouvertes |

## Maquettes (présentation)

- [Index des maquettes](mockups/index.html)
- [Connexion Web](mockups/login.html)
- [Tableau de bord](mockups/dashboard.html)
- [Commandes](mockups/commandes.html)
- [Mini App Telegram](mockups/mini-app.html)
- [Schéma base de données](mockups/database.html)

## Sources et vérifications

- [sources.md](sources.md) — références vérifiées le 22/11/2026 (offres gratuites, API Jumia, Telegram, IA).

## Prochaine étape

**Phase 1 — Fondations et interface**, uniquement après validation de cette Phase 0.

## Avancement

- ✅ **Phase 0** — cadrage, documents, maquettes (validé).
- ✅ **Phase 1 — Lot 1** : socle Next.js/TypeScript strict, CI GitHub Actions, config Zod.
- ✅ **Phase 1 — Lot 2** : schéma PostgreSQL 12 tables + migration, base **Neon** connectée.
- ✅ **Phase 1 — Lot 3** : authentification web ([auth.md](auth.md)) — scrypt, sessions, réinitialisation, anti-abus, audit.
- ✅ **Phase 1 — Lot 4** : bot Telegram + Mini App ([telegram.md](telegram.md)) — webhook sécurisé, liaison de compte, `initData` vérifié.
- ⬜ **Phase 1 — Lot 5** : boutiques, rôles, permissions.
- ⬜ **Phase 1 — Lot 6** : interface commune (mobile + bureau).
- ⬜ **Phase 1 — Lot 7** : audit, santé, sauvegarde.
- ⬜ **Phase 1 — Lot 8** : CI/CD + déploiement.
