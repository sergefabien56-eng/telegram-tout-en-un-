# TOUT EN UN BUSINESS MANAGER — Phase 0 (cadrage)

**Date** : 22/11/2026 · **Statut** : en attente de validation · **Budget** : 0 FCFA

## Documents de conception

| #   | Document                                           | Contenu                                                           |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | [architecture.md](architecture.md)                 | Architecture générale, décisions, flux, Telegram + Web, évolution |
| 2   | [database.md](database.md)                         | Tables, relations, contraintes, index, isolation, diagramme       |
| 3   | [jumia-integration.md](jumia-integration.md)       | API officielle Jumia, endpoints, sync, limites                    |
| 4   | [hebergement-gratuit.md](hebergement-gratuit.md)   | Offres gratuites réelles, quotas, risques, migration              |
| 5   | [telegram-integration.md](telegram-integration.md) | Bot, Mini App, auth `initData`, notifications                     |
| 6   | [formules-financieres.md](formules-financieres.md) | Commissions, marges, règles de calcul                             |
| 7   | [design-system.md](design-system.md)               | Couleurs, typographie, composants, navigation, responsive         |
| 8   | [mimi.md](mimi.md)                                 | Architecture IA, outils, coûts, limites                           |
| 9   | [plan-phase-1.md](plan-phase-1.md)                 | Lots, tests, démonstration, risques, questions ouvertes           |
| 10  | [sauvegarde.md](sauvegarde.md)                     | Sauvegarde planifiée, rétention, restauration, export R2/Drive    |
| 11  | [audit-multiboutique.md](audit-multiboutique.md)   | Audit technique multiboutique : causes, corrections, preuves      |
| 12  | [audit-refonte-pilotage.md](audit-refonte-pilotage.md) | Audit global de l'application (architecture, navigation, UX, responsive, Mini App, permissions, données) |
| 13  | [proposition-architecture-fonctionnelle.md](proposition-architecture-fonctionnelle.md) | Proposition de refonte et architecture fonctionnelle cible |
| 14  | [conception-pilotage.md](conception-pilotage.md)     | Conception de la nouvelle organisation du tableau de bord et du pilotage |
| 15  | [matrice-etat-regressions.md](matrice-etat-regressions.md) | Matrice opérationnel / corrigé / nouveau / à venir, tests multi-support, régressions |

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
- ✅ **Phase 1 — Lot 5** : boutiques, rôles & permissions ([boutiques.md](boutiques.md)) — API 12/12, tests 11/11.
- ✅ **Phase 1 — Lot 6** : interface commune — coquille applicative, recherche globale, thème clair/sombre, notifications.
- ✅ **Phase 1 — Lot 7** : page Santé, sauvegarde/restauration testée, **sauvegarde planifiée** quotidienne ([sauvegarde.md](sauvegarde.md)).
- ✅ **Phase 1 — Lot 8** : CI/CD + déploiement sur **Render** ([deploiement.md](deploiement.md)) — live.
- ✅ **Maquette interactive** : `docs/mockups/interactive.html` (bureau + mobile, bascule de version).
- ✅ **Finitions — 2FA TOTP** : double authentification activable ([securite-2fa.md](securite-2fa.md)).
- ✅ **Finitions — actions rapides**, **Mini App**, **accessibilité WCAG AA**.
- ✅ **Déploiement automatique** GitHub → Render (uniquement après une CI verte).
- ✅ **CI + 24 tests E2E verts**, dont le parcours 2FA corrigé en production.
- ✅ **Audit technique multiboutique** ([audit-multiboutique.md](audit-multiboutique.md)) : isolation garantie, états de connexion factuels, preuve de cohérence Jumia ↔ application (volumes, montants des commandes et des relevés au centime), historique quotidien et détection de dérive, diagnostic intégré `/admin/diagnostics`.
- ✅ **Refonte globale du pilotage** ([audit-refonte-pilotage.md](audit-refonte-pilotage.md) → [proposition-architecture-fonctionnelle.md](proposition-architecture-fonctionnelle.md) → [conception-pilotage.md](conception-pilotage.md) → [matrice-etat-regressions.md](matrice-etat-regressions.md)) : le tableau de bord n'agrège plus les boutiques (périmètre explicite dans l'URL), chaque rubrique de pilotage a sa propre page, recherche transverse et thème centralisés, état « À venir » verrouillé par test, contraste WCAG AA corrigé. **245 tests + 58 E2E verts.**
- ⬜ **Reste à faire** : comparaison des montants de relevé au centime (les volumes sont prouvés, les montants restent à prouver).
