# Plan de refonte — module « Ventes & Commandes »

**Date :** 25/11/2026
**Statut :** plan établi après comparaison avec le code existant et `docs/jumia-integration.md`, **avant** réalisation — puis **réalisé** (voir § 9).
**Périmètre :** Web + Mini App Telegram.

---

## 1. Comparaison préalable : demande vs code et documentation Jumia

| Élément de la demande                                                        | État dans le code                                                                                                              | Écart                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Quatre rubriques principales exactement                                      | Section B du menu = **7 entrées** (Toutes les commandes, À traiter, Expédiées, Retours, Factures originales, Clients, Exports) | 7 → 4, avec relogement des 3 rubriques absorbées |
| Historique / Annulées                                                        | `/commandes` (tous statuts) ; pas de vue « annulées » dédiée                                                                   | à créer                                          |
| Exporter intégré à la rubrique                                               | L'export est une **entrée de menu** (`/commandes/exports`) et son bouton **n'envoie ni la période ni le statut**               | à intégrer + corriger les paramètres             |
| Contrôles Période · Boutique · Du · Au · Statut                              | `OrderFilters` : boutique, du, au, statut — **il manque la période affichée** en tant que contrôle explicite                   | à compléter                                      |
| Liste déroulante/repliable, détail par commande                              | Liste en tableau plein, **aucun détail**                                                                                       | à créer                                          |
| Commandes / Total affiché / Données (source, dernière synchro, incomplétude) | 3 cartes présentes ; « Données » ne montre ni la source ni la dernière synchronisation                                         | à compléter                                      |
| « Synchroniser cette période » (Du, Au, périmètre)                           | Sync existante = `days` (fenêtre glissante 1–90 j), **sans dates explicites**                                                  | à étendre                                        |
| Confirmation si opération volumineuse                                        | Absente                                                                                                                        | à créer                                          |
| États : en attente / en cours / réussie / erreur + dernière synchro réussie  | Absents (un simple message)                                                                                                    | à créer                                          |
| Synchronisation selon filtres et pagination Jumia                            | `GET /orders` avec `createdAfter/createdBefore`, `size`, `token` — **jamais `updatedAfter/updatedBefore`**                     | à étendre (suivi des mises à jour)               |
| Ne pas marquer une sync partielle comme réussie                              | `truncated: true` → `lastSyncStatus = "ok"`                                                                                    | **défaut à corriger**                            |
| En attente = préparation non confirmée                                       | Groupe `action` = `created, pending, processing, new` (mélange préparation **et** expédition)                                  | à séparer                                        |
| Prêtes à expédier = préparation confirmée                                    | **Absent**                                                                                                                     | à créer                                          |
| Factures à imprimer (uniquement les réelles)                                 | Page « Factures originales » : l'API ne fournit rien, page honnête                                                             | à reloger sous « À traiter »                     |
| Expédiées = expédition réellement confirmée                                  | Groupe `shipped` = `shipped, pickedup`                                                                                         | conserver, préciser                              |
| Retours tous ensemble, motif dans le détail                                  | Groupe `returned` = `returned, refunded, returnrequested, rma`                                                                 | compléter (motif dans le détail)                 |
| Villes & localités (agrégats)                                                | **Absent**                                                                                                                     | à créer                                          |
| État vide honnête si pas de données Jumia                                    | Appliqué sur les pages existantes                                                                                              | à conserver partout                              |

---

## 2. Statuts Jumia réellement constatés

Mesure sur la base réelle (316 commandes, 2 boutiques) :

| Statut            | Nombre | `packed_items / total_items`   | Interprétation                                            |
| ----------------- | ------ | ------------------------------ | --------------------------------------------------------- |
| `DELIVERED`       | 206    | 206/206                        | livrée                                                    |
| `CANCELED`        | 49     | 16 préparées, 32 non préparées | **annulée**                                               |
| `FAILED`          | 40     | 40/40                          | échec de livraison (≠ annulée)                            |
| `SHIPPED`         | 14     | 14/14                          | **expédiée**                                              |
| `READY_TO_SHIP`   | 3      | 3/3                            | **préparation confirmée, expédition non faite**           |
| `RETURNED`        | 3      | 3/3                            | retour                                                    |
| `PENDING`         | 1      | 0/1                            | **préparation non confirmée**                             |
| `Multiple Status` | 1      | 1/2                            | **préparation partielle** (articles à statuts différents) |

Le champ Jumia `packedItems` est le signal fiable de préparation ; `hasMultipleStatus` signale les commandes dont les articles n'ont pas le même statut.

---

## 3. Définitions retenues (compteurs et montants)

> Ces définitions sont **la** référence : elles sont partagées par les pages, les exports et les tests.

### 3.1 Classification d'une commande

| Famille                | Définition                                              | Statuts retenus                                                                       |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **En attente**         | préparation **non** confirmée                           | `PENDING`, `CREATED`, `NEW`, `PROCESSING`, et `Multiple Status` dont `packed < total` |
| **Prêtes à expédier**  | préparation **confirmée**, expédition **non** effectuée | `READY_TO_SHIP`, ou statut d'attente avec `packed ≥ total > 0`                        |
| **Expédiées**          | expédition réellement confirmée                         | `SHIPPED`, `PICKED_UP`                                                                |
| **Livrées**            | transaction terminée                                    | `DELIVERED` (restent dans l'historique)                                               |
| **Annulées**           | commande annulée                                        | `CANCELED`                                                                            |
| **Échec de livraison** | livraison échouée                                       | `FAILED` (distinct des annulées)                                                      |
| **Retours**            | tous les retours, **quel que soit le motif**            | `RETURNED`, `REFUNDED`, `RETURN_REQUESTED`, `RMA`, `RETURN_WAITING_FOR_APPROVAL`      |

Règle de prudence : **une commande à statuts multiples n'est jamais comptée comme « prête à expédier »**. Elle est comptée « en attente » avec la mention « préparation partielle (x/y) ».

### 3.2 Compteurs

- **Commandes** = nombre de lignes affichées, **après** application de tous les filtres (boutique, Du, Au, Statut). Jamais un nombre codé en dur.
- **Total affiché** = somme des `total_amount_minor` des **commandes affichées**, dans leur devise. Ce n'est **pas** le CA encaissé : ce sont les montants des commandes retenues par les filtres, quel que soit leur statut d'encaissement.
- Si plusieurs devises sont présentes → total **non additionné**, affiché « — » avec l'explication.
- **Échecs** (rubrique Villes) = commandes `FAILED` du périmètre ; **taux d'échec** = échecs ÷ commandes du même périmètre, **avec l'effectif affiché à côté** (jamais un pourcentage seul).

### 3.3 Sources

| Donnée             | Source                                                                  | Dernière synchronisation            |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------- |
| Commandes          | table `orders` (remplie par `GET /orders` de l'API Jumia Vendor Center) | `shops.last_sync_at` de la boutique |
| Statuts / articles | idem, champs `status`, `packedItems`, `totalItems`, `hasMultipleStatus` | idem                                |
| Villes             | `orders.customer_city`                                                  | idem                                |

### 3.4 Règle de fraîcheur

Une donnée est signalée **incomplète** si :

- la boutique n'a jamais été synchronisée → « Jamais synchronisée » ;
- la dernière synchronisation a **échoué** → alerte + dernière date réussie conservée ;
- la dernière synchronisation a été **partielle** (limite de pages atteinte) → mention « partielle ».

---

## 4. Plan : ancienne rubrique → nouvelle destination

| Rubrique actuelle                             | Destination nouvelle                                                                          | Traitement                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Toutes les commandes** `/commandes`         | `/commandes` — sous-vue **Historique**                                                        | Page conservée et enrichie (contrôles, liste repliable, détail, bandeau Données, sync de période)                                                                                                                                                                                          |
| _(nouveau)_                                   | `/commandes/annulees` — sous-vue **Annulées**                                                 | Page créée (filtre `CANCELED`), incluse dans « Toutes les commandes »                                                                                                                                                                                                                      |
| **À traiter** `/commandes/a-traiter`          | `/commandes/a-traiter` — **hub**                                                              | Devient un point d'entrée vers 3 sous-vues à contenu propre                                                                                                                                                                                                                                |
| _(nouveau)_                                   | `/commandes/a-traiter/en-attente`                                                             | Préparation non confirmée                                                                                                                                                                                                                                                                  |
| _(nouveau)_                                   | `/commandes/a-traiter/pretes-a-expedier`                                                      | Préparation confirmée                                                                                                                                                                                                                                                                      |
| **Factures originales** `/commandes/factures` | `/commandes/a-traiter/factures`                                                               | Page conservée (contenu honnête : l'API ne fournit pas de factures), **redirection permanente** depuis l'ancienne adresse                                                                                                                                                                  |
| **Expédiées** `/commandes/expediees`          | `/commandes/expediees` — sous-vue **Expédiées**                                               | Page conservée, contenu recentré sur l'expédition confirmée                                                                                                                                                                                                                                |
| **Retours** `/commandes/retours`              | `/commandes/retours` — sous-vue de « Expédiées »                                              | Page conservée (tous retours, motif dans le détail) ; becomes l'onglet « Retours » d'« Expédiées »                                                                                                                                                                                         |
| _(nouveau)_                                   | `/commandes/villes` — rubrique **Villes & localités**                                         | Page créée (agrégats, effectifs, échantillons)                                                                                                                                                                                                                                             |
| **Clients** `/commandes/clients`              | **section F « Analyses et rapports »** — page conservée                                       | L'annuaire nominatif est explicitement exclu de la nouvelle rubrique « Villes & localités ». La page et ses données ne sont **pas supprimées** : l'entrée de menu est conservée, déplacée dans la section F (c'est une analyse des commandes), et la page reste liée depuis la rubrique D. |
| **Exports** `/commandes/exports`              | **action intégrée** à `/commandes` + entrée conservée en section F (« Exports de commandes ») | L'export devient un bouton dans la rubrique « Toutes les commandes », **respectant boutique, période et statut**. La page d'exports et son code sont conservés (historique des exports) et restent atteignables par le lien « Historique des exports ».                                    |
| _(nouveau)_                                   | `/commandes/[id]` — détail d'une commande                                                     | Page créée (statut, articles préparés, ville, boutique, dates)                                                                                                                                                                                                                             |

**Aucun code, aucune donnée et aucun droit n'est supprimé.** Les seules déceptions sont des **redirections d'adresse** (les pages d'origine continuent de répondre).

---

## 5. Navigation cible

### 5.1 Section B — « Ventes et commandes » : quatre rubriques

| #   | Rubrique             | Destination            | Permission    |
| --- | -------------------- | ---------------------- | ------------- |
| A   | Toutes les commandes | `/commandes`           | `orders:read` |
| B   | À traiter            | `/commandes/a-traiter` | `orders:read` |
| C   | Expédiées            | `/commandes/expediees` | `orders:read` |
| D   | Villes & localités   | `/commandes/villes`    | `orders:read` |

Sous-vues, atteintes par un **fil de sous-rubriques** propre à chaque page (et non par des ancres) :

- A → Historique (`/commandes`) · Annulées (`/commandes/annulees`)
- B → En attente · Prêtes à expédier · Factures à imprimer
- C → Expédiées · Retours
- D → (page unique, avec filtre boutique et période)

### 5.2 Mini App

La Mini App consomme `navigation.config.ts` : la section B y affiche automatiquement les **quatre** rubriques. Les sous-vues sont accessibles depuis les pages (fil de sous-rubriques) et depuis le menu « Plus ». « Tout ouvrir » / « Tout fermer », la page active et le retour sont conservés.

---

## 6. Synchronisation « cette période »

### 6.1 Ce qui change côté serveur

| Aspect                            | Avant                                     | Après                                                                                                   |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Fenêtre                           | `days` (glissante)                        | **`from` / `to` explicites** (dates choisies par l'utilisateur)                                         |
| Plage Jumia                       | 1–90 j                                    | **≤ 90 j**, refusée sinon (limite documentée de l'API)                                                  |
| Période inversée                  | non gérée                                 | **refusée** (400), message explicite                                                                    |
| Suivi des mises àctions anciennes | absent                                    | **`updatedAfter` / `updatedBefore`** : les commandes plus anciennes dont le statut a changé sont relues |
| Pagination                        | `size=200`, `maxPages=5`, curseur `token` | identique (déjà conforme à la doc) ; le curseur n'est **jamais** journalisé ni affiché                  |
| Doublons                          | `upsert` par `externalOrderId`            | conservé                                                                                                |
| Sync partielle                    | marquée `ok`                              | marquée **`partial`** : ni la boutique ni l'interface n'annoncent un succès                             |
| Erreurs                           | journalisées                              | journalisées avec la cause ; l'interface affiche l'erreur                                               |
| Jeton Jumia                       | jamais exposé                             | jamais exposé (ni interface, ni logs, ni exports)                                                       |

### 6.2 Ce qui change côté interface

- Sélecteur **Du / Au** (borné à 90 jours) + **boutique** cible.
- Si la période dépasse **30 jours** → **confirmation** explicite (« cette opération va relire N jours »).
- États affichés : **en attente** (file d'attente), **en cours**, **réussie**, **en erreur**, plus la **date de la dernière synchronisation réussie**.
- Refus explicites : période inversée, période trop longue, boutique non rattachée, permission insuffisante.

---

## 7. Ce qui ne change pas

- La base de données : **aucune migration** (les colonnes utiles existent déjà).
- Les permissions : `orders:read` pour consulter, `orders:write` pour synchroniser.
- Les routes d'API existantes ; seule la **route de synchronisation** accepte des paramètres supplémentaires (rétrocompatible).
- Le bot Telegram, la 2FA, les sauvegardes, le cron de cohérence.
- Les entrées de navigation : 3 sortent de la section B (Clients, Exports, Factures originales), **4 y entrent** (les quatre rubriques). Clients et Exports de commandes rejoignent la section F. Aucune fonction n'est perdue : chaque page reste atteignable, soit par le menu, soit par une sous-rubrique.

---

## 8. Distinction testé / non testé (à compléter à la livraison)

### 8.1 Testé automatiquement

| Élément                                                                                             | Preuve                                                   | Résultat                        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------- |
| Classification des statuts (tableau §3.1)                                                           | `src/lib/__tests__/order-status.test.ts`                 | **13/13**                       |
| Équivalence SQL ↔ JS de la classification                                                           | `src/lib/__tests__/orders-workspace.integration.test.ts` | **9/9** (base réelle)           |
| Compteurs et totaux sous filtres (boutique, période, statut, famille)                               | idem                                                     | **9/9**                         |
| Agrégat villes, effectifs, taux, échantillons                                                       | idem                                                     | **9/9**                         |
| Pagination et filtres `GET /orders` (`createdAfter/Before`, `updatedAfter/Before`, `size`, `token`) | `src/lib/__tests__/order-sync-window.test.ts`            | **4/4**                         |
| Refus de période (incomplète, inversée, trop large)                                                 | `src/lib/__tests__/order-sync-policy.test.ts` + E2E      | **7/7** et **2/2** E2E          |
| Quatre rubriques exactement, rubrique active                                                        | `src/lib/__tests__/navigation-ventes.test.ts`            | **10/10**                       |
| Permissions contrôlées côté serveur (`orders:write`)                                                | E2E « les permissions sont contrôlées côté serveur »     | **1/1**                         |
| Écrans, compteurs, liste repliable, détail, refus                                                   | E2E `e2e/ventes-refonte.spec.ts`                         | **7/7**                         |
| Mini App (menu, page active, débordement)                                                           | E2E `e2e/mini-ventes.spec.ts`                            | **2/2**                         |
| Accessibilité WCAG 2.1 AA (9 écrans + thème sombre)                                                 | E2E `e2e/accessibilite.spec.ts`                          | **10/10**                       |
| Suite complète                                                                                      | `npm test` / `npx playwright test`                       | **288 + 2 ignorés** / **71/71** |

### 8.2 Non testé automatiquement (à dire tel quel)

| Élément                                                   | Pourquoi                                                                           | Contrôle manuel                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Synchronisation réelle contre l'API Jumia                 | quota + secrets ; le test automatisé simule la couche HTTP                         | à refaire après déploiement, sur les deux boutiques réelles |
| Comportement du quota Jumia au-delà de 5 pages            | dépend du quota réel du compte                                                     | à observer en production                                    |
| Lecture des factures                                      | l'API Vendor Center utilisée n'en fournit pas                                      | sans objet — aucune facture n'est fabriquée                 |
| Rendu exact sur un téléphone Telegram réel                | l'anti-rebond du client Telegram n'est pas reproductible en test                   | captures mobile (390 × 844) fournies                        |
| `docs/captures` sur l'espace de nom `Ventes et commandes` | ~~le logo du bandeau se chevauche~~ — **corrigé** : logo officiel vectoriel et libellé unique (voir `design-system.md` § 1.1) | captures régénérées le 25/11/2026                          |

---

## 9. Réalisation — ce qui a été fait

### 9.1 Arborescence livrée

| Rubrique                    | Sous-vues                                                  | Adresse                                                                     |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A. Toutes les commandes** | Historique · Annulées                                      | `/commandes`, `/commandes/annulees`                                         |
| **B. À traiter**            | hub · En attente · Prêtes à expédier · Factures à imprimer | `/commandes/a-traiter`, `…/en-attente`, `…/pretes-a-expedier`, `…/factures` |
| **C. Expédiées**            | Expédiées · Retours                                        | `/commandes/expediees`, `/commandes/retours`                                |
| **D. Villes & localités**   | —                                                          | `/commandes/villes`                                                         |
| _(hors menu principal)_     | Clients · Exports de commandes                             | `/commandes/clients`, `/commandes/exports`                                  |
| _(détail)_                  | commande                                                   | `/commandes/[id]`                                                           |

L'ancienne adresse `/commandes/factures` répond par une **redirection permanente** vers `/commandes/a-traiter/factures` : rien n'est perdu.

### 9.2 Fichiers créés

- `src/lib/order-status.ts` — classification des commandes (source de vérité).
- `src/lib/order-sync-policy.ts` — politique de fenêtre de synchronisation (pure).
- `src/components/order-workspace.tsx` — socle commun des vues.
- `src/components/order-sync-panel.tsx` — panneau « Synchroniser cette période ».
- `src/components/sub-nav.tsx` — fil de sous-rubriques.
- `src/components/order-status-badge.tsx` — pastille de statut.
- `src/components/ui/collapsible.tsx` — liste repliable.
- `src/app/(app)/commandes/annulees/page.tsx`, `…/villes/page.tsx`, `…/a-traiter/page.tsx`, `…/a-traiter/en-attente/page.tsx`, `…/a-traiter/pretes-a-expedier/page.tsx`, `…/[id]/page.tsx`.

### 9.3 Fichiers modifiés

`src/navigation.config.ts` (quatre rubriques + relocation de Clients/Exports), `src/lib/orders.ts` (compteurs, agrégat villes, détail, filtre SQL par famille), `src/lib/orders-sync.ts` (période, `updatedAfter`, synchronisation partielle), `src/lib/jumia/orders.ts` (filtres de mise à jour), `src/app/api/shops/[id]/commandes/sync/route.ts` (période + refus), `src/app/api/shops/[id]/commandes/export/route.ts` et `src/app/api/commandes/export/route.ts` (respect des filtres), `src/components/app-shell.tsx` et `src/components/mini-app-shell.tsx` (rubrique active).

### 9.4 Corrections apportées en cours de route

1. **Compteur tronqué à 200** : les compteurs sont désormais calculés **sans limite** de lignes.
2. **Filtre de famille appliqué après la limite** : la famille est désormais appliquée **en base**, avant la limite — la liste et les compteurs décrivent le même ensemble.
3. **Synchronisation partielle marquée « réussie »** : elle est désormais marquée `partial`, et l'interface l'annonce comme telle.
4. **Suivi des mises à jour absent** : `updatedAfter` / `updatedBefore` sont utilisés ; les commandes plus anciennes dont le statut a changé sont relues.
5. **Export ne respectant ni la période ni le statut** : les deux routes d'export appliquent désormais les filtres.
6. **Contraste insuffisant en mode sombre** : les boutons `bg-primary-600` (bleu clair) sont passés en `bg-primary` — le blanc redevient lisible (AA).
7. **État vide masqué** : le message « aucune commande » était caché dans la section repliée ; il est désormais toujours visible.
