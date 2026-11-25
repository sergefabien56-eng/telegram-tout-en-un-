# Intégration Jumia — TOUT EN UN BUSINESS MANAGER

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Statut** : À valider. Les faits ci-dessous sont issus de la documentation officielle Jumia ; les points « à qualifier » sont explicites.

---

## 1. Deux surfaces API officielles

Jumia expose **deux** API distinctes. Il faut choisir (ou combiner) selon le pays et le type de compte.

### 1.1 Seller Center API (classique, par boutique)

- Documentation : [Introduction to the SellerCenter API](http://sellerapi.sellercenter.jumia.com/v2.7.11/overview/getting-started/) [1]
- Communication : requêtes **HTTP GET/POST** vers un endpoint ; réponses XML ou JSON.
- Authentification : paramètres `UserID` + `Signature` (signée avec la clé API). Un exemple officiel d'URL signée est fourni dans la doc. [1]
- Endpoint générique documenté : `https://api.sellercenter.net/?Action=...` (exemple de la doc) ; la doc Jumia référence aussi `sellerapi.sellercenter.jumia.com`. **L'URL exacte pour la Côte d'Ivoire est à confirmer.**
- Webhooks disponibles : `onProductCreated`, `onOrderCreated`, `onOrderItemsStatusChanged`, `onProductQCStatusChanged`, `StatisticsUpdated`, etc. [7]

### 1.2 Vendor Center — GPM & GOP API (multi-boutiques, OAuth2)

- Documentation : [Vendor API (GPM/GOP)](https://vendorcenter.jumia.com/api-docs/) [2]
- **Vendor Center** = portail Jumia qui gère **toutes les boutiques avec un identifiant unique** (concept de _mastershop_) — exactement le besoin « plusieurs boutiques, une seule interface ». [2]
- Authentification : **OAuth2 uniquement**. Deux modes : **Self Authorization** (intégrations non supervisées : ERP, tâches planifiées) et **Web Application** (connexion humaine via navigateur). Pour notre ERP, c'est **Self Authorization** qui est préconisé. [2]
- Endpoints clés : [2]
  - **GPM (catalogue)** : `GET /catalog/products` (paginé « next token »), `GET /catalog/stock` (paginé), `POST /feeds/products/stock` (maj stock), maj prix/statut, `GET /catalog/brands|categories|attributes`, `GET /consignment-stock`.
  - **GOP (commandes)** : `GET /orders` (pagine, multi-pays), `GET /orders/items`, `PUT /orders` (annulation), `POST /orders/pack`, `POST /orders/ready-to-ship`, `GET /shipment-providers`.
  - **Paiements** : `GET /payments/payout-statement`.
- **Limites de débit** (officielles) : **200 requêtes/minute** et **4 requêtes/seconde**, appliquées au niveau _mastershop_. [2]
- Versionnage : doc v2.0 (2026-08-11) — corrections de forme, **pas de changement de comportement**. [2]

### 1.3 Quelle surface pour la Côte d'Ivoire ?

- La Côte d'Ivoire dispose de **VendorHub CI** (`vendorhub.jumia.ci`) et du **Vendor Center**. La page officielle des commissions est `vendorhub.jumia.ci/commissions`. [8]
- **Recommandation** : privilégier **Vendor Center (GPM/GOP)** pour la multi-boutique (un seul token, toutes les boutiques), et utiliser **Seller Center** en secours si une boutique n'est pas rattachée au _mastershop_ (la doc Jumia indique de contacter le _account manager_ dans ce cas). [2]
- **Point à vérifier avant P2** : accès API effectif du compte vendeur CI, mode d'autorisation disponible, etsurface exacte (Self Authorization) — une demande peut être nécessaire.

---

## 2. Endpoints détaillés (mapping métier)

### 2.1 Produits

| Besoin              | Endpoint (Vendor Center)                 | Notes                                                                              |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Liste catalogue     | `GET /catalog/products`                  | paginé « next token » ; filtres `status`, `qcStatus`, `visible`, `latestFirst` [2] |
| Détails produit     | `GET /catalog/products/{id}`             | —                                                                                  |
| Création            | `POST /feeds/products` (feed asynchrone) | vérifier le feed via son id                                                        |
| Mise à jour contenu | `POST /feeds/products`                   | —                                                                                  |
| Mise à jour stock   | `POST /feeds/products/stock`             | limite de **1 000 enregistrements** par feed [2]                                   |
| Mise à jour prix    | `POST /feeds/products/price`             | **validation humaine obligatoire** côté TOUT EN UN                                 |

### 2.2 Stocks

| Besoin             | Endpoint                                           | Notes                     |
| ------------------ | -------------------------------------------------- | ------------------------- |
| Stocks             | `GET /catalog/stock`                               | paginé « next token » [2] |
| Stock par commande | `GET /catalog/stock/salesorderitem/{orderItemSid}` | réserve de stock [2]      |
| Consignment        | `GET /consignment-stock`                           | si entrepôt Jumia (FBT)   |

### 2.3 Commandes

| Besoin              | Endpoint                                          | Notes                                                                      |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Commandes           | `GET /orders`                                     | filtres `status`, `createdAfter/Before`, `updatedAfter/Before`, `size` [2] |
| Lignes              | `GET /orders/items?orderId=...`                   | plusieurs ids possibles [2]                                                |
| Annulation          | `PUT /orders`                                     | —                                                                          |
| Emballer / expédier | `POST /orders/pack`, `POST /orders/ready-to-ship` | —                                                                          |

### 2.4 Factures / documents

| Besoin                   | Surface Seller Center                     | Notes                                                                                        |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Document de commande     | `GetDocument`                             | document lié à la commande (facture) — **format et disponibilité selon marché, à qualifier** |
| Métadonnées facture      | `SetInvoiceNumber`, `SetInvoiceAccessKey` | renseigne numéro/accès facture [1]                                                           |
| Statistiques / paiements | `GetStatistics`, `GetPayoutStatus`        | vue financière vendeur [1]                                                                   |

> **Factures officielles** : si l'API fournit le document, on le telécharge, on calcule son **empreinte SHA-256**, on le stocke en l'état (jamais de modification de montants/dates/numéros). Si l'API ne le fournit pas → `storage_key = NULL` et mention **« Indisponible »**. Les documents produits par TOUT EN UN portent la mention **« Document interne — non officiel »**.

### 2.5 Finance

| Besoin               | Endpoint                                           | Notes                                                          |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Relevé de paiement   | `GET /payments/payout-statement`                   | source des `finance_transactions`                              |
| Statistiques vendeur | `GetStatistics`, `GetPayoutStatus` (Seller Center) | délais de paiement à connaître (payout mensuel, délai annoncé) |

---

## 3. Synchronisation — règles d'or

1. **Pagination complète** (next token / offset), jamais d'échantillonnage.
2. **Point de reprise persisté** : `sync_profiles.cursor` par boutique/ressource.
3. **Upsert idempotent** : clés externes uniques (`shop_id`, `external_order_id`, `external_product_id`).
4. **Verrou par boutique + ressource** (`jobs.locked_by` + expiration) : pas de sync concurrente sur la même boutique/ressource.
5. **Back-off exponentiel** + respect de `Retry-After` ; une boutique en erreur ne bloque pas les autres.
6. **Limites de débit** : Vendor Center 200 req/min et 4 req/s (mastershop) [2] ; Seller Center : limitation de vitesse documentée mais non chiffrée → **démarrer prudent (≈1 req/s/boutique)** et mesurer.
7. **Stocks source = remplacement** : le stock Jumia **remplace** la valeur source précédente ; il n'est **jamais additionné** au stock synchronisé. Les mouvements locaux (entrées/sorties/inventaires) sont enregistrés **séparément** (`stock_movements.source = 'local'`).
8. **Historique** : `sync_jobs`, `sync_events`, `audit_logs`.
9. **Reprise** : tout traitement est rejouable ; `idempotency_key`.
10. **Webhooks** : optionnels mais recommandés en complément du polling (events `onOrderCreated`, `onOrderItemsStatusChanged`, etc. [7]) ; ils **ne remplacent pas** une sync périodique de contrôle.

### 3.1 Synchronisation automatique à l'attachement

Dès qu'une boutique est rattachée (assistant « Créer et rattacher » ou
rattachement depuis la page Boutiques), une **synchronisation complète** part
en arrière-plan, juste après la réponse HTTP :

1. catalogue + stocks (`/catalog/products`, `/catalog/stock`) ;
2. commandes sur 90 jours (`/orders`, 5 pages × 200) ;
3. relevés de versement (`/payout-statement`, fenêtre Jumia par défaut).

Chaque étape est **isolée** : l'échec d'une étape n'annule pas les autres, le
détail est journalisé (`jobs`, `audit_logs`). Le vendeur n'a donc jamais à
lancer une synchronisation à la main pour voir ses données — l'écran
**Boutiques → Synchronisations** permet de la relancer à tout moment
(bouton « Tout synchroniser »).

Module : `src/lib/full-sync.ts` · Route : `POST /api/shops/:id/sync`.

### 3.2 Garde-fou « une boutique, une donnée »

Un compte vendeur Jumia peut regrouper plusieurs boutiques. Avant d'enregistrer
une donnée, on compare **l'identifiant de boutique porté par la charge utile
Jumia** avec la boutique ciblée :

| Ressource           | Identifiant Jumia   | Contrôle                                                                                                |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Commande            | `shopIds` (tableau) | commande conservée si la boutique ciblée est dans `shopIds`, sinon **écartée**                          |
| Relevé de versement | `shopSid`           | conservé si `shopSid` = boutique ciblée, sinon **écarté** (colonne `payout_statements.remote_shop_sid`) |
| Produit             | `shop.id`           | conservé si `shop.id` = boutique ciblée, sinon **écarté**                                               |

Les données écartées sont comptées (`skipped`) et journalisées dans
`audit_logs` (`action = shop.*_synced`, `result = blocked`,
`metadata.reason = autre_boutique`) : rien n'est perdu en silence, et une
boutique ne peut jamais récupérer les chiffres d'une autre.

Module : `src/lib/shop-guard.ts`.

### 3.3 Statuts boutique (rappel cahier des charges)

`Connecté` · `Synchronisation en cours` · `Synchronisé` · `Synchronisation partielle` · `Erreur` · `Reconnexion nécessaire`.

### 3.4 Synchronisation par période explicite (module « Ventes & Commandes »)

La lecture des commandes ne se fait plus sur une fenêtre glissante : l'écran **« Synchroniser
cette période »** demande une date de début et une date de fin, et la fenêtre est **envoyée à
l'API** (`createdAfter` / `createdBefore`), jamais reconstruite localement.

| Règle                  | Valeur                                                 | Où elle est appliquée                                                         |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Période obligatoire    | les deux dates sont exigées                            | `src/lib/order-sync-policy.ts` (`validateSyncWindow`) — **client et serveur** |
| Période inversée       | refusée                                                | idem                                                                          |
| Période > 90 jours     | refusée                                                | idem                                                                          |
| Confirmation           | demandée au-delà de 30 jours                           | panneau de synchronisation                                                    |
| Suivi des mises à jour | `updatedAfter` / `updatedBefore`                       | `src/lib/jumia/orders.ts` (`buildOrderQuery`)                                 |
| Pagination             | conservée telle quelle (5 pages × 200 maximum)         | `src/lib/jumia/orders.ts`                                                     |
| Upsert                 | idempotent (clé unique boutique + id distant)          | `src/lib/orders-sync.ts`                                                      |
| Lecture partielle      | état `partial`, **jamais** présenté comme une réussite | `src/lib/orders-sync.ts` + interface                                          |

Les refus de période et de permission sont **contrôlés côté serveur**
(`POST /api/shops/[id]/commandes/sync`) : masquer un bouton dans l'interface ne suffit pas, la
route elle-même refuse une période invalide et une permission absente.

**Aucun jeton Jumia** (access token, refresh token, mot de passe) n'apparaît dans l'interface,
dans les logs ni dans les exports : les identifiants restent côté serveur, dans le coffre chiffré.

---

## 4. Webhooks Jumia

- Événements documentés : `onProductCreated`, `onProductQCStatusChanged`, `onOrderCreated`, `onOrderItemsStatusChanged`, `StatisticsUpdated` [7].
- Charge utile : identifiants (ex. `OrderId`, `SellerSkus`) → on **re-fetch** les détails via l'API (le webhook n'est pas une source de données complète).
- Endpoint TOUT EN UN : `/api/webhooks/jumia` avec **vérification de signature** (mécanisme à qualifier selon la doc du marché) + table `webhook_events` (détection des doublons par `event_id`).

---

## 5. Mapping des statuts — figé et testé (25/11/2026)

La classification est **centralisée** dans `src/lib/order-status.ts` : c'est la source de vérité,
utilisée par le JavaScript (libellés, familles) **et** par le SQL (conditions de filtre), de sorte
qu'un compteur et la liste qu'il décrit ne puissent pas diverger. L'équivalence des deux est
vérifiée par un test d'intégration sur base réelle.

### 5.1 Statuts bruts et familles

| Statut Jumia (libellé réel)                                                     | Statut interne                | Famille                           |
| ------------------------------------------------------------------------------- | ----------------------------- | --------------------------------- |
| `pending`, `pending pickup`, `awaiting pickup`, `pending delivery`              | `pending`                     | en attente                        |
| `ready to ship`, `ready`                                                        | `ready_to_ship`               | prêtes à expédier                 |
| `shipped`, `picked up`, `in transit`                                            | `shipped`                     | expédiées                         |
| `delivered`                                                                     | `delivered`                   | expédiées (livrées)               |
| `cancelled`, `canceled`                                                         | `cancelled`                   | annulées                          |
| `failed delivery`, `delivery failed`                                            | `failed`                      | échecs (distinct des annulations) |
| `returned`, `return waiting for approval`, `return approved`, `return rejected` | `returned` / `return_pending` | retours                           |

Les libellés exacts varient selon l'API ; ils sont normalisés avant classification
(minuscules, espaces et tirets ramenés à une seule forme).

### 5.2 Les quatre vues et la condition SQL qui les définit

| Vue                        | Condition appliquée **en base**, avant toute limite de lignes             |
| -------------------------- | ------------------------------------------------------------------------- |
| **A — Historique**         | toutes les commandes **sauf** les annulées (la famille `hors-annulees`)   |
| **A — Annulées**           | uniquement les annulations                                                |
| **B — En attente**         | préparation **non** confirmée : `packed < total`, ou `total = 0`          |
| **B — Prêtes à expédier**  | préparation **confirmée** : `packed ≥ total > 0`, et expédition non faite |
| **C — Expédiées**          | expédition confirmée (`shipped`, `picked up`)                             |
| **C — Retours**            | tous les statuts de retour, **sans** catégorie imposée par motif          |
| **D — Villes & localités** | agrégat par localité : uniquement des effectifs et des taux               |

### 5.3 Règles qui font foi

1. **Une commande à statuts multiples n'est jamais « prête à expédier »** : si `packed < total`,
   elle reste « en attente » et l'interface affiche « préparation partielle (x/y) ».
2. **Annulation et échec de livraison sont deux notions distinctes** : une annulation n'apparaît
   jamais dans le taux d'échec d'une localité.
3. **Les retours sont regroupés** : aucun motif n'est exigé par Jumia côté API de lecture, on ne
   fabrication donc pas de catégorie.
4. **Le total affiché est le montant des commandes affichées** — ce n'est pas le CA encaissé
   (une commande livrée ou expédiée n'est pas nécessairement encaissée). Les devises multiples ne
   sont pas additionnées : l'interface affiche « — » et l'explique.
5. **Les factures ne sont pas inventées** : l'API Vendor Center utilisée ne fournit pas de
   factures ; la page « Factures à imprimer » est honnête et renvoie vers le Vendor Center.

### 5.4 Ce que l'API permet — et ne permet pas

| Besoin                                                   | Support API                                            | Conséquence dans l'application                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suivre les changements de statut d'une commande ancienne | `updatedAfter` / `updatedBefore` sur `GET /orders` [2] | la case « Relire aussi les commandes plus anciennes dont le statut a changé » est proposée par défaut ; sans elle, un changement postérieur à la création passerait inaperçu |
| Filtrer par statut côté API                              | `status` sur `GET /orders` [2]                         | utilisé pour les lectures ciblées ; le filtrage fin se fait aussi **en base**, pour garantir que les compteurs et les listes décrivent le même ensemble                      |
| Créer / lire une facture                                 | non couvert par l'API utilisée                         | page honnête, aucune donnée fabriquée                                                                                                                                        |
| Connaître le motif d'un retour                           | non exposé par l'API de lecture                        | le motif est affiché **s'il figure dans la charge utile brute**, sinon il n'est pas deviné                                                                                   |

---

## 6. Assistant d'ajout de boutique (parcours)

1. Demander un **nom personnalisé**.
2. Déclencher l'**authentification officielle** (OAuth2 Self Authorization Vendor Center, ou identifiants Seller Center).
3. Vérifier les **autorisations** (rôles requis : ex. `VC - Order Viewer` / `VC - Order Manager` pour les commandes [2]).
4. Récupérer l'**identifiant réel** de la boutique.
5. Présenter **nom + identifiant** pour **validation humaine**.
6. Lancer la **première synchronisation** (puis afficher l'état).

Une boutique réelle ne peut pas être ajoutée deux fois (`UNIQUE(platform, external_shop_id)`).

---

## 6 bis. Publication de produits — cycle réel (25/11/2026)

### 6 bis.1 Le cycle officiel

1. `POST /feeds/products/create` avec `{ shopId, products: [...] }` → la plateforme renvoie un
   `feedId`.
2. `GET /feeds/{feedId}` relit l'état du flux (traitement, contrôle qualité, motifs de refus).
3. Le produit est ensuite **recherché au catalogue** par `sellerSku` (`GET /catalog/products`) :
   c'est ce produit, et lui seul, qui porte un `productSid`.
4. L'état « publiée » n'est retenu que si le produit est retrouvé, **actif**, **visible** et
   **`QC APPROVED`**.

Un flux de création **ne contient pas** de `productSid` : l'identifiant n'existe qu'après la
création, et il est obtenu par la relecture du catalogue.

### 6 bis.2 Ce que la plateforme exige réellement

| Élément   | Source                                                                    |
| --------- | ------------------------------------------------------------------------- |
| Catégorie | `GET /catalog/categories` (chemin complet + `attributeSet.sid`)           |
| Attributs | `GET /catalog/attribute-sets/{sid}` (`mandatory`, `variation`, `options`) |
| Marques   | `GET /catalog/brands` (`code` / `name`)                                   |
| Prix      | porté par `businessClients` (ex. `jumia-ci`) et par le produit            |

Le référentiel est **copié en base** (`jumia_catalog_categories`) : l'API ne propose aucun filtre
par nom sur les catégories, la recherche porte donc sur la copie locale. La validation des
attributs est refaite **côté serveur** avant chaque envoi.

### 6 bis.3 Mots de passe

Un `client_secret` n'est **jamais** demandé : le parcours Self Authorization ne demande que
`client_id` et `refresh_token`. Les jetons sont chiffrés (AES-256-GCM), ne sont jamais renvoyés,
journalisés ni exportés, et sont renouvelés à la rotation.

---

## 7. Ressources non couvertes par une API officielle identifiée

À ce stade (Phase 0), **aucune** API officielle n'a été identifiée pour :

- la **création de factures officielles** (on récupère les documents existants, on ne les fabrique pas) ;
- les **retours** en écriture (un endpoint `CreateReturnManifest` existe côté OMS/Backend, mais il est destiné à des intégrations spécifiques — à qualifier) ;
- la **gestion des entrepôts** hors `consignment-stock` ;
- les **codes-barres/QR** (fonction interne, pas d'API Jumia nécessaire).

Toute fonctionnalité non prouvée par une API officielle sera **absente** ou marquée **« Bientôt disponible »** (règle R1).

---

## 8. Checklist de qualification (à faire avant P2)

- [ ] Compte vendeur Jumia CI avec accès Vendor Center (mastershop) — identifiants de test.
- [ ] Mode d'autorisation OAuth2 disponible (Self Authorization).
- [ ] Liste des boutiques rattachées et leurs `shop_id` réels.
- [ ] endpoints/réponses réels (capture d'un échantillon JSON par endpoint).
- [ ] Limites de débit mesurées (req/min, req/s).
- [ ] Disponibilité de `GetDocument` (facture) pour la CI.
- [ ] Délais et formats des paiements (`GetPayoutStatus` / relevé).
- [ ] Comportement en cas de jeton expiré (refresh).

---

## 9. Sources

- [1] Seller Center Seller API — Introduction : http://sellerapi.sellercenter.jumia.com/v2.7.11/overview/getting-started/
- [2] Jumia Vendor Center — GPM & GOP API : https://vendorcenter.jumia.com/api-docs/
- [7] Seller Center — Payload Definitions (webhooks) : http://sellerapi.sellercenter.jumia.com/v2.7.11/webhook-endpoints/entities-payload-definition/
- [8] Jumia VendorHub Côte d'Ivoire — Commissions : https://vendorhub.jumia.ci/commissions/
