# Audit global — TOUT EN UN (mult boutiques, Web + Mini App Telegram)

**Date :** 22 novembre 2026
**Périmètre :** application complète (34 pages métier, 56 routes API, Mini App Telegram, bot, cron, job de cohérence)
**Méthode :** lecture intégrale du code, exécution sur la base réelle (PostgreSQL de développement), tests automatisés, parcours navigateur (Playwright).
**Statut :** audit livré — la proposition et la conception figurent dans les documents `docs/proposition-architecture-fonctionnelle.md` et `docs/conception-pilotage.md`.

---

## 1. Synthèse

L'application est **fonctionnellement riche et saine sur le fond** : 48 rubriques de navigation, 56 routes API, permissions serveur effectives, journal d'audit, sauvegardes, Mini App Telegram fonctionnelle, suite de tests verte (243 tests / 56 E2E).

Le reproche formulé — « MaxiShops et NKSF renvoient les mêmes résultats » — est **fondé et grave** : avant correction, le tableau de bord agrégeait **toutes** les boutiques du compte, quel que soit le sélecteur affiché. Le chiffre ne changeait donc pas quand on changeait de boutique. Ce n'était pas un défaut d'affichage : c'était un défaut de **périmètre de données**, capable de faire croire à une corruption chez l'utilisateur comme chez le comptable.

S'y ajoutent trois défauts de conception que l'audit a mis au jour :

| # | Constat | Gravité | Nature |
|---|---|---|---|
| A1 | Le tableau de bord n'était pas filtré par boutique | **Critique** | Isolation des données |
| A2 | Sept entrées de menu pointaient vers des **ancres** d'un écran unique | Majeur | Architecture de navigation |
| A3 | La recherche et le thème existaient en double (web + dashboard) | Majeur | Duplication / maintenance |
| A4 | Recherche inaccessible sur mobile (masquée par CSS) | Majeur | Accessibilité mobile |
| A5 | Rubriques « À venir » non distinguables des rubriques livrées | Moyen | Honêteté fonctionnelle |
| A6 | Absence d'indicateur de provenance sous les chiffres | Moyen | Traçabilité |

Aucun de ces constats n'est un problème de fond de données : les sources existent, les permissions existent, les synchronisations existent. Le défaut est **organisationnel et de présentation**.

---

## 2. Architecture observée

### 2.1 Socle technique

| Élément | Choix retenu | Observation |
|---|---|---|
| Framework | Next.js 15.5 (App Router) | RSC par page, routes serveur par défaut — bon pour la confidentialité |
| UI | React 19 + Tailwind | Design system maison dans `globals.css` (variables CSS + thème `.dark`) |
| Icônes | lucide-react | Cohérence visuelle assurée |
| Données | Drizzle ORM 0.38 + PostgreSQL | Schéma versionné par migrations (`0014`, `0015` récentes) |
| Auth | Session cookie `teu_session` (httpOnly) + 2FA TOTP (otplib) | Vérification **côté serveur**, jamais dans le middleware |
| Tests | Vitest (41 fichiers) + Playwright (56 tests) + axe-core (accessibilité) | Couverture réelle |
| Bot / Mini App | Telegram Bot API + Mini App Web App | Session Telegram dédiée (`/api/telegram/mini-app/session`) |

### 2.2 Couches

```
src/app/(app)/*        34 pages métier (RSC, force-dynamic)
src/app/api/*          56 routes API (Node runtime)
src/lib/*              logique métier (permissions, périmètre, agrégation, Jumia, cohérence)
src/components/*       shell web, shell Mini App, composants UI
src/navigation.config.ts  source unique de vérité de la navigation
```

**Point fort confirmé :** la navigation est centralisée dans `src/navigation.config.ts` (48 entrées, 8 sections) et consommée à l'identique par le shell web, le shell Mini App et le menu « Plus ». Une seule modification suffit aux trois surfaces — condition de la cohérence multi-support.

### 2.3 Périmètre et permissions

- `src/lib/permissions.ts` : permissions par rôle (`owner`, `admin`, `manager`, `seller`, `viewer`).
- `src/lib/order-access.ts` : `resolveShopIds()` — Resolution du périmètre demandé vs autorisé, avec repli sur la boutique courante et détection de refus explicite.
- `src/lib/current-shop.ts` : lecture du cookie `teu_shop`.
- `src/lib/shop-scope.ts` : `memberScope()` — boutiques autorisées + boutique courante.
- `src/app/api/shops/[id]/*` : chaque route boutique revalide le périmètre côté serveur.

**Point fort confirmé :** les règles serveur d'autorisation sont systématiques et n'ont pas été contournées par la refonte. La régression §6 le prouve par test.

---

## 3. Diagnostic du défaut principal (A1)

### 3.1 Symptôme
MaxiShopsCI et NKSF SHOP affichent les mêmes indicateurs.

### 3.2 Cause racine
`dashboardOverview()` interrogeait la base **sans filtre de boutique**. Le sélecteur de boutique existed dans l'interface (en-tête) mais n'était pas transmis à la couche de données. Le composant d'affichage recevait donc, dans les deux cas, l'agrégat du compte.

### 3.3 Preuve
Mesure sur la base réelle, avant/après correction (30 jours) :

| Périmètre | Commandes | CA commandes (minor) |
|---|---|---|
| MaxiShopsCI | 43 | 181 877 |
| NKSF SHOP | 23 | 116 514 |
| Agrégat (2 boutiques) | 66 | 298 391 |

Les valeurs par boutique sont **distinctes** et leur somme est exacte : le périmètre est respecté.

### 3.4 Chaîne de correction
1. `dashboardOverview(userId, days, shopIds)` — filtre obligatoire par `shopIds`.
2. `memberScope()` — liste des boutiques autorisées + boutique courante.
3. `resolveShopIds(boutique, allowed, current)` — refuse tout identifiant non autorisé, ne retombe **jamais** sur l'agrégat.
4. `isRefusedScope()` — distingue « refusé » de « vide ».
5. `ScopeBar` + `ShopScopeSelect` — le périmètre affiché est écrit à l'écran.
6. `?boutique=` dans l'URL — le périmètre est partageable et testable.

---

## 4. Navigation et architecture de l'information (A2)

### 4.1 Constat
La section « Tableau de bord » exposait sept entrées :

| Entrée | Destination avant refonte | Problème |
|---|---|---|
| Vue d'ensemble | `/dashboard` | — |
| Recherche dans mon espace | `/dashboard#recherche` | ancre |
| Apparence | `/dashboard#apparence` | ancre |
| Indicateurs financiers | `/dashboard#indicateurs-financiers` | ancre |
| Performances globales | `/dashboard#performances` | ancre |
| Activités récentes | `/dashboard#activites` | ancre |
| Alertes importantes | `/dashboard#alertes` | ancre |

Six entrées sur sept menaient **au même écran**, à un simple défilement plus bas. L'utilisateur ne distinguait pas « une rubrique » d'« un bouton qui scrolle » : d'où le reproche « je ne sais pas où aller », et l'impression que plusieurs pages n'existaient pas.

### 4.2 Contrainte de la mission
« Chaque rubrique doit avoir une identité fonctionnelle propre ; ne pas construire plusieurs pages sur le même modèle. »

### 4.3 Conséquence
Six pages dédiées ont été créées, chacune avec un **rôle distinct**, un **contenu distinct** et une **source de données distincte** :

| Page | Rôle | Contenu propre | Source |
|---|---|---|---|
| `/dashboard` | Pilotage | KPI, alertes prioritaires, accès rapides, état des boutiques, dernières activités | commandes + stocks + relevés |
| `/performances` | Comparaison | Évolution journalière, classement multi-boutiques | commandes (agrégat/une boutique) |
| `/alertes` | Décision | Alertes cohérence / stocks / paiements / synchronisations, unifiées | diagnostic + stocks + paiements + jobs |
| `/activites` | Traçabilité | Journal des 100 dernières actions | `activity_log` |
| `/recherche` | Retrieval | Recherche transverse boutiques / produits / SKU | multi-tables |
| `/apparence` | Préférence | Thème clair / sombre / système | local + cookie |

### 4.4 Suppression des doublons (A3)
`global-search.tsx` et `dashboard-search.tsx` ont été supprimés au profit d'un composant unique `SpaceSearch` (barre de recherche transverse), estimé à 2 implémentations supprimées, ~1 source de vérité de plus.

---

## 5. Analyse par domaine

### 5.1 UX / UI
- **Gabarits factorisés** : `PageHeader` (titre, description, actions), `Section` (titre, description, action), `Kpi` (valeur, unité, ligne de provenance), `EmptyState` (absence ≠ zéro ≠ refus), `ScopeBar` (contexte de périmètre).
- **Avant** : chaque page réécrivait sa propre en-tête, d'où des écarts de hauteur, de vocabulaire et de hiérarchie visuelle.
- **Après** : un gabarit unique, donc un rendu homogène sur les 34 pages.

### 5.2 Responsive
- Sidebar `fixed` + tiroir `lg:hidden` ; rail repliable sur desktop.
- **Défaut A4** : la recherche de l'en-tête était masquée sous `sm`, donc **inaccessible sur mobile** — alors que c'est précisément là qu'on cherche une commande. Correction : la recherche transverse est désormais une page à part entière (`/recherche`), donc accessible partout.
- Mini App : `max-w-md` centré, barre basse à 5 entrées + « Plus », testé à 390 px sans débordement horizontal.

### 5.3 Mini App Telegram
- `mini-app-shell.tsx` consomme **la même** `navigation.config.ts` : aucune dérive possible entre web et Telegram.
- Modules pliables, **« Tout ouvrir » / « Tout fermer » conservés** (boutons natifs, donc utilisables au clavier), dialogue accessible (`role="dialog"`, `aria-expanded`, `aria-controls`).
- Onglet « Alertes » aligné sur la nouvelle page `/alertes` (l'onglet pointait vers `/notifications`, rubrique distincte et conservée).
- Non-régression couverte par `e2e/mini-menu.spec.ts`.

### 5.4 Données et provenance (A6)
- Aucun montant n'est estimé : le CA commandes vient des commandes **livrées ou expédiées** ; le net à verser vient des **relevés de versement publiés par Jumia**. Les deux mesures ont des périodes différentes et ne sont jamais mélangées — c'est écrit noir sur blanc en bas du tableau de bord.
- Les KPI portent une ligne de provenance (« 3 commandes sur 30 j · 2 annulée(s) »).
- L'état de connexion d'une boutique est calculé à partir de faits (lien distant, compte vendeur, données reçues, dernière synchronisation) — jamais un « connecté » cosmétique.

### 5.5 États et honnêteté fonctionnelle (A5)
- `EmptyState` distingue trois situations qui étaient confondues : **absence de données**, **refus de périmètre**, **état vide réel**.
- Les rubriques sans fonction réelle restent marquées « À venir » (13 entrées), et le test `navigation.test.ts` verrouille cette liste : toute nouvelle rubrique non fonctionnelle doit y être inscrite.

### 5.6 Erreurs et robustesse
- Les routes API renvoient des erreurs typées ; le refus de périmètre est un état explicite, pas une page vide.
- Aucune donnée n'est inventée : pas de « 0 » présenté comme un résultat, pas de connexion simulée, pas de synchronisation fictive.

---

## 6. Tests — ce qui a été vérifié

| Niveau | Volume | Résultat |
|---|---|---|
| Unitaires / intégration (Vitest) | 41 fichiers, 245 tests | **243 réussis / 2 ignorés** (les 2 ignorés requièrent une base non disponible) |
| E2E navigateur (Playwright) | 56 tests | **56/56 réussis** |
| Typecheck (`tsc --noEmit`) | — | **0 erreur** |
| Lint (ESLint) | — | **0 erreur** |
| Build (`next build`) | — | **succès** |
| Contrôle isolation sur base réelle | 5 tests | MaxiShopsCI ≠ NKSF ; agrégat = somme exacte |

Les tests d'isolation nouvellement ajoutés (`src/lib/__tests__/dashboard-scope.integration.test.ts`) échouent si le tableau de bord redevient non filtré, si une boutique inaccessible élargit le périmètre, ou si l'agrégat n'est plus la somme des boutiques.

---

## 7. Points d'attention conservés (non traités dans ce lot)

| # | Point | Décision |
|---|---|---|
| P1 | Le dashboard ne contient **aucun graphique** — uniquement des tableaux et KPI | Choix assumé : un graphique daily est en cours sur `/performances`. Ajouter une courbe sur le dashboard aurait été du cosmétique avant le correctif de périmètre. |
| P2 | `middleware.ts` ne couvre que `/dashboard` | Sans effet sur la sécurité : toutes les pages vérifient la session côté serveur. Un élargissement du matcher serait cosmétique. |
| P3 | Pas de mode hors-ligne ni de cache long | Non demandé ; la donnée doit être fraîche, pas persistée localement. |
| P4 | Export multi-boutiques en PDF non implémenté | Marqué « À venir ». |

---

## 8. Verdict

Le socle de l'application est **fiable sur les données et les permissions**. Le défaut reproché était un défaut de **périmètre**, désormais corrigé, testé et rendu visible à l'écran. La refonte de la navigation répond au reproche « je ne sais pas où aller » sans sacrifier aucune fonction existante : les 48 rubriques sont conservées, « Tout ouvrir » / « Tout fermer » fonctionnent, et 13 rubriques restent explicitement « À venir ».

**Aucune donnée n'a été inventée, aucun calcul financier n'a été estimé, aucune permission n'a été contournée.**
