# Conception — nouvelle organisation du tableau de bord et du pilotage

**Date :** 22 novembre 2026
**Statut :** conception réalisée, testée, non encore publiée.
**Documents amont :** `docs/audit-refonte-pilotage.md` (audit), `docs/proposition-architecture-fonctionnelle.md` (proposition).

---

## 1. Plan de l'interface

### 1.1 Web — structure d'un écran de pilotage

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Logo]  TOUT EN UN            [Recherche transverse…]  [Boutique ▾] [◑] │  ← app-shell
├────────────────────────────────────────────────────────────────────────┤
│  Tableau de bord                                        [Actualiser ▾] │  ← PageHeader
│  L'état de votre espace : ce qui est vendu…                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ⓘ NKSF SHOP · 01/10 → 30/11 · 30 jours  [7|30|90 j] [Actualiser] │  │  ← ScopeBar
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │CA cmds   │ │Articles  │ │Stocks    │ │Net à     │                  │  ← Kpi ×4
│  │298 391 F │ │vendus    │ │faibles 0 │ │verser    │                  │     (valeur + provenance)
│  │66 cmds…  │ │…         │ │…         │ │…         │                  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
│                                                                        │
│  ┌────────────────────────────────┐ ┌──────────────────┐                │
│  │ Alertes prioritaires      →    │ │ Accès rapides    │                │  ← Section ×2
│  │ ▸ 3 produits en rupture…      │ │ → Commandes…     │                │
│  │ (ou : « Rien à traiter »)      │ │ → Stocks…        │                │
│  └────────────────────────────────┘ └──────────────────┘                │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ État de mes boutiques                              [Comparer →] │  │
│  │ Boutique │ État │ CA période │ Commandes │ Dernière synchro.     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Dernières activités                                [Journal →]   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Note de méthode : deux mesures distinctes, jamais mélangées…        │
└────────────────────────────────────────────────────────────────────────┘
```

**Principe de lecture :** de haut en bas, l'utilisateur traverse une pyramide — *où j'en suis* (KPI) → *ce qui me bloque* (alertes) → *ce que je fais maintenant* (accès rapides) → *comment va l'ensemble* (état des boutiques) → *ce qui s'est passé* (activités).

### 1.2 Rôles des composants

| Composant | Responsabilité unique | Ce qu'il ne fait pas |
|---|---|---|
| `PageHeader` | Titre, description, actions de page | Ne contient pas de donnée |
| `ScopeBar` | Contexte : périmètre, période, fraîcheur | Ne change pas le périmètre lui-même |
| `ShopScopeSelect` | Change le périmètre, écrit dans l'URL | Ne décide pas des droits |
| `Kpi` | Une valeur, son unité, sa provenance | Ne calcule rien |
| `Section` | Titre, description, action, contenu | N'impose pas de type de contenu |
| `EmptyState` | Absence / refus / vide, distingués | Ne masque jamais une erreur |
| `SpaceSearch` | Recherche transverse | N'écrit rien |
| `ThemePicker` | Thème clair / sombre / système | Ne touche pas aux données |

### 1.3 Mini App Telegram — adaptation, pas copie

La Mini App ne recopie pas le web : elle en conserve la **logique** (même périmètre, mêmes permissions, mêmes états) et en adapte la **forme** (largeur 390 px, barre basse à 5 entrées).

```
┌──────────────────────────┐
│ ← [Logo] Tableau de bord │  ← header compact + sélecteur de boutique
├──────────────────────────┤
│                          │
│      contenu             │  ← même source, rendu compact
│                          │
├──────────────────────────┤
│  ⌂     🏪     🔔     🛡  │  ← Accueil │ Boutiques │ Alertes │ Sécurité │ Plus
│ Accueil Bout. Alertes …  │
└──────────────────────────┘
```

Le menu « Plus » reprend les sections pliables, avec **« Tout ouvrir » / « Tout fermer »** (boutons natifs → utilisables au clavier et par lecteur d'écran).

---

## 2. Conception par page

### 2.1 `/dashboard` — Centre de pilotage

**Rôle** : état global du périmètre affiché.
**Données** : commandes, stocks, relevés de versement, diagnostic, journal.
**Permissions** : `finance:read`, `reports:read`, `inventory:read` appliquées **par bloc**, sur le périmètre affiché.
**Périmètre** : boutique courante par défaut ; `?boutique=<id>` ou `?boutique=toutes`.
**Période** : `?days=7|30|90` (défaut 30).

Blocs :
1. **Bandeau de contexte** — nom de la boutique (ou « N boutiques »), fenêtre de dates, période, sélecteur de période.
2. **4 KPI** — CA commandes, articles vendus, stocks faibles, net à verser. Chacun porte sa provenance.
3. **Alertes prioritaires** (5 max) + lien « Tout voir → » vers `/alertes`.
4. **Accès rapides** — 6 raccourcis vers les tâches du quotidien.
5. **État de mes boutiques** — tableau : boutique, état factuel, CA période, commandes, dernière synchronisation.
6. **Dernières activités** (6 max) + lien « Journal complet → » vers `/activites`.
7. **Note de méthode** — rappel que CA commandes et net à verser sont deux mesures distinctes, non estimées.

### 2.2 `/performances` — Comparaison multi-boutiques

**Rôle** : comparer la dynamique des boutiques.
**Contenu** : évolution journalière (commandes et CA par jour), classement des boutiques sur la période, concentration du volume.
**Différence fonctionnelle** : c'est la seule page qui **compare** ; le tableau de bord décrit, cette page oppose.
**Périmètre** : par défaut l'agrégat, commutable boutique par boutique.

### 2.3 `/alertes` — File d'attente

**Rôle** : ce qui demande une action, classifié par nature.
**Contenu** : quatre familles unifiées — cohérence des données, stocks, paiements, synchronisations — chacune avec son niveau, son périmètre, sa date et l'action possible.
**Différence fonctionnelle** : le tableau de bord **résume** (5 premières) ; cette page **exhaustif et actionnable**.

### 2.4 `/activites` — Journal

**Rôle** : qui a fait quoi, quand, avec quel résultat.
**Contenu** : les 100 dernières actions (action, cible, auteur, résultat, horodatage).
**Différence fonctionnelle** : traces, pas de diagnostic.

### 2.5 `/recherche` — Recherche transverse

**Rôle** : retrouver un objet dans mon périmètre.
**Contenu** : recherche sur boutiques, commandes, produits, SKU ; résultats groupés par type.
**Différence fonctionnelle** : seule page orientée « trouver », accessible sur mobile.

### 2.6 `/apparence` — Préférence visuelle

**Rôle** : choisir son mode de lecture.
**Contenu** : trois choix (clair / sombre / système), appliqués immédiatement et mémorisés.
**Différence fonctionnelle** : seule page qui ne lit ni n'écrit de donnée métier.

### 2.7 Correspondance rubrique ↔ page (absence de doublon)

| Rubrique de menu | Page | Contenu partagé avec une autre page ? |
|---|---|---|
| Tableau de bord | `/dashboard` | Non — synthèse + état |
| Performances | `/performances` | Non — comparaison + évolution |
| Alertes | `/alertes` | Non — exhaustivité + action |
| Activités | `/activites` | Non — journal |
| Recherche | `/recherche` | Non — retrieval |
| Apparence | `/apparence` | Non — préférence |

Les pages partagent les **gabarits** (et uniquement eux) — jamais leur contenu.

---

## 3. Conception du périmètre (comportement spécifié)

| Situation | URL | Rendu attendu | Message |
|---|---|---|---|
| Boutique courante | `/dashboard` | KPI de cette boutique | bandeau : nom + période |
| Autre boutique autorisée | `/dashboard?boutique=<id>` | KPI de cette boutique | idem, nom mis à jour |
| Agrégat demandé | `/dashboard?boutique=toutes` | Somme, **étiquetée** | bandeau : « N boutiques » |
| Boutique non autorisée | `/dashboard?boutique=<inconnu>` | **Aucun chiffre** | « Cette boutique n'est pas dans votre périmètre » |
| Période | `/dashboard?days=7` | Recalcul sur 7 jours | bandeau : « 7 jours » |

Règle de non-régression : `boutique=<inconnu>` **ne doit jamais** produire l'agrégat. Ce cas est couvert par `e2e/pilotage.spec.ts` et `dashboard-scope.integration.test.ts`.

---

## 4. Conception de la navigation

### 4.1 Section A « Pilotage »

```ts
{ key: "dashboard",    label: "Tableau de bord", href: "/dashboard"    }
{ key: "alerts",       label: "Alertes",        href: "/alertes"       }
{ key: "performances", label: "Performances",   href: "/performances" }  // reports:read
{ key: "activity",     label: "Activités",      href: "/activites"     }
{ key: "search",       label: "Recherche",      href: "/recherche"     }
{ key: "appearance",   label: "Apparence",      href: "/apparence"     }
```

Invariant : **aucune entrée de menu ne pointe vers une ancre**. Vérifié par `e2e/pilotage.spec.ts`.

### 4.2 Permissions de menu

La permission d'une entrée est évaluée **par boutique** au moment du rendu : une entrée qui exige `reports:read` disparaît si l'utilisateur n'a pas ce rôle sur la boutique courante. Le menu reflète donc l'accès réel, pas un accès théorique.

---

## 5. Conception responsive

| Palier | Comportement |
|---|---|
| < 640 px (mobile) | Sidebar en tiroir ; KPI sur 1 colonne ; tableaux défilables horizontalement ; recherche via la page `/recherche` |
| 640–1024 px (tablette) | 2 colonnes de KPI ; sections empilées |
| ≥ 1024 px (desktop) | Sidebar fixe (rail repliable) ; 4 colonnes de KPI ; alerts + accès rapides côte à côte |
| Mini App (≤ 480 px) | Conteneur `max-w-md` ; barre basse fixe à 5 entrées ; test de débordement horizontal à 0 |

---

## 6. Conception des états d'interface

```tsx
<EmptyState
  tone="default|danger"                       // neutre / refus
  icon={<AlertTriangle .../>}
  title="Cette boutique n'est pas dans votre périmètre"
  description="Aucun chiffre n'est affiché : un tableau vide laisserait croire à une absence de données."
  action={<Link href="/boutiques">…</Link>}
/>
```

Le libellé du refus explique **pourquoi** l'écran est vide — c'est ce qui évite la perception de « données corrompues ».

---

## 7. Conception des tests

| Niveau | Fichier | Ce qu'il garantit |
|---|---|---|
| Intégration | `src/lib/__tests__/dashboard-scope.integration.test.ts` | Périmètre filtré, chiffres distincts par boutique, agrégat exact, identifiant inconnu sans élargissement |
| E2E | `e2e/pilotage.spec.ts` | Une page par rubrique, menu sans ancres, filtre porté par l'URL, refus explicite |
| E2E | `e2e/dashboard.spec.ts` | KPI, provenance, état sans relevé, absence d'alerte |
| E2E | `e2e/mini-menu.spec.ts` | Modules pliables, « À venir », « Tout ouvrir / Tout fermer », pas de débordement |
| Unitaire | `src/lib/__tests__/navigation.test.ts` | Libellés uniques, icônes existantes, liste « À venir » verrouillée |
| Accessibilité | axe-core (Playwright) | Contraste, rôles, noms accessibles |

---

## 8. Traçabilité exigence → réalisation

| Exigence de la mission | Réalisation | Vérification |
|---|---|---|
| Audit préalable | `docs/audit-refonte-pilotage.md` | Document daté, constats sourcés |
| Nouvelle structure de navigation | `navigation.config.ts` (section A réécrite) | `navigation.test.ts`, `e2e/pilotage.spec.ts` |
| Vue d'ensemble / recherche / apparence / financiers / performances / activités / alertes différenciées | 6 pages dédiées | `e2e/pilotage.spec.ts` |
| Sélecteur de boutique toujours accessible | `ShopScopeSelect` + `ScopeBar`, en-tête et Mini App | `e2e/pilotage.spec.ts` |
| Vue consolidée comparative | `/performances` | E2E + test d'intégration |
| Gestion centrale multi-boutiques | « État de mes boutiques » + `/performances` | E2E |
| État « À venir » explicite | `navigation.config.ts` + badge | `navigation.test.ts` |
| Design professionnel, accessible, cohérent Web/mobile/TG | `globals.css`, gabarits factorisés, Mini App alignée | axe-core, E2E Mini App |
| Conservation des fonctionnalités existantes | 48 rubriques, 34 pages, 56 API inchangées | 243 tests + 56 E2E |
| « Tout ouvrir » / « Tout fermer » | Mini App conservés | `e2e/mini-menu.spec.ts` |
| Règles serveur d'autorisation | `resolveShopIds`, `getShopAccess` | tests d'isolation |
| Aucune donnée inventée | agrégations pures, états distincts | revue de code + E2E |
| Traçabilité jusqu'à la source | ligne de provenance des KPI, note de méthode | `e2e/dashboard.spec.ts` |
