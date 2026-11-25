# Audit technique — plateforme multiboutique Tout en Un Business Manager

> Document d'audit exploitable. Il décrit l'état **réel** de la plateforme
> après audit : causes identifiées, corrections structurelles appliquées,
> preuves, et ce qui reste à faire.
>
> Date de l'audit : 25/11/2026 · Périmètre : Seller Centers Jumia (web, API,
> Telegram, Mini App) · Base : une seule base PostgreSQL, schéma unique.

---

## 1. Verdict en une page

| Domaine | Verdict avant audit | Verdict après corrections |
| --- | --- | --- |
| Isolation des boutiques | **Contestable** : une synchronisation pouvait lire le compte d'une autre boutique | **Garantie** : compte lié obligatoire, lots mono-boutiques refusés avant écriture |
| Authenticité des données | **Trompeuse** : `shops.status = "connected"` posé au rattachement, sans preuve | **Factuelle** : 6 états dérivés de faits (lien, compte, données, sync) |
| Preuve de cohérence | **Absente** : aucun comparatif source/local | **Opérationnelle** : comparaison Jumia ↔ application, écarts prouvés et qualifiés |
| Diagnostic interne | **Absent** | **Intégré** : `/admin/diagnostics` + `/api/admin/diagnostics`, actions correctives tracées |
| Tests E2E multiboutiques | **Inexistants** | **Présents** : isolation en base réelle, diagnostic, refus d'accès |
| Fenêtre de comparaison | **Fausse alerte** (fenêtre rolling ≠ dates Jumia) | **Alignée** sur les jours UTC utilisés par l'API Jumia |

**Preuve sur données réelles (25/11/2026, 2 boutiques connectées) :**

| Boutique | Produits (Jumia / app) | Commandes 90 j (Jumia / app) | Relevés (Jumia / app) | Verdict |
| --- | --- | --- | --- | --- |
| MaxiShopsCI | 16 / 16 | 193 / 193 | 13 / 13 | Opérationnelle |
| NKSF SHOP | 32 / 32 | 123 / 123 | 13 / 13 | Opérationnelle |

Écarts : **0**. Données mal attribuées : **0 / 316 commandes**, **0 / 48
produits**, **0 / 26 relevés**. Test réseau du compte vendeur : **valide** pour
les deux boutiques (1 boutique accessible par compte, ce qui est la preuve que
le périmètre de compte est bien respecté).

---

## 2. Architecture réelle (constat)

### 2.1 Chaîne de données

```
Jumia Seller Center (API)
   │  jeton : refresh token (compte vendeur) → access token (boutique)
   ▼
src/lib/jumia/client.ts       #getAccessTokenForShop
   │  exige : boutique distante + compte vendeur lié à CETTE boutique
   ▼
src/lib/jumia/{orders,catalog,payments}.ts   lecture paginée, filtrée
   ▼
src/lib/{orders,catalog}.ts    upsert par (boutique, identifiant externe)
   │  garde-fou : un lot = une seule boutique
   ▼
PostgreSQL : shops, shop_members, orders, products, product_variants,
             payout_statements, jumia_accounts, jobs, audit_logs
   ▼
src/lib/shop-scope.ts + resolveShopIds()   portée utilisateur
   ▼
Interface web / Telegram / Mini App
```

### 2.2 Points de rupture identifiés

| # | Constat | Impact | Cause architecturale | Correction |
| --- | --- | --- | --- | --- |
| B1 | `resolveDefaultAccount()` sans `shopId` retournait **le premier compte de l'utilisateur** | Une boutique pouvait lire les données d'une autre boutique | Le compte était choisi par défaut, jamais par lien | `resolveDefaultAccount(userId, shopId)` exige le lien ; `accountIdForShop()` ajouté |
| B2 | `getAccessTokenForShop()` retombait sur des identifiants historiques | Jeton obtenu pour une boutique, utilisé pour une autre | Repli historique toléré | Suppression du repli : boutique + compte liés obligatoires |
| B3 | `orders-sync` / `catalog-sync` / `payments-sync` acceptaient un compte arbitraire | Synchronisation hors périmètre | Absence de contrôle de liaison | Refus explicite si `accountIdForShop()` renvoie `null` |
| B4 | `upsertOrders` / `upsertProductSets` acceptaient un lot multi-boutiques | Attribution croisée possible en cas d'erreur d'appelant | Contrôle uniquement en amont | Refus **avant** l'ouverture de connexion, message explicite |
| B5 | `shops.status = "connected"` posé au moment du rattachement | Faux vert : boutique affichée connectée sans aucune donnée | Statut Declaration, pas de fait | `src/lib/connection-state.ts` : 6 états factuels |
| B6 | Aucun comparatif source/local | Impossible de prouver que les données sont bien celles de Jumia | Absence d'outil de preuve | `src/lib/coherence.ts` |
| B7 | Fenêtre de comparaison rolling (90 × 24 h) | Faux positif « 1 commande manquante » alors que 0 | ≠ borne `createdAfter` de l'API (dates UTC) | Fenêtre alignée sur minuit UTC |
| B8 | `getDb()` appelé avant le garde-fou d'isolation | Le lot mixte était détecté après ouverture de la base | Ordre des opérations | Garde-fou remonté avant `getDb()` |

---

## 3. Modèle de données et propriété

### 3.1 Propriété des boutiques

```
users ──< shop_members >── shops ──< orders / products / product_variants / payout_statements
  │                             │
  │                             └── jumia_accounts (compte vendeur, 1 par boutique max)
  └── sessions / audit_logs / jobs
```

- `shop_members(user_id, shop_id, role)` est la **seule** source d'accès.
  Rôles : `owner`, `manager`, `assistant`, `viewer` (`src/lib/permissions.ts`).
- `shops.jumia_account_id` est le **seul** lien entre une boutique et un compte
  vendeur Jumia. Un compte peut porter plusieurs boutiques, une boutique ne
  peut porter qu'un compte.
- `shops.remote_shop_id` est l'identifiant de la boutique **côté Jumia** ;
  `shops.external_shop_id` est l'identifiant interne du vendeur. Les deux
  sont distincts et ne doivent jamais être confondus.

### 3.2 Clés d'unicité (garantie d'isolation au niveau SQL)

| Table | Unicité |
| --- | --- |
| `orders` | (shop_id, external_order_id) |
| `products` | (shop_id, external_product_id) |
| `product_variants` | (shop_id, external_sku) |
| `payout_statements` | (shop_id, remote_shop_sid, period_start) |

Une donnée ne peut donc pas être rattachée deux fois à deux boutiques.

---

## 4. Authenticité des données : les états factuels

`src/lib/connection-state.ts` — fonction `connectionLabelFor()`, testée
unitairement (`src/lib/__tests__/connection-state.test.ts`).

| État | Condition | Opérationnelle ? |
| --- | --- | --- |
| `non_rattachee` | pas d'`remote_shop_id` | non |
| `compte_manquant` | boutique rattachée, aucun `jumia_account_id` | non |
| `compte_invalide` | compte lié mais `status ≠ active` (refresh token refusé) | non |
| `connectee_sans_donnees` | lien + compte valides, **aucune** donnée reçue | non |
| `donnees_incompletes` | données reçues, dernière synchronisation en échec | non |
| `connectee` | lien + compte valides + données + dernière synchronisation OK | **oui** |

Règle appliquée dans toute l'interface : **un statut n'est jamais affiché
seul**. Chaque boutique affiche son état factuel et son détail
(ex. « Boutique rattachée, mais aucun compte vendeur Jumia n'est lié : la
synchronisation est refusée »).

Aucune donnée simulée n'est produite en production : les seules données
factices des tests E2E sont créées puis **supprimées** par
`e2e/global-teardown.ts`.

---

## 5. Preuve de cohérence (source ↔ application)

`src/lib/coherence.ts` — `checkShopCoherence({ shopId, days })`.

### 5.1 Méthode

1. **Volumétrie locale** factuelle : produits, variantes, commandes,
   commandes dans la fenêtre, relevés, dernière synchronisation.
2. **Contrôles d'intégrité locale** (sans réseau) :
   - `donnees_melangees` : une commande/produit/relevé de la boutique porte
     l'identifiant d'une **autre** boutique Jumia (lecture de la charge utile
     brute) ;
   - `donnees_sans_provenance` : donnée sans charge utile brute Jumia ;
   - `doublons` : numéro de commande répété pour une même boutique ;
   - `synchronisation_echouee` : dernière synchronisation en échec ;
   - `donnees_perimeses` : dernière synchronisation de plus de 7 jours.
3. **Lecture distante** avec le **compte lié à la boutique** :
   catalogue, commandes (fenêtre alignée sur les jours UTC), relevés filtrés
   par `shopSid`.
4. **Écarts** : manque (`donnees_manquantes`), excédent
   (`donnees_en_trop`), avec la règle « si la lecture distante est tronquée
   (quota), le nombre distant est une borne basse : seul un manque est
   concluant ».

### 5.2 Codes d'anomalie

| Code | Gravité | Signification |
| --- | --- | --- |
| `donnees_manquantes` | critique / avertissement | Jumia a plus que nous sur la même fenêtre |
| `donnees_en_trop` | information | Données locales hors fenêtre Jumia (aucune suppression automatique) |
| `donnees_melangees` | critique | Donnée portant l'identifiant d'une autre boutique |
| `donnees_sans_provenance` | critique | Donnée sans charge utile brute vérifiable |
| `doublons` | avertissement | Numéro de commande répété |
| `donnees_perimeses` | avertissement | Synchronisation de plus de 7 jours |
| `synchronisation_echouee` | critique | Dernière synchronisation en échec |
| `compte_manquant` | critique | Boutique non comparable (pas de lien ou pas de compte) |
| `lecture_impossible` | critique | Jumia a refusé la lecture (jeton, quota, réseau) |

### 5.3 Fenêtre de comparaison

L'API Jumia prend `createdAfter` / `createdBefore` sous forme de **dates**.
La fenêtre est donc calculée en **jours UTC** :

```
from = minuit UTC (aujourd'hui) − days
to   = aujourd'hui
```

et la volumétrie locale utilise `remote_created_at >= from` (sans borne
supérieure : une commande future reste comptée). Une fenêtre « rolling »
(90 × 24 h) produisait de faux écarts de 1 commande — c'est ce qui a été
observé puis corrigé.

---

## 6. Diagnostic intégré

### 6.1 Accès

- Écran : `/admin/diagnostics` (section **Administration** → « Diagnostic des
  boutiques »).
- API : `GET /api/admin/diagnostics?deep=1` (rapport, contrôle réseau inclus),
  `POST /api/admin/diagnostics` `{ shopId, action: "resync" }` (action
  corrective).
- Accès : propriétaires et gestionnaires (`admin:read`). Un autre rôle reçoit
  **403**.

### 6.2 Contenu du rapport

Pour chaque boutique : état de connexion, volumes locaux, volumes distants,
écarts, test réseau du compte vendeur, anomalies classées avec **preuve
chiffrée**, **origine** et **conséquence/action**.

Verdicts : `operationnelle`, `partielle`, `hors_service`.

### 6.3 Action corrective et sauvegardes

`repairShop()` (réservé aux propriétaires/gestionnaires) :

1. **Sauvegarde** préalable de la base, compressée, dans `backups/`
   (`backup-reparation-<horodatage>.sql.gz`), produite par le même module que
   `scripts/backup.mjs` et `GET /api/admin/backup` — un seul format, une seule
   vérité ;
2. synchronisation complète de la boutique (`src/lib/full-sync.ts`) ;
3. **journalisation** dans `audit_logs` (`admin.shop_repaired`) avec le nom de
   la sauvegarde.

Aucune suppression automatique n'est effectuée : l'upsert écrase les lignes
de la boutique concernée et écarte les données qui portent l'identifiant d'une
autre boutique. Les fichiers de sauvegarde ne sont jamais commités
(`.gitignore`).

---

## 7. Tests

### 7.1 Unitaires

| Fichier | Objet |
| --- | --- |
| `src/lib/__tests__/connection-state.test.ts` | 8 tests : chaque état factuel, y compris « pas de faux vert » |
| `src/lib/__tests__/isolation-batch.test.ts` | 3 tests : refus des lots multi-boutiques (avant base) |
| `src/lib/__tests__/isolation-multishop.test.ts` | 5 tests sur base réelle : deux boutiques, aucune contamination |
| `src/lib/__tests__/shop-guard.test.ts` | lecture des identifiants Jumia, rejet des données étrangères |

### 7.2 E2E

| Fichier | Objet |
| --- | --- |
| `e2e/diagnostics.spec.ts` | 2 tests : rapport factuel sur deux boutiques non rattachées, refus 403 hors administration |
| `e2e/boutique-selection.spec.ts` | sélection de boutique active |
| `e2e/synchronisations.spec.ts` | historique et progression des synchronisations |
| `e2e/jumia-link.spec.ts` | rattachement depuis l'interface |

Les tests E2E ne simulent **aucune donnée métier** pour valider un
comportement de données : ils créent, vérifient, puis la base est purgée.

---

## 8. Points de vigilance et suites

### 8.1 Résidus assumés

| Point | État | Traitement |
| --- | --- | --- |
| `resolveShopIds()` retombe sur **toutes** les boutiques autorisées si `boutique` est absent ou invalide | hors périmètre immédiat | à revoir si une politique mono-boutique stricte est souhaitée |
| Lecture distante tronquée par quota Jumia | signalé par `remote.truncated` | le nombre distant devient une borne basse ; seul un manque est concluant |
| Relevés lus au niveau du compte puis filtrés par `shopSid` | filtre appliqué | si Jumia retire `shopSid`, la preuve devient indisponible (signalé, pas masqué) |

### 8.2 Recommandations

1. **Supprimer `shops.status`** une fois la migration de l'interface
   terminée : le statut stocké est une source de vérité concurrente et
   trompeuse.
2. **Purger l'historique** `shops.status = "connected"` pour les boutiques
   sans données réelles (migration de correction, avec sauvegarde).
3. **Surveiller `jobs`** : une synchronisation qui se termine en `failed`
   doit rester visible dans le diagnostic (elle l'est : `synchronisation_echouee`).
4. **Étendre le diagnostic aux finances** (comparaison des montants de
   relevé, pas seulement des volumes) : les volumes sont prouvés, les
   montants restent à prouver au centime.

---

## 9. Traçabilité

| Correction | Fichiers | Preuve |
| --- | --- | --- |
| Compte lié obligatoire | `src/lib/jumia/accounts.ts`, `src/lib/jumia/client.ts`, `src/lib/{orders,catalog,payments}-sync.ts` | typecheck + tests + diagnostic sur 2 boutiques réelles |
| Lots mono-boutiques | `src/lib/orders.ts`, `src/lib/catalog.ts` | `isolation-batch.test.ts`, `isolation-multishop.test.ts` |
| État factuel | `src/lib/connection-state.ts` | `connection-state.test.ts` (8 tests) |
| Preuve de cohérence | `src/lib/coherence.ts` | diagnostic exécuté sur 2 boutiques : 0 écart |
| Diagnostic intégré | `src/lib/diagnostics.ts`, `src/app/api/admin/diagnostics/route.ts`, `src/app/(app)/admin/diagnostics/page.tsx` | `e2e/diagnostics.spec.ts` (2 tests) |
| Fenêtre alignée sur les jours UTC | `src/lib/coherence.ts` | faux écart de 1 commande eliminated, 0 écart sur les 2 boutiques |
