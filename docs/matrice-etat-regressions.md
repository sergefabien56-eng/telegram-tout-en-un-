# Matrice d'état, tests multi-support et régressions

**Date :** 22 novembre 2026
**Périmètre :** lot « refonte globale / modernisation / amélioration intelligente de Tout en Un ».
**État :** réalisé et testé — **non publié** (en attente de validation du commanditaire).

---

## 1. Matrice d'état

Légende : ✅ opérationnel · 🔧 corrigé · ✚ nouveau · ⏳ à venir (non fonctionnel, annoncé comme tel).

### 1.1 Pilotage (section A)

| Rubrique | Page | État | Avant | Après | Preuve |
|---|---|---|---|---|---|
| Tableau de bord | `/dashboard` | 🔧 | Agrégat toutes boutiques, 7 ancres | KPI scopés, 4 blocs, contexte affiché | `01`, `02` |
| Performances | `/performances` | ✚ | (ancre `#performances`) | Comparaison + évolution journalière | `03` |
| Alertes | `/alertes` | ✚ | (ancre `#alertes`) | 4 familles unifiées, tri par gravité | `04` |
| Activités | `/activites` | ✚ | (ancre `#activites`) | Journal des 100 dernières actions | `05` |
| Recherche | `/recherche` | ✚ | Ancre masquée sur mobile | Page transverse + composant unique | `06` |
| Apparence | `/apparence` | ✚ | Ancre + 2 implémentations | Page + `ThemePicker` unique | `07` |

### 1.2 Périmètre et données

| Élément | État | Avant | Après |
|---|---|---|---|
| Filtrage du tableau de bord par boutique | 🔧 | Aucun filtre (agrégat) | `shopIds` obligatoire dans toutes les agrégations |
| Sélecteur de boutique dans le tableau de bord | ✚ | Absent | `ShopScopeSelect` + `ScopeBar` |
| Périmètre porté par l'URL | ✚ | Absent | `?boutique=<id|toutes>&days=<n>` |
| Refus de périmètre explicite | ✚ | Tableau vide | Alerte « Cette boutique n'est pas dans votre périmètre » |
| Bandeau de contexte (boutique, période, fraîcheur) | ✚ | Absent | `ScopeBar` |
| Ligne de provenance sous chaque KPI | ✚ | Absente | Composant `Kpi` |
| Distinction absence / refus / zéro | 🔧 | Confondus | `EmptyState` à trois tons |
| Panier moyen, part du CA, meilleure boutique | ✚ | Absents | `/performances` |
| Net à verser (Jumia) issu des relevés | ✅ | Présent | Inchangé, désormais étiqueté |
| CA commandes (livrées + expédiées) | ✅ | Présent | Inchangé, désormais étiqueté |
| État de connexion par boutique | ✚ | Global | Calculé par boutique, depuis des faits |
| Recherche transverse boutiques / produits / SKU | ✚ | 2 implémentations | 1 seule, scopée serveur |

### 1.3 Fonctionnalités conservées (non régressées)

| Élément | État | Preuve |
|---|---|---|
| 48 rubriques de navigation, 8 sections | ✅ | `navigation.test.ts`, `e2e/pilotage.spec.ts` |
| 34 pages métier et leurs filtres/exports | ✅ | 243 tests + 58 E2E |
| 56 routes API et leurs contrôles d'accès | ✅ | Suite complète |
| « Tout ouvrir » / « Tout fermer » (Mini App) | ✅ | `e2e/mini-menu.spec.ts` |
| Bot Telegram, Mini App, cron de cohérence | ✅ | `e2e/mini-menu.spec.ts`, smoke |
| Sauvegardes, 2FA, journal d'audit | ✅ | Inchangés |
| Schéma de base | ✅ | Aucune migration ajoutée |

### 1.4 Rubriques « À venir » (13) — verrouillées par test

Mouvements · Entrepôts · Inventaires · Dépenses · Achats · Rapprochements · Règles · Tâches planifiées · Notifications · Diagnostic des boutiques · Sécurité du compte · Système · (+ Réglages boutiques)

> Ces rubriques sont **annoncées** comme non fonctionnelles. Elles ne sont ni masquées, ni présentées comme livrées. La liste est figée par `src/lib/__tests__/navigation.test.ts` : toute nouvelle rubrique non fonctionnelle doit y être inscrite.

### 1.5 Fonctionnalités écartées (et pourquoi)

| Fonction | Décision | Motif |
|---|---|---|
| Prévision de CA | Écartée | Aucun historique suffisant ; reviendrait à inventer un chiffre |
| Score de santé de boutique | Écartée | Non étayé par une source |
| Graphique daily sur le tableau de bord | Différée | Le graphique existe sur `/performances`, où il a du sens |
| Cache hors-ligne | Écartée | Non demandée ; la donnée doit être fraîche |
| Export PDF multi-boutiques | Écartée | Marquée « À venir » |

---

## 2. Tests multi-support

### 2.1 Web (desktop 1440 × 900)

| Vérification | Résultat |
|---|---|
| Tableau de bord sur une boutique | ✅ `01` |
| Tableau de bord en agrégat (2 boutiques) | ✅ `02` |
| Performances : comparaison + évolution journalière | ✅ `03` |
| Alertes : 4 familles, tri par gravité | ✅ `04` |
| Activités : journal des 100 dernières actions | ✅ `05` |
| Recherche transverse | ✅ `06` |
| Apparence : 3 thèmes | ✅ `07` |
| Refus de périmètre hors espace | ✅ `08` |
| Thème sombre appliqué au tableau de bord | ✅ `09` |

### 2.2 Mobile (390 × 844)

| Vérification | Résultat |
|---|---|
| Tableau de bord en une colonne, tables défilables | ✅ `10` |
| Performances : graphique lisible, pas de débordement | ✅ `11` |
| Recherche accessible (elle ne l'est plus seulement en CSS) | ✅ `12` |
| Tiroir de navigation ouvert | ✅ `13` |

### 2.3 Mini App Telegram (390 × 844)

| Vérification | Résultat |
|---|---|
| Accueil, sélecteur de boutique, KPI | ✅ `14` |
| Menu « Plus » : modules pliables, « Tout ouvrir », section Pilotage dépliée | ✅ `15` |
| Débordement horizontal = 0 | ✅ `e2e/mini-menu.spec.ts` |
| Onglets bas : Accueil, Boutiques, **Alertes** (aligné sur `/alertes`), Sécurité, Plus | ✅ |
| « Tout ouvrir » / « Tout fermer » | ✅ `e2e/mini-menu.spec.ts` |

### 2.4 Automatisé

| Niveau | Volume | Résultat |
|---|---|---|
| Vitest (unitaires + intégration, base réelle) | 41 fichiers / 245 tests | **243 réussis / 2 ignorés** |
| Playwright (E2E) | 58 tests | **58/58 réussis** |
| `tsc --noEmit` | — | **0 erreur** |
| ESLint | — | **0 erreur** |
| `next build` | — | **succès** |
| axe-core (accessibilité) | embarqué dans les E2E | **0 violation bloquante** |

---

## 3. Régressions rencontrées et résolution

| # | Régression détectée | Gravité | Cause | Résolution | Statut |
|---|---|---|---|---|---|
| R1 | Typecheck : `pathname` inutilisé dans `app-shell.tsx` | Bloquante | Import `usePathname` devenu inutile après le passage à `router.refresh()` | Suppression de l'import | ✅ Résolu |
| R2 | Typecheck : imports inutilisés (`AlertTriangle`, `formatMoney`, `Link`, `maxRevenue`) | Bloquante | Imports laissés après refonte des pages | Nettoyage | ✅ Résolu |
| R3 | E2E : « Vue d'ensemble » introuvable | Moyenne | Rubrique renommée « Tableau de bord » | Test aligné sur la nouvelle organisation | ✅ Résolu |
| R4 | E2E : menu sans lien `/performances` | Moyenne | L'utilisateur de test n'avait **aucune boutique** → les rubriques conditionnelles (permission `reports:read`) étaient masquées | Le test crée désormais une boutique avant d'inspecter le menu | ✅ Résolu |
| R5 | E2E : `getByText("PILOTAGE ALPHA")` résolvait sur un `<option>` masqué | Mineure | Sélecteur trop large (le `<option>` du sélecteur de boutique) | Ciblage sur `data-testid="scope-bar"` | ✅ Résolu |
| R6 | E2E : `getByRole("alert")` ambigu | Mineure | Le routeur Next publie aussi un `role="alert"` | Ciblage sur `.first()` | ✅ Résolu |
| R7 | Unitaire : « Vue d'ensemble » / « Indicateurs financiers » absents de la navigation | Moyenne | Le test de navigation verrouillait l'**ancienne** organisation | Test mis à jour : les libellés attendus suivent la nouvelle architecture, les rubriques supprimées sont retirées de la liste | ✅ Résolu |
| R8 | Unitaire : `upsertOrders(shopId, lignes)` — signature inexistante | Bloquante | Le helper d'insertion attend un tableau de lignes, chacune portant son `shopId` | Test corrigé (garde-fou multi-boutiques du helper conservé) | ✅ Résolu |
| R9 | `getByText("CA commandes")` ambigu (KPI + note de méthode) | Mineure | Libellé présent deux fois, c'est voulu | `.first()` | ✅ Résolu |
| R10 | Rôle `admin` ajouté en base par un script de démonstration | Sans impact | `admin` n'existe pas dans le modèle de rôles (`owner`, `manager`, `stock`, `accountant`, `assistant`) → permissions nulles, comportement correct et vérifié | Compte de démonstration repassé `owner` | ✅ Résolu |
| R11 | E2E : l'invitation d'un membre renvoyait 404 | Moyenne | `POST /api/auth/register` **pose une session** : inscrire le vendeur dans le contexte principal_session en avait fait le propriétaire, qui n'a pas accès à la boutique | Inscription faite dans un contexte jetable, puis invitation depuis le contexte du propriétaire | ✅ Résolu |
| R12 | Axe : contraste insuffisant sur le badge « Non rattachée » (1.98:1) et le texte d'avertissement (2.14:1) | Sérieuse | La couleur d'avertissement `#F59E0B` n'est pas lisible sur fond clair | `--warning` passe à `#92400E` en thème clair : **6.1:1** sur le fond des pastilles, 7.1:1 sur blanc | ✅ Résolu |

### 3.1 Régressions fonctionnelles (rapportées par l'utilisateur) — état

| Symptôme | Cause | Résolution | Preuve |
|---|---|---|---|
| « MaxiShops et NKSF renvoient les mêmes résultats » | `dashboardOverview()` sans filtre de boutique | Filtre `shopIds` obligatoire + périmètre dans l'URL + bandeau de contexte | `02` (181 877 / 43 vs 116 514 / 23) et test d'intégration |
| « Je ne sais pas où aller » | 6 entrées de menu sur 7 pointaient vers des ancres | 6 pages dédiées, une par rubrique | `e2e/pilotage.spec.ts` |
| « La recherche n'existe pas sur mobile » | Barre de recherche masquée par CSS sous `sm` | Recherche devenue une page | `12` |

---

## 4. Points d'attention pour la suite (non bloquants)

| # | Point | Recommandation |
|---|---|---|
| P1 | Le tableau de bord n'a pas de graphique (choix assumé) | Le graphique est sur `/performances` ; à déplacer seulement si la demande le justifie |
| P2 | `middleware.ts` ne couvre que `/dashboard` | Sans effet sur la sécurité (vérification serveur systématique) ; élargir pour uniformiser les redirections |
| P3 | La recherche transverse porte sur toutes les boutiques de l'utilisateur, pas sur le périmètre filtré | Choix assumé et écrit dans l'interface (« la recherche ne porte que sur ce à quoi vous avez droit ») ; aligner si l'utilisateur veut un comportement strict |
| P4 | La Mini App affiche le tableau de bord complet (long défilement) | Éventuelle version condensée pour la Mini App |
| P5 | Le compte de démonstration `demo-captures@exemple.ci` a servi aux captures | Purge effectuée en fin de session (le motif `@exemple.ci` est purgé automatiquement par le harnais E2E) |

---

## 5. Emplacements des preuves

| Preuve | Chemin |
|---|---|
| Audit | `docs/audit-refonte-pilotage.md` |
| Proposition + architecture fonctionnelle | `docs/proposition-architecture-fonctionnelle.md` |
| Conception | `docs/conception-pilotage.md` |
| Matrice, tests, régressions | `docs/matrice-etat-regressions.md` (ce document) |
| Captures | `docs/captures/01-…` à `docs/captures/15-…` |
| Script de captures | `scripts/captures.mjs` |
| Test d'intégration du périmètre | `src/lib/__tests__/dashboard-scope.integration.test.ts` |
| Test E2E du pilotage | `e2e/pilotage.spec.ts` |
| Test E2E du tableau de bord | `e2e/dashboard.spec.ts` |
