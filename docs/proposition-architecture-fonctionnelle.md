# Proposition & architecture fonctionnelle cible — TOUT EN UN

**Date :** 22 novembre 2026
**Statut :** proposition validée par la conception (`docs/conception-pilotage.md`) et réalisée.
**Chaîne de travail :** audit → proposition → conception → réalisation → tests → validation.

---

## 1. Intention

Faire de TOUT EN UN un **outil de travail SaaS multi-boutiques**, pas une application « jolie ». Le critère de réussite n'est pas l'esthétique d'une page mais la question que pose l'utilisateur au quotidien :

> « Où en est ma boutique, et qu'est-ce qui me bloque ? »

Trois principes gouvernent toute la proposition :

1. **Une rubrique = une fonction.** Une page a un rôle, un contenu et une destination. Aucune page n'est la copie d'une autre.
2. **Fidélité aux données.** Aucun chiffre sans source, aucun zéro sans absence de données, aucun statut sans fait vérifiable.
3. **Continuité.** Aucune fonction existante supprimée, aucune permission affaiblie, aucune régression de stabilité acceptée.

---

## 2. Diagnostic → proposition (traçabilité)

| Constat d'audit | Proposition retenue | Justification | Realisation |
|---|---|---|---|
| A1 — Dashboard non filtré par boutique | Périmètre explicite et obligatoire, porté par l'URL (`?boutique=`), affiché en permanence | Le reproche central ; l'utilisateur doit *voir* ce qu'il regarde | `dashboard.ts`, `order-access.ts`, `shop-scope.ts`, `ScopeBar` |
| A2 — 6 ancres sur 7 entrées | Une page dédiée par rubrique de pilotage | « Chaque rubrique a une identité fonctionnelle propre » | `/performances`, `/alertes`, `/activites`, `/recherche`, `/apparence` |
| A3 — Recherche et thème en double | Un seul composant, une seule page | Une seule source de vérité, moins de maintenance divergente | `SpaceSearch`, `ThemePicker`, suppression de 2 composants |
| A4 — Recherche inaccessible sur mobile | La recherche devient une page, donc accessible partout | La recherche est le premier réflexe sur mobile | `/recherche` |
| A5 — « À venir » peu lisible | Badge systématique + verrouillage par test | Une fonction non opérationnelle ne doit jamais ressembler à une fonction | `navigation.config.ts` + `navigation.test.ts` |
| A6 — Chiffres sans provenance | Ligne de provenance sous chaque KPI | Traçabilité exigée | `Kpi` |
| Absence / refus / zéro confondus | `EmptyState` à trois tons | Un zéro trompeur est pire qu'un vide | `EmptyState` |

---

## 3. Architecture fonctionnelle cible

### 3.1 Les trois plans

```
┌───────────────────────────────────────────────────────────────┐
│ PLAN 1 — PILOTAGE (section A)                               │
│   « Où j'en suis, qu'est-ce qui me bloque ? »                 │
│  Tableau de bord │ Performances │ Alertes │ Activités         │
│  Recherche │ Apparence                                           │
├───────────────────────────────────────────────────────────────┤
│ PLAN 2 — MÉTIER (sections B à G)                             │
│  Ventes et commandes │ Boutiques et plateformes │ Catalogue   │
│  Finances et comptabilité │ Analyses et rapports │ Autom. & IA │
├───────────────────────────────────────────────────────────────┤
│ PLAN 3 — ADMINISTRATION (section H)                          │
│  Utilisateurs │ Rôles │ Journal │ Diagnostic │ Paramètres │ …  │
└───────────────────────────────────────────────────────────────┘
```

Le **Plan 1** est le cockpit. Il n'est jamais un plan de travail : il ne contient pas de saisie, seulement de la lecture et de l'orientation. Le **Plan 2** est l'atelier : chaque page y est une tâche, avec son formulaire, son filtre, son export. Le **Plan 3** gouverne l'espace.

Cette séparation répond au reproche « je ne sais pas où aller » : une action et une observation ne se mélangent plus.

### 3.2 Matrice des responsabilités par rubrique de pilotage

| Rubrique | Question à laquelle elle répond | Ce qu'elle ne fait **pas** |
|---|---|---|
| Tableau de bord | « Comment va mon espace, en un coup d'œil ? » | Ne remplace pas les pages détaillées ; n'affiche aucun chiffre hors périmètre |
| Performances | « Quelle boutique progresse, laquelle recule ? » | Ne décide pas ; n'invente pas de tendance par interpolation |
| Alertes | « Que dois-je traiter maintenant ? » | Ne classe pas tout en alerte ; une alerte sans action est un bruit |
| Activités | « Qui a fait quoi, quand ? » | N'affiche que des faits déjà journalisés ; n'invente pas d'audit trail |
| Recherche | | « Où est ce que je cherche ? » | N'écrit rien ; ne cherch que dans mon périmètre |
| Apparence | « Comment veux-tu voir l'application ? » | Ne touche pas aux données |

### 3.3 Modèle de périmètre (invariant transverse)

C'est la règle structurante de toute l'architecture.

```
Utilisateur connecté
      │
      ▼
memberScope(userId) ──► boutiques autorisées (rôle) + boutique courante (cookie)
      │
      ▼
resolveShopIds(boutique demandé, autorisés, courante)
      ├── identifiant non autorisé ──► REFUS EXPLICITE (aucune donnée, aucun élargissement)
      ├── "toutes" / plusieurs       ──► AGRÉGAT (signalé comme tel)
      └── identifiant autorisé        ──► PÉRIMÈTRE RESTREINT
```

Invariants :

1. **Un filtre absent ne signifie jamais « tout »** — le repli est la boutique courante.
2. **Un identifiant inconnu ne fait jamais élargir le périmètre** vers l'agrégat.
3. **Le refus est un état affiché**, avec sa raison ; jamais une page vide, jamais un zéro.
4. **L'agrégat est toujours étiqueté** (« 2 boutiques », « Agrégat ») et atteint explicitement.
5. **Le périmètre est écrit dans l'URL** : partageable, testable, rechargeable sans perte d'état.

### 3.4 Modèle de l'information affichée

Chaque chiffre affiché suit la chaîne :

```
Source (fait)  →  Agrégation SQL (filtre périmètre)  →  Unité et devise  →  Valeur  →  Ligne de provenance
   (table)          (shopIds + période)               (minor → XOF)      (KPI)     ("3 commandes sur 30 j")
```

Règles strictes :

- **« CA commandes »** = somme des commandes livrées ou expédiées sur la période — source : table `orders`.
- **« Net à verser (Jumia) »** = somme des relevés de versement publiés — source : table `payout_statements`.
- Ces deux mesures ont des **périodes et des périmètres différents** : elles ne sont jamais fusionnées, et la mention est visible sur le tableau de bord.
- Aucune valeur n'est extrapolée, lissée ou estimée.

### 3.5 Modèle des états (invariants d'interface)

| État | Rendu | Exemple |
|---|---|---|
| Données présentes | Valeur + provenance | 43 commandes |
| Aucune donnée | « Aucune donnée sur cette période » | Boutique jamais synchronisée |
| Refus de périmètre | Alerte explicite, tone `danger` | Boutique hors périmètre |
| Permission insuffisante | « — » + raison | Rôle sans `finance:read` |
| Fonction non livrée | Badge « À venir » | Mouvements de stock |
| Fonction en panne | État d'erreur factuel | Jumia injoignable |

Ces six états sont distincts et ne doivent jamais être confondus : c'est la principale source de « corruption perçue » chez un utilisateur non technique.

---

## 4. Fonctionnalités supplémentaires (valeur / faisabilité)

| Fonction | Valeur | Faisabilité | Décision |
|---|---|---|---|
| Vue consolidée comparative | Comparer ses boutiques sans exporter | Données déjà là, agrégation par `shopIds` | **Retenue** — `/performances` |
| Journal d'activité | Qui a fait quoi | Table `activity_log` existante | **Retenue** — `/activites` |
| Alertes unifiées | Une seule file d'attente | Diagnostic + stocks + paiements existants | **Retenue** — `/alertes` |
| Recherche transverse | Trouver une commande, un produit, un SKU | Index multi-tables | **Retenue** — `/recherche` |
| Choix de thème | Confort de lecture, Telegram sombre | CSS variables existantes | **Retenue** — `/apparence` |
| Badge de fraîcheur sur les chiffres | Savoir si le chiffre est à jour | `last_sync_at` disponible | **Retenue** — bandeau de contexte |
| Graphique daily d'évolution | Voir une tendance | Non construit | **Différé** — aucune courbe sans source de dates fiable |
| Score de santé d'une boutique | Anticiper les pannes | Calculable mais non étayé | **Écarté** — risque de chiffre arbitraire |
| Prévision de CA | Anticiper le mois | Non fiable, aucun historique suffisant | **Écartée** — inventer un chiffre est exclu par principe |
| Budget / objectifs | Suivi d'objectifs | Aucune source | **À venir** |

Les trois dernières lignes illustrent la règle : **la valeur ne suffit pas, la véracité suffit**. Ce qui ne peut pas être adossé à une source réelle reste « À venir ».

---

## 5. Contraintes de réalisation

| Contrainte | Traduction technique |
|---|---|
| Ne rien inventer | Agrégations SQL pures ; pas d'estimation, pas de repli sur une valeur plausible |
| Ne pas contourner les permissions | `getShopAccess` / `resolveShopIds` consultedés côté serveur sur chaque page et chaque API |
| Ne pas confondre les boutiques | Filtre `shopIds` obligatoire dans toutes les agrégations |
| Conserver « Tout ouvrir » / « Tout fermer » | Conservés dans la Mini App, testés par `e2e/mini-menu.spec.ts` |
| Cohérence Web / mobile / Telegram | Une seule `navigation.config.ts`, une seule Mini App, un seul design system |
| Pas de régression de stabilité | Typecheck, lint, 245 tests, 58 E2E, build : tout vert avant livraison |
| Performance | Filtrage en base (jamais en mémoire) ; pagination côté serveur ; pas de requête par ligne |

---

## 6. Architecture de rendu retenue

```
┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ app-shell    │   │ page-header      │   │ section            │
│ (web)        │   │ scope-bar        │   │ kpi                │
│ mini-app-    │   │ shop-scope-      │   │ empty-state       │
│ shell (TG)   │   │ select           │   │ table / list      │
└──────────────┘   └──────────────────┘   └────────────────────┘
        │                     │                      │
        └─────────────────────┴──────────────────────┘
                              │
                     page métier (RSC)
                              │
              lib/ (agrégation, périmètre, permissions)
                              │
                          PostgreSQL
```

Les pages sont des **RSC** : les chiffres sont calculés côté serveur, dans le périmètre de l'utilisateur, et envoyés déjà filtrés. Le client ne reçoit jamais de données d'une boutique non autorisée — la confidentialité ne repose pas sur un masquage visuel.

---

## 7. Ce qui ne change pas

- Les 48 rubriques de navigation et les 8 sections (une section renommée : « Tableau de bord » → « **Pilotage** »).
- Les 34 pages métier existantes, leurs filtres, leurs exports.
- Les 56 routes API et leurs contrôles d'accès.
- Les 13 rubriques « À venir » et leur verrouillage par test.
- Le bot Telegram, la Mini App, le cron de cohérence, les sauvegardes, la 2FA.
- Le schéma de base (aucune migration ajoutée par ce lot).
