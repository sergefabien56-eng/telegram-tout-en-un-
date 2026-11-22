# Plan Phase 1 — Fondations et interface

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Prérequis** : validation de la Phase 0
- **Objectif** : une application réelle, sécurisée, accessible **Web + Telegram**, avec une base de données centralisée, **sans donnée fictive en production**.

---

## 1. Périmètre de la Phase 1

Inclus : initialisation Next.js/TypeScript strict, PostgreSQL + Drizzle, auth Web, auth Telegram, Mini App, gestion utilisateurs/rôles/permissions, architecture multi-boutiques, menu latéral + barre supérieure + sélecteur de boutique, mode clair/sombre, journal d'audit, CI/CD, déploiement gratuit, URL HTTPS.

**Hors Phase 1** : synchronisation Jumia réelle (P2), modules métier avancés (P3+), MIMI (P5).

---

## 2. Lots de développement

### L1 — Initialisation et qualité
- Dépôt GitHub (privé), Next.js App Router, TypeScript strict, ESLint/Prettier, Tailwind, shadcn/ui, Lucide.
- Dossier `docs/`, `navigation.config.ts`, `.env.example` (aucun secret réel).
- **Tests** : configuration Vitest + Playwright.
- **Livrable** : CI verte sur un « hello » réel.

### L2 — Base de données et migrations
- Schéma initial (voir `database.md`) : `users`, `sessions`, `telegram_accounts`, `shops`, `shop_members`, `audit_logs`, `jobs`, `notifications`, `user_notification_prefs`, `app_settings`.
- Drizzle Kit + migrations versionnées.
- **Tests** : contraintes, unicité boutique, isolation (tentative d'accès cross-boutique).

### L3 — Authentification Web
- Inscription/connexion (Argon2id), sessions `httpOnly`, 2FA TOTP (rôles sensibles), rate limiting, réinitialisation.
- **Tests** : login OK/KO, expiration, 2FA, force-brute limité, déconnexion.

### L4 — Telegram : bot, webhook, Mini App
- Bot (commandes de base), webhook sécurisé (`secret_token`), vérification `initData`, échange de session, **liaison de compte**.
- Mini App : layout compact, theme Telegram, bottom nav, mêmes données.
- **Tests** : `initData` valide/invalide/expiré, webhook rejeté sans secret, liaison usage unique.

### L5 — Boutiques, rôles, permissions
- CRUD boutique (sans appairage Jumia réel avant P2 : statut « connecteur en attente »), membres, rôles, permissions par module/action/boutique.
- **Tests** : isolation multi-boutiques, permissions par rôle, sélecteur de boutique filtre les données.

### L6 — Interface commune (Web + Mini App)
- Layout desktop (sidebar + topbar), layout mobile, sélecteur de boutique, recherche globale (basique), notifications (préférences + cloche), mode clair/sombre, états (chargement/vide/erreur/`—`/`Bientôt disponible`).
- **Tests** : accessibilité clavier, responsive, `prefers-reduced-motion`, contrastes.

### L7 — Audit, santé, sauvegarde
- Journal d'audit sur les actions sensibles.
- Page « Administration → Santé » (quotas, files, dernières syncls — réels).
- Script de sauvegarde `pg_dump` + test de restauration (environnement de test).
- **Tests** : audit écrit, sauvegarde/restauration sur jeu de test.

### L8 — CI/CD et déploiement gratuit
- GitHub Actions : lint + tests + build.
- Déploiement sur l'offre gratuite retenue (Render ou Netlify), HTTPS + sous-domaine.
- **Livrable** : URL HTTPS permanente, Mini App pointée dessus.

---

## 3. Tests (stratégie)

| Type | Outils | Contenu |
|---|---|---|
| Unitaires | Vitest | services, formules financières, validateurs Zod, permissions |
| Intégration BD | Vitest + PG de test | repositories, isolation, migrations |
| API | Vitest/Supertest | routes, auth, rate limiting, webhooks |
| E2E | Playwright | login, navigation, sélecteur boutique, Mini App (émulée) |
| Sécurité | tests dédiés | `initData`, CSRF, permissions cross-boutique, secrets absents des logs |
| Charge légère | script | volume (ex. 100 k commandes) pour valider les quotas |

**Critère** : aucun test ne doit reposer sur une donnée fictive en production (les données de démo restent en `dev`/`staging`).

---

## 4. Démonstration de fin de Phase 1

1. Connexion Web (avec 2FA).
2. Connexion Telegram + liaison de compte.
3. Ouverture de la Mini App et identité retrouvée.
4. Navigation Web ↔ Telegram : **une modification visible des deux côtés** (ex. nom de boutique ou brouillon).
5. Permissions : un utilisateur « assistant » ne voit pas une boutique interdite.
6. Mode clair/sombre + mobile.
7. Journal d'audit et page Santé.
8. Sauvegarde + restauration sur environnement de test.
9. CI verte + déploiement en HTTPS gratuit.

---

## 5. Risques Phase 1

| Risque | Impact | Mitigation |
|---|---|---|
| Quotas gratuits (trafic, base, IA) | Moyen | supervision + alertes + behavior dégradé |
| API Jumia non disponible pour la CI | Élevé pour P2 | qualification préalable (voir `jumia-integration.md`) ; P1 ne dépend pas de Jumia |
| Complexité Telegram (initData, WebView) | Moyen | tests dédiés + code éprouvé |
| Hébergeur gratuit (sleep/quota) | Faible | alternative Cloudflare/Netlify prête |
| Temps de développement | Moyen | lots courts, validation par lot |

---

## 6. Questions ouvertes (décisions attendues du propriétaire)

1. **Hébergement** : validez-vous **Render (ou Netlify) + Neon** plutôt que Vercel (non commercial) ? (Recommandation : oui.)
2. **Compte Jumia** : avez-vous un accès **Vendor Center** (mastershop) avec OAuth2 « Self Authorization » ? Sinon, par quelle surface officielle connecter les boutiques ?
3. **Nombre de boutiques et pays** : combien de boutiques, et uniquement la Côte d'Ivoire au départ ?
4. **Devise de base** : FCFA (XOF) pour tout ? Autres devises à prévoir ?
5. **IA (MIMI)** : autorisez-vous la création d'une **clé API gratuite Gemini** (ou Groq) ? Sinon, MIMI reste « Bientôt disponible ».
6. **Notifications** : identifiants Telegram des utilisateurs pour les notifications (bot déjà créé ?).
7. **Rôles** : la liste Propriétaire/Gestionnaire/Stocks/Comptable/Assistant convient-elle ?
8. **Sauvegarde** : acceptez-vous le stockage des sauvegardes sur **Cloudflare R2** (gratuit) ou préférez-vous un autre lieu ?
9. **Domaine** : aucun domaine payant au départ — confirmé ?
10. **Priorité** : la Phase 1 doit-elle déjà inclure un début de catalogue/orders **sans** Jumia (saisie manuelle), ou attendre P2 ?

---

## 7. Critères de validation de la Phase 1

- [ ] Application accessible en HTTPS (Web + Telegram).
- [ ] Auth Web + Telegram + liaison sécurisée fonctionnelles.
- [ ] Isolation multi-boutiques prouvée par tests.
- [ ] Permissions effectives côté serveur.
- [ ] Aucune donnée fictive en production.
- [ ] Audit + sauvegarde/restauration testés.
- [ ] CI/CD vert, déploiement gratuit.
- [ ] Documentation utilisateur et maintenance (ébauche).

---

## 8. Enchaînement

`PLAN → DÉVELOPPEMENT → TESTS → DÉMONSTRATION → COMPTE RENDU → VALIDATION`

Aucune phase suivante ne commence sans validation explicite.
