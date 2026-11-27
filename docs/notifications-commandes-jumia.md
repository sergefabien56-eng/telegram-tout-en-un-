# Module « Notifications — commandes Jumia »

> Version : 1.0 — module livré.
> Périmètre : **application web** et **Mini App Telegram**, quand elles sont
> ouvertes. **Aucun** message Telegram, e-mail, push ou autre notification
> hors application.

---

## 1. Ce que fait le module

Le module surveille les commandes Jumia et produit des **alertes
in-application** :

| Alerte | Quand elle apparaît | Priorité |
|---|---|---|
| `nouvelle_commande` | La commande vient d'arriver et attend sa préparation | info → warning |
| `delai_24h` | La commande attend toujours sa préparation et le seuil préventif est dépassé | critique |
| `synchronisation` | La relecture des commandes a échoué, est partielle ou est en retard | warning → critique |

Une **seule alerte active par commande** : la clé de déduplication
`boutique:commande` est unique en base. Le contenu et la priorité **évoluent**
avec la situation ; l'alerte est **résolue** quand la commande ne justifie
plus l'alerte (elle est préparée, expédiée, livrée, annulée…).

La lecture est **personnelle** (`order_alert_reads`) : l'alerte est partagée
par les membres de la boutique, mais chacun garde son propre état « vu / non
vu ». C'est ce qui permet de présenter comme **non vues** les commandes
arrivées pendant l'absence du vendeur.

## 2. Périmètre : ce qui est expressly exclu

- **Aucune notification hors application.** Pas de message Telegram, pas
  d'e-mail, pas de push. Les helpers existants capables d'envoyer un
  Telegram direct (`src/lib/telegram-service.ts`,
  `src/lib/coherence-alerts.ts`) ne sont **pas** utilisés par ce module.
- **La synchronisation continue en arrière-plan** quand l'interface est
  fermée : la tâche planifiée `POST /api/cron/sync` (toutes les 3 h) et le
  polling à l'écran rejouent l'API Vendor Center. Les alertes sont
  recalculées **à la fin de chaque relecture** (`syncShopOrders`), donc
  elles existent même si le vendeur n'a jamais ouvert l'application.
- **Le module ne modifie jamais un statut de commande** par lui-même. Seule
  une réponse de Jumia fait foi.

## 3. Le seuil de 24 h est préventif

Le seuil de 24 h est un **repère de priorisation**, jamais une heure limite
d'annulation : Jumia n'annule pas automatiquement une commande à 24 h.

Il est **fondé sur la mesure réelle** des commandes observées (271 commandes
expédiées) :

| Repère | Valeur |
|---|---|
| Minimum | 0,9 h |
| p25 | 16,0 h |
| Médiane | 22,3 h |
| p75 | 37,0 h |
| p90 | 51,2 h |
| Maximum | 91,7 h |
| Expédiées en moins de 24 h | 147 / 271 (54 %) |
| Expédiées en moins de 48 h | 233 / 271 (86 %) |

**Le seuil est configurable par boutique** : page « Alertes » → « Seuil de
préparation », ou `POST /api/shops/<id>/alertes/delai`
(`{ "heures": 48 }`). La valeur est stockée dans `app_settings`
(`alertes.delai_preventif_heures.<shopId>`).

> L'API Vendor Center de Jumia **n'expose aucun endpoint de délai de
> préparation** : la liste complète des chemins de la spec OpenAPI a été
> vérifiée. Le délai applicable à une boutique et à un processus est donc une
> **règle saisie par le vendeur**, jamais une valeur inventée par
> l'application. Sans réglage, la valeur par défaut reste 24 h.

Les paliers d'alerte, pour un seuil `S` :

| Âge de la commande (horloge Jumia) | Nature | Priorité |
|---|---|---|
| `< S / 2` | `nouvelle_commande` — « Nouvelle commande reçue » | info |
| `S / 2 ≤ âge < S` | `nouvelle_commande` — « à traiter rapidement » | warning |
| `≥ S` | `delai_24h` — « en retard » | critique |

L'horloge du seuil est celle de **Jumia** (`orders.remote_created_at`) : c'est
elle qui fait tourner le délai côté plateforme. L'heure de **réception** par
l'application (`orders.first_seen_at`, posée à la première synchronisation)
est affichée à part, pour que le vendeur sache depuis quand la commande lui
est connue.

## 4. Actions et rights

Chaque alerte propose une action **calculée sur l'état courant** de la
commande (la base est interrogée au moment de l'affichage, pas le contenu
figé de l'alerte) :

| État de la commande | Action proposée |
|---|---|
| `en-attente` | **« Voir et préparer »** → `/commandes/<id>` |
| `pretes-a-expedier` | « Voir la commande » (jamais une seconde préparation) |
| autre | « Voir la commande » |
| alerte de synchronisation | « Vérifier la synchronisation » → `/commandes?boutique=<id>` |

## 5. Préparation et passage « Prêtes à expédier »

Depuis la page d'une commande, un utilisateur **autorisé** peut :

1. **préparer les articles** — `POST /orders/pack` avec
   `{ orderItems: [{ id, shipmentProviderId }] }` ;
2. **demander le passage « Prêtes à expédier »** — `POST /orders/ready-to-ship`
   avec `{ orderItemIds: [...] }`.

Règles tenues par le module :

- les **articles et informations d'expédition** (produit, SKU, statut, pays,
  mode d'expédition, transporteur) sont affichés **avant** l'envoi ;
- le transporteur vient **de l'API Jumia** (`GET /orders/shipment-providers`) :
  l'application ne transmet jamais un identifiant inventé ;
- le passage « Prêtes à expédier » demande une **confirmation explicite** ;
- le **contrôle des droits est fait côté serveur** (`orders:write`, réservé à
  `owner` et `manager`) : un rôle sans droit reçoit `403`, quoi qu'il tente ;
- les **étapes et validations de l'API Jumia** sont respectées (un seul
  transporteur par lot, même pays, même mode d'expédition) ;
- « Prêt à expédier » n'est affiché **qu'après la confirmation effective de
  Jumia** : la commande est relue chez Jumia après l'action, et c'est cette
  relecture qui fait foi ;
- un **succès, un refus et une réussite partielle** sont distingués et
  rapportés **article par article** (`success.packages[]` /
  `error.orderItems[]`) ;
- **« Prêt à expédier » n'est jamais présenté comme « expédié »**, et aucun
  statut n'est modifié à cause d'une notification.

Rôle Jumia requis pour les deux appels : **VC - Order Manager**. Un compte
qui ne l'a pas se voit refuser l'appel ; le refus est remonté tel quel.

## 6. Points d'intégration

| Fichier | Rôle |
|---|---|
| `src/db/schema.ts` | Tables `order_alerts`, `order_alert_reads` ; colonne `orders.first_seen_at` |
| `drizzle/0019_order_alerts.sql` | Migration |
| `src/lib/order-alerts.ts` | Moteur : calcul, réconciliation, escalade, résolution, lecture |
| `src/lib/order-preparation.ts` | État de préparation, transporteurs, relecture après action |
| `src/lib/jumia/order-preparation.ts` | Appels Jumia `pack`, `ready-to-ship`, `shipment-providers` + décodage |
| `src/lib/orders-sync.ts` | Recalcule les alertes à la fin de chaque relecture |
| `src/app/api/order-alerts/route.ts` | Liste des alertes + compteur non vues (`?force=1` pour recalculer) |
| `src/app/api/order-alerts/[id]/read/route.ts` | Marquer une alerte comme vue |
| `src/app/api/orders/[id]/preparation/route.ts` | Préparation et passage « Prêtes à expédier » (contrôle des droits) |
| `src/app/api/shops/[id]/alertes/delai/route.ts` | Seuil de préparation par boutique |
| `src/components/order-alerts-bell.tsx` | Cloche (web + Mini App), rafraîchissement toutes les 60 s |
| `src/components/order-alerts-list.tsx` | Liste des alertes (page « Alertes ») |
| `src/components/order-preparation-panel.tsx` | Panneau de préparation d'une commande |
| `src/components/alert-deadline-control.tsx` | Réglage du seuil par boutique |

## 7. Modèle de données

```
order_alerts
  id, shop_id, order_id (null = alerte de boutique), kind, dedupe_key (unique),
  priority, title, body, status (active|resolved), first_detected_at,
  updated_at, resolved_at, resolution, metadata

order_alert_reads
  (alert_id, user_id) — clé primaire composite, read_at

orders.first_seen_at
  nullable — heure de première réception par l'application ; `null` pour les
  commandes déjà enregistrées avant l'existence de la colonne (leur date de
  réception n'est pas connue : inventer la date du jour serait un faux).
```

## 8. Scénarios couverts par les tests

Voir `docs/etat-livraison.md` pour le détail testé / non testé.
