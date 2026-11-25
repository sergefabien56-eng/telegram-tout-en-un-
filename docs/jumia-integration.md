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
- **Vendor Center** = portail Jumia qui gère **toutes les boutiques avec un identifiant unique** (concept de *mastershop*) — exactement le besoin « plusieurs boutiques, une seule interface ». [2]
- Authentification : **OAuth2 uniquement**. Deux modes : **Self Authorization** (intégrations non supervisées : ERP, tâches planifiées) et **Web Application** (connexion humaine via navigateur). Pour notre ERP, c'est **Self Authorization** qui est préconisé. [2]
- Endpoints clés : [2]
  - **GPM (catalogue)** : `GET /catalog/products` (paginé « next token »), `GET /catalog/stock` (paginé), `POST /feeds/products/stock` (maj stock), maj prix/statut, `GET /catalog/brands|categories|attributes`, `GET /consignment-stock`.
  - **GOP (commandes)** : `GET /orders` (pagine, multi-pays), `GET /orders/items`, `PUT /orders` (annulation), `POST /orders/pack`, `POST /orders/ready-to-ship`, `GET /shipment-providers`.
  - **Paiements** : `GET /payments/payout-statement`.
- **Limites de débit** (officielles) : **200 requêtes/minute** et **4 requêtes/seconde**, appliquées au niveau *mastershop*. [2]
- Versionnage : doc v2.0 (2026-08-11) — corrections de forme, **pas de changement de comportement**. [2]

### 1.3 Quelle surface pour la Côte d'Ivoire ?

- La Côte d'Ivoire dispose de **VendorHub CI** (`vendorhub.jumia.ci`) et du **Vendor Center**. La page officielle des commissions est `vendorhub.jumia.ci/commissions`. [8]
- **Recommandation** : privilégier **Vendor Center (GPM/GOP)** pour la multi-boutique (un seul token, toutes les boutiques), et utiliser **Seller Center** en secours si une boutique n'est pas rattachée au *mastershop* (la doc Jumia indique de contacter le *account manager* dans ce cas). [2]
- **Point à vérifier avant P2** : accès API effectif du compte vendeur CI, mode d'autorisation disponible, etsurface exacte (Self Authorization) — une demande peut être nécessaire.

---

## 2. Endpoints détaillés (mapping métier)

### 2.1 Produits

| Besoin | Endpoint (Vendor Center) | Notes |
|---|---|---|
| Liste catalogue | `GET /catalog/products` | paginé « next token » ; filtres `status`, `qcStatus`, `visible`, `latestFirst` [2] |
| Détails produit | `GET /catalog/products/{id}` | — |
| Création | `POST /feeds/products` (feed asynchrone) | vérifier le feed via son id |
| Mise à jour contenu | `POST /feeds/products` | — |
| Mise à jour stock | `POST /feeds/products/stock` | limite de **1 000 enregistrements** par feed [2] |
| Mise à jour prix | `POST /feeds/products/price` | **validation humaine obligatoire** côté TOUT EN UN |

### 2.2 Stocks

| Besoin | Endpoint | Notes |
|---|---|---|
| Stocks | `GET /catalog/stock` | paginé « next token » [2] |
| Stock par commande | `GET /catalog/stock/salesorderitem/{orderItemSid}` | réserve de stock [2] |
| Consignment | `GET /consignment-stock` | si entrepôt Jumia (FBT) |

### 2.3 Commandes

| Besoin | Endpoint | Notes |
|---|---|---|
| Commandes | `GET /orders` | filtres `status`, `createdAfter/Before`, `updatedAfter/Before`, `size` [2] |
| Lignes | `GET /orders/items?orderId=...` | plusieurs ids possibles [2] |
| Annulation | `PUT /orders` | — |
| Emballer / expédier | `POST /orders/pack`, `POST /orders/ready-to-ship` | — |

### 2.4 Factures / documents

| Besoin | Surface Seller Center | Notes |
|---|---|---|
| Document de commande | `GetDocument` | document lié à la commande (facture) — **format et disponibilité selon marché, à qualifier** |
| Métadonnées facture | `SetInvoiceNumber`, `SetInvoiceAccessKey` | renseigne numéro/accès facture [1] |
| Statistiques / paiements | `GetStatistics`, `GetPayoutStatus` | vue financière vendeur [1] |

> **Factures officielles** : si l'API fournit le document, on le telécharge, on calcule son **empreinte SHA-256**, on le stocke en l'état (jamais de modification de montants/dates/numéros). Si l'API ne le fournit pas → `storage_key = NULL` et mention **« Indisponible »**. Les documents produits par TOUT EN UN portent la mention **« Document interne — non officiel »**.

### 2.5 Finance

| Besoin | Endpoint | Notes |
|---|---|---|
| Relevé de paiement | `GET /payments/payout-statement` | source des `finance_transactions` |
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

### 3.2 Statuts boutique (rappel cahier des charges)

`Connecté` · `Synchronisation en cours` · `Synchronisé` · `Synchronisation partielle` · `Erreur` · `Reconnexion nécessaire`.

---

## 4. Webhooks Jumia

- Événements documentés : `onProductCreated`, `onProductQCStatusChanged`, `onOrderCreated`, `onOrderItemsStatusChanged`, `StatisticsUpdated` [7].
- Charge utile : identifiants (ex. `OrderId`, `SellerSkus`) → on **re-fetch** les détails via l'API (le webhook n'est pas une source de données complète).
- Endpoint TOUT EN UN : `/api/webhooks/jumia` avec **vérification de signature** (mécanisme à qualifier selon la doc du marché) + table `webhook_events` (détection des doublons par `event_id`).

---

## 5. Mapping des statuts (à figer en P2)

| Statut Jumia (commande) | Statut TOUT EN UN |
|---|---|
| `pending` | `pending` |
| `ready to ship` | `ready_to_ship` |
| `shipped` | `shipped` |
| `delivered` | `delivered` |
| `cancelled` | `cancelled` |
| `failed delivery` | `failed` |
| `returned` / `return waiting for approval` | `returned` / `return_pending` |

Les libellés exacts varient selon l'API ; le mapping sera écrit dans `src/modules/jumia-integration/mappings.ts` et **testé** avec des exemples réels.

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
