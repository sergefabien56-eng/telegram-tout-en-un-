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
| Statut de boutique stocké | **Colonne `shops.status`** : source de vérité concurrente | **Supprimée** (migration `0012`) : l'état se calcule |
| Périmètre par défaut | **Toutes les boutiques** | **La boutique courante**, agrégat sur demande explicite |
| Preuve financière | **Aucune** (volumes seulement) | **Au centime**, relevés **et** commandes |
| Historique de cohérence | **Aucun** | **Un instantané par jour** par boutique + détection de dérive |
| Alerte au vendeur | **Aucune** : la dérive ne se découvrait qu'en ouvrant le diagnostic | **Alertes web + Telegram**, une par boutique/jour/problème, traçables, dédupliquées **par destinataire** |

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
| B9 | Colonne `shops.status` posée au rattachement | Source de vérité concurrante : un lecteur pouvait croire la boutique « connectée » sur un statut declaratif | Un statut **déclaré** cohabitait avec l'état réel | Colonne **supprimée** (migration `0012`), état calculé partout |
| B10 | `resolveShopIds()` : une boutique inconnue ou absente retombait sur **toutes** les boutiques autorisées | Une URL pouvait élargir le périmètre ; l'affichage par défaut mélangeait les boutiques | Absence de périmètre par défaut | Défaut = **boutique courante** ; une boutique non autorisée donne un périmètre **vide** (refus explicite) |
| B11 | Relevés de versement lus sur une seule page et jamais comparés aux montants stockés | Une dérive financière (ou un relevé manquant) passait inaperçue | Aucun contrôle de cohérence financière | `compareFinancials()` : comparaison au centime, relevé par relevé |
| B12 | Montants des commandes jamais comparés à la source | Le chiffre affiché au vendeur pouvait diverger de Jumia sans qu'on le sache | Contrôle limité aux volumes | `compareOrders()` : comparaison au centime, commande par commande |
| B13 | Aucune mémoire des contrôles | Une boutique pouvait dériver sans que personne ne le voie | Contrôle ponctuel, sans historique | Table `coherence_snapshots` (migration `0013`) : un instantané par jour et par boutique, dérive détectée automatiquement |

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
| `montant_divergent` | critique | Montant d'un relevé ou d'une commande différent de la source |
| `releve_manquant` / `commande_manquante` | critique | Donnée présente chez Jumia, absente de la base |
| `releve_en_trop` / `commande_en_trop` | information | Donnée en base, hors de la fenêtre lue chez Jumia |
| `commande_non_synchronisee` | information | Statut de commande périmé (la donnée est ancienne, pas fausse) |
| `releve_non_attribuable` | avertissement | Relevé Jumia sans `shopSid` : non attribuable, donc non vérifié |
| `releve_illisible` | avertissement | Relevé Jumia non décodable : aucun montant attribué |

### 5.3 PREUVE FINANCIÈRE (au centime)

`compareFinancials()` (`src/lib/coherence.ts`) compare chaque relevé renvoyé
par Jumia avec la ligne enregistrée, **relevé par relevé et montant par
montant** : solde d'ouverture, CA articles, frais de livraison, commissions et
frais, autres produits, remboursements, solde net, montant versé, plus la
devise et le statut de paiement.

La conversion passe par `normalizePayoutStatement()` — **exactement** la
fonction utilisée à l'écriture. Un écart mesuré est donc un écart réel
(donnée absente, périmée ou mal attribuée), jamais un artefact d'arrondi.

| Mesure | Signification |
| --- | --- |
| `compared` | relevés présents des deux côtés |
| `divergent` | relevés dont au moins un montant diffère |
| `missing` | relevés chez Jumia mais absents de la base |
| `extra` | relevés en base mais absents de la lecture Jumia |
| `local` / `remote` | totaux comparés (CA articles, frais, remboursements, solde net) |

Anomalies dédiées : `montant_divergent` (critique), `releve_manquant`
(critique), `releve_en_trop` (information), `releve_non_attribuable`
(avertissement : relevé Jumia sans `shopSid`, donc non attribuable),
`releve_illisible` (avertissement).

**Preuve sur données réelles (25/11/2026)** :

| Boutique | Relevés comparés | Divergents | CA articles local | CA articles Jumia |
| --- | --- | --- | --- | --- |
| MaxiShopsCI | 13 | 0 | 512 449 XOF | 512 449 XOF |
| NKSF SHOP | 13 | 0 | 454 168 XOF | 454 168 XOF |

### 5.4 PREUVE DES COMMANDES (au centime)

`compareOrders()` (`src/lib/coherence.ts`) compare chaque commande renvoyée
par Jumia avec la ligne enregistrée, **commande par commande**.

Comme pour les relevés, la conversion passe par `normalizeOrder()` — la
fonction utilisée à l'écriture. L'écart mesuré est donc réel.

Deux natures d'écart sont **distinguées**, car elles ne se traitent pas de la
même façon :

| Nature | Gravité | Signification |
| --- | --- | --- |
| Montant (local, USD, devise) | **critique** | Le chiffre affiché au vendeur serait faux → resynchroniser |
| Statut | **information** | Jumia a fait avancer la commande depuis la dernière copie → donnée périmée, pas fausse |

Un statut périmé est **normal** (une commande expédiée devient livrée) :
le traiter comme une erreur noierait le diagnostic sous du bruit.

**Preuve sur données réelles (25/11/2026)** :

| Boutique | Commandes comparées | Montants divergents | Statuts périmés | Montant local | Montant Jumia |
| --- | --- | --- | --- | --- | --- |
| MaxiShopsCI | 193 | 0 | 0 | 883 917 XOF | 883 917 XOF |
| NKSF SHOP | 123 | 0 | 0 | 663 659 XOF | 663 659 XOF |

### 5.5 HISTORIQUE ET DÉRIVE

Un contrôle ponctuel prouve qu'une boutique est cohérente **aujourd'hui**.
C'est la **suite** des contrôles qui prouve qu'elle ne dérive pas.

**Table `coherence_snapshots`** (migration `0013`) : un instantané par boutique
et par jour (index unique `(shop_id, day)`), contenant les volumétries locale
et distante, les montants comparés (CA articles, solde net, montant des
commandes), le nombre d'anomalies et leurs codes.

**Enregistrement** : à chaque contrôle en profondeur du diagnostic, et une
fois par jour via le point d'entrée planifié `POST /api/cron/coherence`.

**Dérive** (`detectDrift()`) — comparaison du dernier instantané au précédent :

| Code | Gravité | Détection |
| --- | --- | --- |
| `ecart_apparu` | avertissement | le contrôle précédent n'avait aucune anomalie, le dernier en a |
| `ecart_resolu` | information | l'inverse : les données sont revenues à la normale |
| `montant_recule` | avertissement | le CA articles local a **diminué** depuis le dernier contrôle |
| `volume_aplati` | avertissement | les commandes locales ont chuté alors que la source, non |

Une dérive n'est pas forcément une faute : Jumia peut corriger un relevé. Ce
qui compte, c'est que **le changement soit visible et expliqué**.

### 5.6 Fenêtre de comparaison

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

### 5.7 RÉFÉRENCE LOCALE ET SEUIL DE DÉRIVE

Comparer le CA d'aujourd'hui à celui d'hier produit un **faux signal** dès
que la saisonnalité entre en jeu (les ventes de décembre ne sont pas
comparables à celles de juin). La référence est donc **locale** :

| Élément | Valeur | Raison |
| --- | --- | --- |
| Historique conservé | **180 jours** | couvre un cycle saisonnier complet |
| Référence | **médiane des 7 contrôles précédents** | robuste à un contrôle atypique, contrairement à la moyenne |
| Seuil de dérive | **20 %** | au-delà : bruit de fond ignoré ; en dessous : perte de données ou correction importante à la source |

La médiane est calculée sur `revenueMinor` : les cumuls sur fenêtre glissante
(90 jours) bougent naturellement de quelques pour cent d'un jour à l'autre.

```ts
localBaseline(history)  // médiane des 7 instantanés précédents
detectDrift(history)    // compare le dernier instantané à cette référence
```

---

## 5 bis. ALERTES AU VENDEUR

L'historique **détecte** une dérive ; le vendeur doit être **prévenu**. Sans
alerte, la dérive ne se découvre qu'en ouvrant le diagnostic — c'est-à-dire
trop tard.

### Ce qui déclenche une alerte

Seulement ce qui est **actionnable** :

| Cas | Alerte ? | Pourquoi |
| --- | --- | --- |
| Anomalie `critique` | **oui** | la preuve est fausse : le vendeur perd de l'argent ou voit une donnée erronée |
| Anomalie `avertissement` | **oui** | action corrective requise |
| Dérive actionnable (`avertissement`) | **oui** | la boutique s'écarte de sa référence locale |
| Anomalie `information` (statut périmé) | non | bruit : un relevé non synchronisé est normal |
| Dérive `ecart_resolu` (`information`) | non | c'est une **bonne nouvelle** |
| Aucune anomalie, aucune dérive | non | tout va bien |

### Canaux

Deux canaux, **sans coût externe** :

- **web** : notification dans l'application (cloche + page « Notifications ») ;
- **telegram** : message direct au compte lié du destinataire.

Les préférences du vendeur sont **respectées** (`user_notification_prefs`,
canal × type) : un type désactivé n'est jamais envoyé.

### Destinataires

Les **propriétaires et gestionnaires** de la boutique (`shop_members` avec
rôle `owner` ou `manager`). La déduplication est **par destinataire** : deux
gestionnaires de la même boutique sont **tous les deux** prévenus —
l'index unique porte sur `(user_id, dedupe_key)`, pas sur la clé seule.

### Clé de déduplication

```
coherence:<boutique>:<jour UTC>:<code du problème>:<canal>
```

Une seule alerte par boutique, par jour, par problème et par canal. Le
contrôle planifié passe chaque jour, et le diagnostic peut être ouvert à la
main : sans cette clé, le vendeur recevrait le même message plusieurs fois.

### Traçabilité

Chaque envoi est **écrit** dans `notifications` avec son canal
(`web` / `telegram`) et son statut (`pending`, `sent`, `failed`) : on peut
prouver ce qui a été envoyé, sur quel canal, et avec quelle erreur en cas
d'échec.

### Points de déclenchement

| Où | Effet |
| --- | --- |
| `POST /api/cron/coherence` | contrôle planifié quotidien (cron GitHub Actions) |
| `src/lib/diagnostics.ts` (`shouldAlert()`) | diagnostic interne ouvert à la main |

Une **dérive seule** déclenche bien une alerte, même si le contrôle du jour
ne remonte aucune anomalie : c'est le cas le plus important, puisqu'il est
invisible sans historique.

---

## 6. Périmètre mono-boutique et suppression du statut stocké

### Le statut stocké a été supprimé

`shops.status` (`pending` / `connected` / `disconnected`) était posé au
moment du rattachement : c'était une **déclaration**, pas une preuve. La
colonne est **supprimée** (migration `0012_drop_shop_status.sql`, générée par
Drizzle, appliquée après sauvegarde `backup-2026-11-25-08-08-43.sql.gz`).

| Avant | Après |
| --- | --- |
| `shops.status` (texte libre) | état calculé par `connectionLabelFor()` |
| `PATCH /api/shops/:id` acceptait `status` | le statut n'est plus modifiable par l'API |
| `POST /api/shops/:id/disconnect` posait `status = "disconnected"` | la route **débranche réellement** la boutique (lien distant + compte vendeur retirés) ; les données synchronisées sont conservées |
| Administration : « connectées » = `remoteShopName IS NOT NULL` | Administration : « connectées » = état **opérationnel** |

### Le périmètre par défaut est une seule boutique

`resolveShopIds()` (testé dans `src/lib/__tests__/shop-scope.test.ts`) :

| Situation | Périmètre retenu |
| --- | --- |
| `?boutique=<id>` autorisé | cette boutique seule |
| `?boutique=<id>` **non autorisé** | **vide** → l'écran affiche « cette boutique n'est pas dans votre périmètre » |
| aucun filtre | **la boutique courante** (celle choisie dans l'en-tête) |
| `?boutique=toutes` | toutes les boutiques autorisées (agrégat **explicite**) |

Avant, une boutique inconnue ou l'absence de filtre retombaient sur toutes les
boutiques autorisées : une URL pouvait donc élargir le périmètre, et
l'affichage par défaut mélangeait les boutiques — ce qui explique la
confusion signalée par le vendeur.

---

## 7. Diagnostic intégré

### 7.1 Accès

- Écran : `/admin/diagnostics` (section **Administration** → « Diagnostic des
  boutiques »).
- API : `GET /api/admin/diagnostics?deep=1` (rapport, contrôle réseau inclus),
  `POST /api/admin/diagnostics` `{ shopId, action: "resync" }` (action
  corrective).
- Contrôle planifié : `POST /api/cron/coherence`, protégé par
  `Authorization: Bearer <CRON_SECRET>`, appelé chaque jour par un cron
  GitHub Actions (`.github/workflows/coherence.yml`, **0 FCFA**).
- Accès : propriétaires et gestionnaires (`admin:read`). Un autre rôle reçoit
  **403**. Le point d'entrée planifié répond **401** sans secret valide.

### 7.2 Contenu du rapport

Pour chaque boutique : état de connexion, volumes locaux, volumes distants,
écarts, test réseau du compte vendeur, **preuve financière au centime**
(relevés), **preuve des commandes au centime**, **historique quotidien** des
contrôles, et anomalies classées avec **preuve chiffrée**, **origine** et
**conséquence/action**.

Verdicts : `operationnelle`, `partielle`, `hors_service`.

### 7.3 Action corrective et sauvegardes

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

## 8. Tests

### 8.1 Unitaires

| Fichier | Objet |
| --- | --- |
| `src/lib/__tests__/connection-state.test.ts` | 8 tests : chaque état factuel, y compris « pas de faux vert » |
| `src/lib/__tests__/isolation-batch.test.ts` | 3 tests : refus des lots multi-boutiques (avant base) |
| `src/lib/__tests__/isolation-multishop.test.ts` | 5 tests sur base réelle : deux boutiques, aucune contamination (la base est purgée en fin de test) |
| `src/lib/__tests__/shop-scope.test.ts` | 8 tests : périmètre par défaut mono-boutique, refus d'élargissement |
| `src/lib/__tests__/financial-proof.test.ts` | 10 tests : la preuve financière **détecte** un montant modifié, un relevé manquant, un relevé surnuméraire, une devise ou un statut de paiement faux |
| `src/lib/__tests__/order-proof.test.ts` | 10 tests : la preuve des commandes **détecte** un montant modifié (local et USD), une commande manquante, une devise ; et distingue un statut périmé (information) d'un montant erroné (critique) |
| `src/lib/__tests__/coherence-history.test.ts` | 11 tests : la détection de dérive repère un CA qui recule, un écart qui apparaît, un écart résolu, un volume aplati — et ne se déclenche pas à tort quand la source a changé elle aussi ; référence locale par **médiane** sur 7 contrôles |
| `src/lib/__tests__/coherence-alerts.test.ts` | 12 tests : seules les anomalies actionnables sont signalées, une dérive l'est aussi, une dérive **résolue** ne l'est pas, la même dérive n'est pas signalée deux fois, et la clé de déduplication distingue boutique, jour, code et canal |
| `src/lib/__tests__/diagnostics-alert-trigger.test.ts` | 6 tests : le déclencheur d'alerte (une **dérive seule** alerte, une information n'alerte pas, une boutique cohérente n'alerte pas) |
| `src/lib/__tests__/coherence-alerts.integration.test.ts` | 6 tests **sur base réelle** : le propriétaire et le gestionnaire sont chacun notifiés, le doublon du même jour est bloqué, la dérive seule alerte, et la base est purgée en fin de test |
| `src/lib/__tests__/shop-guard.test.ts` | lecture des identifiants Jumia, rejet des données étrangères |

### 8.2 E2E

| Fichier | Objet |
| --- | --- |
| `e2e/diagnostics.spec.ts` | 2 tests : rapport factuel sur deux boutiques non rattachées, refus 403 hors administration |
| `e2e/boutique-selection.spec.ts` | sélection de boutique active |
| `e2e/synchronisations.spec.ts` | historique et progression des synchronisations |
| `e2e/jumia-link.spec.ts` | rattachement depuis l'interface |
| `e2e/perimetre-boutique.spec.ts` | 1 test : périmètre mono-boutique par défaut, refus d'élargissement, agrégat explicite |
| `e2e/diagnostics.spec.ts` | 3 tests : rapport factuel, contrôle planifié protégé par secret (401), refus hors administration |

Les tests E2E ne simulent **aucune donnée métier** pour valider un
comportement de données : ils créent, vérifient, puis la base est purgée.

---

## 9. Points de vigilance et suites

### 9.1 Résidus assumés

| Point | État | Traitement |
| --- | --- | --- |
| Lecture distante tronquée par quota Jumia | signalé par `remote.truncated` | le nombre distant devient une borne basse ; seul un manque est concluant |
| Relevés lus au niveau du compte puis filtrés par `shopSid` | filtre appliqué | si Jumia retire `shopSid`, la preuve devient indisponible (signalé, pas masqué) |

### 9.2 Action manuelle restante : brancher le cron

Le contrôle planifié est écrit, testé et **déployé** ; il ne se déclenche
encore que manuellement, car GitHub a besoin de deux secrets :

| Secret GitHub | Valeur | Où la trouver |
| --- | --- | --- |
| `APP_URL` | `https://tout-en-un-business-manager.onrender.com` | l'URL publique de l'application |
| `CRON_SECRET` | **la même valeur** que celle définie sur Render (`render.yaml` → `CRON_SECRET`) | dashboard Render → Environment |

À faire une seule fois :
**Settings → Secrets and variables → Actions → New repository secret**.

Vérification : *Actions → Contrôle de cohérence quotidien → Run workflow*
(lancement manuel). Le journal doit afficher
`Contrôle de cohérence terminé`. Sans les secrets, le job se termine
proprement avec un message explicite — il n'échoue jamais bruyamment.

### 9.3 Recommandations

1. **Surveiller `jobs`** : une synchronisation qui se termine en `failed`
   doit rester visible dans le diagnostic (elle l'est : `synchronisation_echouee`).
2. **Historiser les ruptures sur la durée** : l'instantané quotidien est en
   place sur **180 jours** ; la référence locale (médiane sur 7 contrôles)
   absorbe la saisonnalité. Il reste à suivre l'accumulation sur un an
   complet pour valider le seuil de 20 % sur une vraie saison.
3. **Brancher le cron** : les alertes ne partent qu'*après* le contrôle
   planifié quotidien — tant que les secrets GitHub ne sont pas posés, le
   contrôle et les alertes ne se déclenchent que manuellement (voir § 9.2).
4. **Ajuster le seuil de dérive** : 20 % est un choix raisonnable au
   démarrage ; si des alertes se déclenchent trop souvent sur une boutique
   très saisonnière, ce sera le signal de le recaler sur la référence
   locale plutôt que sur une valeur fixe (`DRIFT_RATIO`).

---

## 10. Traçabilité

| Correction | Fichiers | Preuve |
| --- | --- | --- |
| Compte lié obligatoire | `src/lib/jumia/accounts.ts`, `src/lib/jumia/client.ts`, `src/lib/{orders,catalog,payments}-sync.ts` | typecheck + tests + diagnostic sur 2 boutiques réelles |
| Lots mono-boutiques | `src/lib/orders.ts`, `src/lib/catalog.ts` | `isolation-batch.test.ts`, `isolation-multishop.test.ts` |
| État factuel | `src/lib/connection-state.ts` | `connection-state.test.ts` (8 tests) |
| Preuve de cohérence | `src/lib/coherence.ts` | diagnostic exécuté sur 2 boutiques : 0 écart |
| Diagnostic intégré | `src/lib/diagnostics.ts`, `src/app/api/admin/diagnostics/route.ts`, `src/app/(app)/admin/diagnostics/page.tsx` | `e2e/diagnostics.spec.ts` (2 tests) |
| Fenêtre alignée sur les jours UTC | `src/lib/coherence.ts` | faux écart de 1 commande éliminé, 0 écart sur les 2 boutiques |
| Preuve financière au centime | `src/lib/coherence.ts` (`compareFinancials`) | 13 relevés comparés par boutique, 0 divergence, CA articles identiques |
| Suppression du statut stocké | `drizzle/0012_drop_shop_status.sql`, `src/db/schema.ts` | migration Drizzle appliquée après sauvegarde ; 2 boutiques et 316/48/26 données intactes |
| Périmètre mono-boutique | `src/lib/order-access.ts`, `src/lib/shop-scope.ts` | 8 tests unitaires + 1 E2E (défaut, refus, agrégat explicite) |
| Preuve des commandes au centime | `src/lib/coherence.ts` (`compareOrders`) | 193 et 123 commandes comparées, 0 divergence, montants identiques |
| Historique et dérive | `src/lib/coherence-history.ts`, `drizzle/0013_coherence_snapshots.sql` | 11 tests de dérive + instantanés écrits sur les 2 boutiques réelles |
| Contrôle planifié | `src/app/api/cron/coherence/route.ts`, `.github/workflows/coherence.yml` | 401 sans secret, 200 avec : 2 boutiques contrôlées |
| Référence locale et seuil | `src/lib/coherence-history.ts` (`localBaseline`, `DRIFT_RATIO`) | médiane sur 7 contrôles, seuil 20 %, 180 jours d'historique |
| Alertes au vendeur | `src/lib/coherence-alerts.ts` | 12 tests unitaires + 6 tests sur base réelle (2 destinataires), alerte web **et** Telegram tracées |
| Dédup. par destinataire | `drizzle/0015_awesome_plazm.sql` (`(user_id, dedupe_key)`) | propriétaire et gestionnaire d'une même boutique : 2 notifications, pas 1 |
| Déclenchement sur dérive seule | `src/lib/diagnostics.ts` (`shouldAlert()`) | 6 tests : une dérive sans anomalie alerte bien |
| Traçabilité des envois | `notifications.channel` (`web` / `telegram`) | chaque envoi Telegram écrit avec son statut (`sent` / `failed`) |
