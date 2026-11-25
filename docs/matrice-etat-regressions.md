# Matrice d'état, tests multi-support et régressions

**Date :** 22 novembre 2026
**Périmètre :** lot « refonte globale / modernisation / amélioration intelligente de Tout en Un ».
**État :** réalisé et testé — **non publié** (en attente de validation du commanditaire).

---

## 1. Matrice d'état

Légende : ✅ opérationnel · 🔧 corrigé · ✚ nouveau · ⏳ à venir (non fonctionnel, annoncé comme tel).

### 1.1 Pilotage (section A)

| Rubrique        | Page            | État | Avant                              | Après                                                        | Preuve     |
| --------------- | --------------- | ---- | ---------------------------------- | ------------------------------------------------------------ | ---------- |
| Tableau de bord | `/dashboard`    | 🔧   | Agrégat toutes boutiques, 7 ancres | KPI scopés, 4 blocs, contexte affiché, évolution journalière | `01`, `02` |
| Performances    | `/performances` | ✚    | (ancre `#performances`)            | Comparaison + évolution journalière                          | `03`       |
| Alertes         | `/alertes`      | ✚    | (ancre `#alertes`)                 | 4 familles unifiées, tri par gravité                         | `04`       |
| Activités       | `/activites`    | ✚    | (ancre `#activites`)               | Journal des 100 dernières actions                            | `05`       |
| Recherche       | `/recherche`    | ✚    | Ancre masquée sur mobile           | Page transverse + composant unique                           | `06`       |
| Apparence       | `/apparence`    | ✚    | Ancre + 2 implémentations          | Page + `ThemePicker` unique                                  | `07`       |

### 1.2 Périmètre et données

| Élément                                            | État | Avant                  | Après                                                         |
| -------------------------------------------------- | ---- | ---------------------- | ------------------------------------------------------------- |
| Filtrage du tableau de bord par boutique           | 🔧   | Aucun filtre (agrégat) | `shopIds` obligatoire dans toutes les agrégations             |
| Sélecteur de boutique dans le tableau de bord      | ✚    | Absent                 | `ShopScopeSelect` + `ScopeBar`                                |
| Périmètre porté par l'URL                          | ✚    | Absent                 | `?boutique=<id                                                | toutes>&days=<n>` |
| Refus de périmètre explicite                       | ✚    | Tableau vide           | Alerte « Cette boutique n'est pas dans votre périmètre »      |
| Bandeau de contexte (boutique, période, fraîcheur) | ✚    | Absent                 | `ScopeBar`                                                    |
| Ligne de provenance sous chaque KPI                | ✚    | Absente                | Composant `Kpi`                                               |
| Distinction absence / refus / zéro                 | 🔧   | Confondus              | `EmptyState` à trois tons                                     |
| Panier moyen, part du CA, meilleure boutique       | ✚    | Absents                | `/performances`                                               |
| Évolution journalière du CA commandes              | ✚    | Absente                | Graphique de barres, sommaire vérifié contre les KPI par test |
| Net à verser (Jumia) issu des relevés              | ✅   | Présent                | Inchangé, désormais étiqueté                                  |
| CA commandes (livrées + expédiées)                 | ✅   | Présent                | Inchangé, désormais étiqueté                                  |
| État de connexion par boutique                     | ✚    | Global                 | Calculé par boutique, depuis des faits                        |
| Recherche transverse boutiques / produits / SKU    | ✚    | 2 implémentations      | 1 seule, scopée serveur                                       |

### 1.3 Fonctionnalités conservées (non régressées)

| Élément                                      | État | Preuve                                       |
| -------------------------------------------- | ---- | -------------------------------------------- |
| 48 rubriques de navigation, 8 sections       | ✅   | `navigation.test.ts`, `e2e/pilotage.spec.ts` |
| 34 pages métier et leurs filtres/exports     | ✅   | 245 tests + 58 E2E                           |
| 56 routes API et leurs contrôles d'accès     | ✅   | Suite complète                               |
| « Tout ouvrir » / « Tout fermer » (Mini App) | ✅   | `e2e/mini-menu.spec.ts`                      |
| Bot Telegram, Mini App, cron de cohérence    | ✅   | `e2e/mini-menu.spec.ts`, smoke               |
| Sauvegardes, 2FA, journal d'audit            | ✅   | Inchangés                                    |
| Schéma de base                               | ✅   | Aucune migration ajoutée                     |

### 1.4 Rubriques « À venir » (13) — verrouillées par test

Mouvements · Entrepôts · Inventaires · Dépenses · Achats · Rapprochements · Règles · Tâches planifiées · Notifications · Diagnostic des boutiques · Sécurité du compte · Système · (+ Réglages boutiques)

> Ces rubriques sont **annoncées** comme non fonctionnelles. Elles ne sont ni masquées, ni présentées comme livrées. La liste est figée par `src/lib/__tests__/navigation.test.ts` : toute nouvelle rubrique non fonctionnelle doit y être inscrite.

### 1.5 Fonctionnalités écartées (et pourquoi)

| Fonction                               | Décision | Motif                                                          |
| -------------------------------------- | -------- | -------------------------------------------------------------- |
| Prévision de CA                        | Écartée  | Aucun historique suffisant ; reviendrait à inventer un chiffre |
| Score de santé de boutique             | Écartée  | Non étayé par une source                                       |
| Graphique daily sur le tableau de bord | Différée | Le graphique existe sur `/performances`, où il a du sens       |
| Cache hors-ligne                       | Écartée  | Non demandée ; la donnée doit être fraîche                     |
| Export PDF multi-boutiques             | Écartée  | Marquée « À venir »                                            |

---

## 2. Tests multi-support

### 2.1 Web (desktop 1440 × 900)

| Vérification                                       | Résultat |
| -------------------------------------------------- | -------- |
| Tableau de bord sur une boutique                   | ✅ `01`  |
| Tableau de bord en agrégat (2 boutiques)           | ✅ `02`  |
| Performances : comparaison + évolution journalière | ✅ `03`  |
| Alertes : 4 familles, tri par gravité              | ✅ `04`  |
| Activités : journal des 100 dernières actions      | ✅ `05`  |
| Recherche transverse                               | ✅ `06`  |
| Apparence : 3 thèmes                               | ✅ `07`  |
| Refus de périmètre hors espace                     | ✅ `08`  |
| Thème sombre appliqué au tableau de bord           | ✅ `09`  |

### 2.2 Mobile (390 × 844)

| Vérification                                               | Résultat |
| ---------------------------------------------------------- | -------- |
| Tableau de bord en une colonne, tables défilables          | ✅ `10`  |
| Performances : graphique lisible, pas de débordement       | ✅ `11`  |
| Recherche accessible (elle ne l'est plus seulement en CSS) | ✅ `12`  |
| Tiroir de navigation ouvert                                | ✅ `13`  |

### 2.3 Mini App Telegram (390 × 844)

| Vérification                                                                          | Résultat                   |
| ------------------------------------------------------------------------------------- | -------------------------- |
| Accueil, sélecteur de boutique, KPI                                                   | ✅ `14`                    |
| Menu « Plus » : modules pliables, « Tout ouvrir », section Pilotage dépliée           | ✅ `15`                    |
| Débordement horizontal = 0                                                            | ✅ `e2e/mini-menu.spec.ts` |
| Onglets bas : Accueil, Boutiques, **Alertes** (aligné sur `/alertes`), Sécurité, Plus | ✅                         |
| « Tout ouvrir » / « Tout fermer »                                                     | ✅ `e2e/mini-menu.spec.ts` |

### 2.4 Automatisé

| Niveau                                        | Volume                  | Résultat                    |
| --------------------------------------------- | ----------------------- | --------------------------- |
| Vitest (unitaires + intégration, base réelle) | 41 fichiers / 247 tests | **245 réussis / 2 ignorés** |
| Playwright (E2E)                              | 58 tests                | **58/58 réussis**           |
| `tsc --noEmit`                                | —                       | **0 erreur**                |
| ESLint                                        | —                       | **0 erreur**                |
| `next build`                                  | —                       | **succès**                  |
| axe-core (accessibilité)                      | embarqué dans les E2E   | **0 violation bloquante**   |

---

## 3. Régressions rencontrées et résolution

| #   | Régression détectée                                                                                      | Gravité     | Cause                                                                                                                                                                  | Résolution                                                                                                                   | Statut    |
| --- | -------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| R1  | Typecheck : `pathname` inutilisé dans `app-shell.tsx`                                                    | Bloquante   | Import `usePathname` devenu inutile après le passage à `router.refresh()`                                                                                              | Suppression de l'import                                                                                                      | ✅ Résolu |
| R2  | Typecheck : imports inutilisés (`AlertTriangle`, `formatMoney`, `Link`, `maxRevenue`)                    | Bloquante   | Imports laissés après refonte des pages                                                                                                                                | Nettoyage                                                                                                                    | ✅ Résolu |
| R3  | E2E : « Vue d'ensemble » introuvable                                                                     | Moyenne     | Rubrique renommée « Tableau de bord »                                                                                                                                  | Test aligné sur la nouvelle organisation                                                                                     | ✅ Résolu |
| R4  | E2E : menu sans lien `/performances`                                                                     | Moyenne     | L'utilisateur de test n'avait **aucune boutique** → les rubriques conditionnelles (permission `reports:read`) étaient masquées                                         | Le test crée désormais une boutique avant d'inspecter le menu                                                                | ✅ Résolu |
| R5  | E2E : `getByText("PILOTAGE ALPHA")` résolvait sur un `<option>` masqué                                   | Mineure     | Sélecteur trop large (le `<option>` du sélecteur de boutique)                                                                                                          | Ciblage sur `data-testid="scope-bar"`                                                                                        | ✅ Résolu |
| R6  | E2E : `getByRole("alert")` ambigu                                                                        | Mineure     | Le routeur Next publie aussi un `role="alert"`                                                                                                                         | Ciblage sur `.first()`                                                                                                       | ✅ Résolu |
| R7  | Unitaire : « Vue d'ensemble » / « Indicateurs financiers » absents de la navigation                      | Moyenne     | Le test de navigation verrouillait l'**ancienne** organisation                                                                                                         | Test mis à jour : les libellés attendus suivent la nouvelle architecture, les rubriques supprimées sont retirées de la liste | ✅ Résolu |
| R8  | Unitaire : `upsertOrders(shopId, lignes)` — signature inexistante                                        | Bloquante   | Le helper d'insertion attend un tableau de lignes, chacune portant son `shopId`                                                                                        | Test corrigé (garde-fou multi-boutiques du helper conservé)                                                                  | ✅ Résolu |
| R9  | `getByText("CA commandes")` ambigu (KPI + note de méthode)                                               | Mineure     | Libellé présent deux fois, c'est voulu                                                                                                                                 | `.first()`                                                                                                                   | ✅ Résolu |
| R10 | Rôle `admin` ajouté en base par un script de démonstration                                               | Sans impact | `admin` n'existe pas dans le modèle de rôles (`owner`, `manager`, `stock`, `accountant`, `assistant`) → permissions nulles, comportement correct et vérifié            | Compte de démonstration repassé `owner`                                                                                      | ✅ Résolu |
| R11 | E2E : l'invitation d'un membre renvoyait 404                                                             | Moyenne     | `POST /api/auth/register` **pose une session** : inscrire le vendeur dans le contexte principal_session en avait fait le propriétaire, qui n'a pas accès à la boutique | Inscription faite dans un contexte jetable, puis invitation depuis le contexte du propriétaire                               | ✅ Résolu |
| R12 | Axe : contraste insuffisant sur le badge « Non rattachée » (1.98:1) et le texte d'avertissement (2.14:1) | Sérieuse    | La couleur d'avertissement `#F59E0B` n'est pas lisible sur fond clair                                                                                                  | `--warning` passe à `#92400E` en thème clair : **6.1:1** sur le fond des pastilles, 7.1:1 sur blanc                          | ✅ Résolu |

### 3.1 Régressions fonctionnelles (rapportées par l'utilisateur) — état

| Symptôme                                            | Cause                                              | Résolution                                                                | Preuve                                                    |
| --------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| « MaxiShops et NKSF renvoient les mêmes résultats » | `dashboardOverview()` sans filtre de boutique      | Filtre `shopIds` obligatoire + périmètre dans l'URL + bandeau de contexte | `02` (181 877 / 43 vs 116 514 / 23) et test d'intégration |
| « Je ne sais pas où aller »                         | 6 entrées de menu sur 7 pointaient vers des ancres | 6 pages dédiées, une par rubrique                                         | `e2e/pilotage.spec.ts`                                    |
| « La recherche n'existe pas sur mobile »            | Barre de recherche masquée par CSS sous `sm`       | Recherche devenue une page                                                | `12`                                                      |

---

## 4. Points d'attention pour la suite (non bloquants)

| #   | Point                                                                                                | Recommandation                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Le tableau de bord n'a pas de graphique (choix assumé)                                               | Le graphique est sur `/performances` ; à déplacer seulement si la demande le justifie                                                                       |
| P2  | `middleware.ts` ne couvre que `/dashboard`                                                           | Sans effet sur la sécurité (vérification serveur systématique) ; élargir pour uniformiser les redirections                                                  |
| P3  | La recherche transverse porte sur toutes les boutiques de l'utilisateur, pas sur le périmètre filtré | Choix assumé et écrit dans l'interface (« la recherche ne porte que sur ce à quoi vous avez droit ») ; aligner si l'utilisateur veut un comportement strict |
| P4  | La Mini App affiche le tableau de bord complet (long défilement)                                     | Éventuelle version condensée pour la Mini App                                                                                                               |
| P5  | Le compte de démonstration `demo-captures@exemple.ci` a servi aux captures                           | Purge effectuée en fin de session (le motif `@exemple.ci` est purgé automatiquement par le harnais E2E)                                                     |

---

## 5. Vérification en production (25/11/2026)

Déploiement : CI verte → workflow « Déploiement Render » → `https://tout-en-un-business-manager.onrender.com`.

| Contrôle                                     | Résultat                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health`                                | `200` · `status: ok`                                                                                                                |
| Webhook Telegram sans secret                 | `401` (protégé)                                                                                                                     |
| Pages du pilotage                            | `/dashboard`, `/performances`, `/alertes`, `/activites`, `/recherche`, `/apparence` → `307` (session requise, donc pages présentes) |
| `/api/dashboard`, `/api/search` sans session | `401`                                                                                                                               |
| **MaxiShopsCI**                              | **181 877 F** · 43 articles · net à verser 327 944 F                                                                                |
| **NKSF SHOP**                                | **116 514 F** · 25 articles · net à verser 289 657 F                                                                                |
| **Agrégat**                                  | **298 391 F** (= somme exacte des deux)                                                                                             |
| Boutique hors périmètre                      | refus affiché : « Cette boutique n'est pas dans votre périmètre »                                                                   |

Le reproche d'origine est donc **corrigé et vérifié en production** : les deux boutiques
renvoient des chiffres différents, et l'agrégat vaut leur somme.

Script reproductible : `node scripts/verif-perimetre.mjs [url]`.
Sauvegarde de la base au moment du déploiement : `backups/backup-2026-11-25-11-22-51.sql.gz`
(copie Drive : `1P37HJKiJTZ5VgSG2fLQAw2ZgetKCFwnt`).

---

## 6. Emplacements des preuves

| Preuve                                                    | Chemin                                                  |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Audit                                                     | `docs/audit-refonte-pilotage.md`                        |
| Proposition + architecture fonctionnelle                  | `docs/proposition-architecture-fonctionnelle.md`        |
| Conception                                                | `docs/conception-pilotage.md`                           |
| Matrice, tests, régressions                               | `docs/matrice-etat-regressions.md` (ce document)        |
| Captures                                                  | `docs/captures/01-…` à `docs/captures/15-…`             |
| Script de captures                                        | `scripts/captures.mjs`                                  |
| Script de vérification du périmètre (local ou production) | `scripts/verif-perimetre.mjs`                           |
| Préparation du compte de démonstration                    | `scripts/demo-account.mjs`                              |
| Test d'intégration du périmètre                           | `src/lib/__tests__/dashboard-scope.integration.test.ts` |
| Test E2E du pilotage                                      | `e2e/pilotage.spec.ts`                                  |
| Test E2E du tableau de bord                               | `e2e/dashboard.spec.ts`                                 |

---

## 7. Lot « Ventes & Commandes » — matrice, tests et régressions (25/11/2026)

### 7.1 Arborescence livrée (quatre rubriques exactement)

| Rubrique                    | Sous-vues                                                  | Adresse                                       | Permission    |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------- | ------------- |
| **A. Toutes les commandes** | Historique · Annulées                                      | `/commandes` · `/commandes/annulees`          | `orders:read` |
| **B. À traiter**            | hub · En attente · Prêtes à expédier · Factures à imprimer | `/commandes/a-traiter` (+3)                   | `orders:read` |
| **C. Expédiées**            | Expédiées · Retours                                        | `/commandes/expediees` · `/commandes/retours` | `orders:read` |
| **D. Villes & localités**   | —                                                          | `/commandes/villes`                           | `orders:read` |
| hors menu                   | Clients · Exports de commandes                             | `/commandes/clients` · `/commandes/exports`   | `orders:read` |
| détail                      | commande                                                   | `/commandes/[id]`                             | `orders:read` |

`/commandes/factures` répond par une redirection permanente vers `/commandes/a-traiter/factures`.

### 7.2 Définitions des compteurs et des montants

| Indicateur          | Définition retenue                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commandes           | nombre de commandes correspondant aux filtres **et** à la vue affichée, calculé sans limite de lignes                                                          |
| Total affiché       | somme des montants des commandes affichées ; **ce n'est pas le CA encaissé** (une commande livrée ou expédiée n'est pas nécessairement encaissée)              |
| Devises multiples   | total non additionné, affiché « — » avec l'explication                                                                                                         |
| En attente          | préparation **non** confirmée (statut d'attente, ou statuts multiples dont `packed < total`)                                                                   |
| Prêtes à expédier   | préparation **confirmée** (`packed ≥ total > 0`, ou statut « prêt à expédier ») et expédition non faite                                                        |
| Expédiées           | expédition réellement confirmée (`SHIPPED`, `PICKED_UP`)                                                                                                       |
| Retours             | tous les retours, **sans** catégorie obligatoire par motif (le motif est dans le détail)                                                                       |
| Échecs (rubrique D) | commandes `FAILED` ; le taux = échecs ÷ commandes de la localité, **avec l'effectif affiché** ; sous 10 commandes, l'échantillon est signalé comme insuffisant |
| Annulées vs échecs  | deux notions distinctes : une annulation n'est pas un échec de livraison                                                                                       |

Une commande à **statuts multiples** n'est **jamais** comptée comme « prête à expédier » : le détail affiche « préparation partielle (x/y) ».

### 7.3 Régressions corrigées

| Symptôme                                                                | Cause                                                           | Résolution                                                                               | Preuve                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| « Le compteur s'arrête à 200 »                                          | la liste était tronquée à 200 lignes                            | compteurs calculés sans limite ; filtre de famille appliqué **en base**, avant la limite | `orders-workspace.integration.test.ts` (9/9)  |
| « Le total affiché ne correspond pas à la liste »                       | le total incluait des commandes non listées                     | le total porte sur les commandes **affichées**                                           | idem + capture `16`                           |
| « Une synchronisation partielle est annoncée comme réussie »            | `truncated` → `lastSyncStatus = "ok"`                           | état `partial` + message dédié dans l'interface                                          | `order-sync-window.test.ts` (4/4)             |
| « Un changement de statut sur une commande ancienne n'apparaît jamais » | la synchronisation ne lisait que `createdAfter/createdBefore`   | `updatedAfter` / `updatedBefore` utilisés                                                | idem                                          |
| « L'export ignore la période et le statut »                             | les routes d'export ne lisaient pas `from`/`to`/`status`        | les deux routes appliquent les filtres, et couvrent toute la sélection (5 000 lignes)    | `export.spec.ts` + `ventes-commandes.spec.ts` |
| « Le bouton est illisible en mode sombre »                              | `bg-primary-600` est un bleu clair en sombre (contraste 2,63:1) | boutons passés en `bg-primary` (blanc lisible, AA)                                       | audit axe : **10/10**                         |
| « Aucune commande » était invisible                                     | le message était caché dans la section repliée                  | l'état vide est toujours affiché                                                         | `commandes.spec.ts`                           |
| « Sept rubriques dans le menu »                                         | menu antérieur                                                  | quatre rubriques ; Retours et Factures deviennent des sous-rubriques                     | `navigation-ventes.test.ts` (10/10)           |

### 7.4 Tests exécutés

| Suite                            | Commande                                               | Résultat                                            |
| -------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Unitaires + intégration          | `npm test`                                             | **288 réussis / 2 ignorés** (46 fichiers)           |
| End-to-end                       | `npx playwright test`                                  | **71/71**                                           |
| Accessibilité (axe, WCAG 2.1 AA) | `e2e/accessibilite.spec.ts`                            | **10/10** (dont les 9 écrans ventes + thème sombre) |
| Qualité statique                 | `npm run typecheck` · `npm run lint` · `npm run build` | verts                                               |

Nouveaux fichiers de test :
`src/lib/__tests__/order-status.test.ts` (13) · `src/lib/__tests__/orders-workspace.integration.test.ts` (9) ·
`src/lib/__tests__/order-sync-window.test.ts` (4) · `src/lib/__tests__/order-sync-policy.test.ts` (7) ·
`src/lib/__tests__/navigation-ventes.test.ts` (10) · `e2e/ventes-refonte.spec.ts` (7) · `e2e/mini-ventes.spec.ts` (2).

### 7.5 Non testé automatiquement (à dire tel quel)

| Élément                                   | Pourquoi                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Synchronisation réelle contre l'API Jumia | quota + secrets : le test automatisé simule la couche HTTP et vérifie les filtres, la pagination et l'absence de jeton |
| Comportement au-delà de 5 pages           | dépend du quota réel du compte vendeur                                                                                 |
| Factures                                  | l'API Vendor Center utilisée n'en fournit pas ; aucune n'est fabriquée                                                 |
| Rendu sur un téléphone Telegram réel      | l'anti-rebond du client n'est pas reproductible en test ; captures mobile fournies                                     |

### 7.6 Emplacements des preuves

| Preuve                            | Chemin                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Plan de migration (avant → après) | `docs/plan-refonte-ventes-commandes.md`                                             |
| Classification des statuts        | `src/lib/order-status.ts`                                                           |
| Politique de synchronisation      | `src/lib/order-sync-policy.ts`                                                      |
| Socle des vues                    | `src/components/order-workspace.tsx`                                                |
| Panneau de synchronisation        | `src/components/order-sync-panel.tsx`                                               |
| Captures ventes                   | `docs/captures/16-ventes-a-historique.png` … `docs/captures/28-mini-app-ventes.png` |

---

## 8. Vérification en production (25/11/2026)

Déploiement : CI verte → workflow « Déploiement Render » → `https://tout-en-un-business-manager.onrender.com`.
Commits : `6b794ea` (refonte) et `f8e957a` (total « À traiter » aligné sur son compteur).

### 8.1 Sécurité et disponibilité

| Contrôle                                                                            | Résultat                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `/api/health`                                                                       | `200` · `status: ok` · migrations à jour                |
| Webhook Telegram sans secret                                                        | `401` (protégé)                                         |
| Les 11 pages du module sans session                                                 | `307` (redirection vers la connexion — pages présentes) |
| `/api/shops`, `/api/dashboard`, `/api/search`, `/api/commandes/export` sans session | `401`                                                   |

### 8.2 Module « Ventes & Commandes » sur les données réelles

Contrôle automatisé par `node scripts/verif-ventes.mjs` (nouveau script, dans le dépôt).

| Vue                                   | Commandes           | Total affiché  | Liste                                                               |
| ------------------------------------- | ------------------- | -------------- | ------------------------------------------------------------------- |
| A — Toutes les commandes (Historique) | **268**             | 1 318 006 FCFA | 200 lignes (plafond d'écran)                                        |
| A — Annulées                          | **49**              | 235 069 FCFA   | 49 lignes                                                           |
| B — À traiter                         | **5**               | 28 355 FCFA    | hub                                                                 |
| B — En attente                        | **2**               | 14 618 FCFA    | 2 lignes                                                            |
| B — Prêtes à expédier                 | **3**               | 13 737 FCFA    | 3 lignes                                                            |
| B — Factures à imprimer               | —                   | —              | _API Vendor Center ne fournit pas de factures : rien n'est inventé_ |
| C — Expédiées                         | **14**              | 68 371 FCFA    | 14 lignes                                                           |
| C — Retours                           | **3**               | 20 747 FCFA    | 3 lignes                                                            |
| D — Villes & localités                | 314 (hors annulées) | 1 548 526 FCFA | 79 localités agrégées                                               |

Contrôles automatiques :

| Contrôle                                                                                | Résultat |
| --------------------------------------------------------------------------------------- | -------- |
| Cohérence compteurs (268 + 49 = **317** commandes)                                      | **OUI**  |
| Listes affichées ≤ compteurs (plafond 200 par vue)                                      | **OUI**  |
| Somme « À traiter » = « En attente » + « Prêtes à expédier » (14 618 + 13 737 = 28 355) | **OUI**  |
| Sous-rubriques présentes sur chaque écran                                               | **OUI**  |
| Refus hors périmètre affiché                                                            | **OUI**  |
| Jeton Jumia exposé dans les pages                                                       | **NON**  |

### 8.3 Non-régression du lot « pilotage »

`node scripts/verif-perimetre.mjs` : MaxiShopsCI 181 877 F / 43 articles / net 327 944 F ;
NKSF SHOP 116 514 F / 25 articles / net 289 657 F ; agrégat **298 391 F** (= somme exacte) ;
refus hors périmètre affiché. **Les deux boutiques renvoient toujours des chiffres différents.**

### 8.4 Base et sauvegarde

| Élément                                     | Valeur                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| État après purge du compte de démonstration | 1 utilisateur · 2 boutiques · **317 commandes** · 48 produits · 26 relevés |
| Sauvegarde                                  | `backups/backup-2026-11-25-13-59-07.sql.gz` (23 tables)                    |
| SHA-256                                     | `73a50c322d645508a238dd05a0d48c54292f44d41fb2c8492915f19b89020311`         |

### 8.5 Ce qui reste à faire manuellement

| Action                                                                                      | Pourquoi                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Synchronisation réelle Jumia sur les deux boutiques (bouton « Synchroniser cette période ») | quota + secrets : jamais exécuté automatiquement ; à faire une fois après déploiement          |
| Lecture du comportement au-delà de 5 pages de 200                                           | dépend du quota réel du compte vendeur                                                         |
| Rendu sur un téléphone Telegram réel                                                        | l'anti-rebond du client n'est pas reproductible en test ; captures mobile (390 × 844) fournies |

---

## 9. Lot « Boutiques & Plateformes » et publication de produits Jumia (25/11/2026)

### 9.1 Section C — quatre rubriques exactement

| Rubrique                       | Adresse                       | Permission       | État                                        |
| ------------------------------ | ----------------------------- | ---------------- | ------------------------------------------- |
| **Toutes les boutiques**       | `/boutiques`                  | `shops:read`     | ✅ une carte par boutique autorisée         |
| **Ajouter une boutique Jumia** | `/boutiques/ajouter`          | `shops:write`    | ✅ Self Authorization, choix de la boutique |
| **Ajouter un produit**         | `/boutiques/produits/nouveau` | `products:write` | ✅ boutique obligatoire                     |
| **Réseaux sociaux**            | —                             | —                | ⏳ « bientôt », aucun lien, aucune fonction |

Les anciennes rubriques distinctes « Connexions Jumia », « Synchronisations » et « Réglages
boutiques » **ne sont plus des entrées de menu**. Les opérations correspondantes restent
atteignables **depuis** « Toutes les boutiques » et « Ajouter une boutique Jumia » : aucune
fonction n'est perdue, seule la hiérarchie change.

Preuve : `src/lib/__tests__/navigation-boutiques.test.ts` · `src/lib/__tests__/navigation.test.ts` ·
`e2e/boutiques-platesformes.spec.ts`.

### 9.2 Ce qui est refusé, et où

| Refus                                        | Où                         | Preuve                                   |
| -------------------------------------------- | -------------------------- | ---------------------------------------- |
| `client_secret` demandé                      | jamais demandé (interface) | parcours Self Authorization              |
| Période absente ou inversée                  | **serveur**                | `order-sync-window` + panneau de sync    |
| Boutique absente / inconnue                  | **serveur** (404)          | `getShopAccess` dans les routes produit  |
| Permission `products:write` absente          | **serveur** (403)          | route publications + audit `blocked`     |
| Boutique non rattachée à Jumia               | **serveur** (409)          | route publications                       |
| SKU déjà envoyé / déjà au catalogue          | **serveur** (409)          | `findExistingSku` + `skuExistsInCatalog` |
| Catégorie inconnue du référentiel            | **serveur** (409)          | table `jumia_catalog_categories`         |
| Attribut obligatoire manquant                | **serveur** (422)          | `validateAgainstAttributeSet`            |
| Produit « publié » annoncé sans vérification | interface + suivi serveur  | `publiée` exige produit actif + QC       |

Aucun jeton Jumia n'est renvoyé, journalisé ni exporté : les jetons sont chiffrés (AES-256-GCM)
et la rotation est immédiate.

### 9.3 États d'une publication

| État            | Signification                                                                     |
| --------------- | --------------------------------------------------------------------------------- |
| `envoyee`       | la demande a été transmise à Jumia — **le produit n'est pas encore publié**       |
| `en_traitement` | le flux est traité par Jumia                                                      |
| `acceptee`      | Jumia a accepté la fiche, le contrôle qualité n'est pas encore terminé            |
| `rejetee`       | Jumia a refusé la fiche (motifs affichés)                                         |
| `publiee`       | **uniquement** si le produit est retrouvé au catalogue, actif, visible, QC validé |

« Publiée » n'est **jamais** affichée au clic : elle suppose la relecture du flux **et** du
catalogue.

### 9.4 Ce que MIMI ne fait pas

| Règle                           | Mise en œuvre                                                 |
| ------------------------------- | ------------------------------------------------------------- |
| Aucune caractéristique inventée | valeur inconnue = `null`, jamais une estimation               |
| Poids et matériau               | `null` sans preuve explicite → vérification humaine           |
| Catégories                      | uniquement des codes présents dans le référentiel Jumia local |
| Images                          | images **existantes** (Openverse), jamais générées            |
| Droits d'usage                  | licence, source et attribution vérifiées avant choix          |

### 9.5 Tests exécutés

| Suite                      | Commande                                                                                       | Résultat                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Unitaires + intégration    | `npm test`                                                                                     | **333 réussis / 2 ignorés** (49 fichiers) |
| End-to-end                 | `npx playwright test e2e/boutiques-platesformes.spec.ts e2e/publication-produit-jumia.spec.ts` | **5/5**                                   |
| End-to-end (suite entière) | `npx playwright test`                                                                          | **76 réussis / 0 échec**                  |
| Qualité statique           | `npm run typecheck` · `npm run lint` · `npm run build`                                         | verts                                     |

Nouveaux fichiers de test :
`src/lib/__tests__/navigation-boutiques.test.ts` (8) ·
`src/lib/__tests__/jumia-product-creation.test.ts` (20) ·
`src/lib/__tests__/product-assistant.test.ts` (16) ·
`e2e/boutiques-platesformes.spec.ts` (2) ·
`e2e/publication-produit-jumia.spec.ts` (3).

### 9.5 bis. Référentiel des catégories chargé en production (25/11/2026)

| Boutique    | Catégories | Avec ensemble d'attributs | Pages | État       |
| ----------- | ---------- | ------------------------- | ----- | ---------- |
| MaxiShopsCI | 27 147     | 27 147                    | 271   | complet ✅ |
| NKSF SHOP   | 27 147     | 27 147                    | 271   | complet ✅ |

Le chargement est déclenché par la **route de l'application**
(`POST /api/shops/:id/catalogue/referentiel`) : permissions, audit et avancement
sont ceux du produit. Aucun produit n'a été envoyé à Jumia.

Correctif associé : `app_settings.value` est un `jsonb`, dont la valeur est relue
**déjà décodée** (un objet) et non comme la chaîne JSON écrite. La lecture de
l'état du chargement acceptait uniquement une chaîne : l'état était perdu à la
relecture et un chargement terminé restait affiché comme « en cours » (avec un
rafraîchissement de l'interface toutes les 5 secondes). `parseCatalogSyncState`
accepte désormais les deux formes — 4 tests unitaires dédiés.

### 9.6 Non testé automatiquement (à dire tel quel)

| Élément                                   | Pourquoi                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Envoi réel d'un produit à Jumia           | quota d'écriture + secrets : **aucun flux n'a été envoyé** ; l'état de la table `product_publications` est vide |
| Synchronisation réelle des commandes      | quota + secrets : la couche HTTP est simulée                                                                    |
| Relecture du QC Jumia sur un vrai produit | dépend d'un flux réellement accepté par la plateforme                                                           |
| Rendu sur un téléphone Telegram réel      | l'anti-rebond du client n'est pas reproductible en test                                                         |
