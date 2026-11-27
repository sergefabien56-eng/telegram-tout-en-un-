# État de livraison — 25/11/2026

## Ce qui est livré et en production

| Lot                                     | Commit    | CI    | Déploiement |
| --------------------------------------- | --------- | ----- | ----------- |
| Publication de produits Jumia           | `9f00e56` | verte | ✅          |
| Boutiques & Plateformes                 | `4256bc2` | verte | ✅          |
| Déploiement adossé au commit            | `c0fdb04` | verte | ✅          |
| Documentation du déploiement            | `be50093` | verte | ✅          |
| Déploiement sans dépendance API externe | `ab458d4` | verte | ✅          |

Production : `https://tout-en-un-business-manager.onrender.com` — `/api/health` répond
`{"status":"ok"}` et publie le commit réellement déployé (`commit`).

## Ordre de publication retenu

« Publication de produits Jumia » **puis** « Boutiques & Plateformes » : la nouvelle navigation
pointe vers `/boutiques/produits/nouveau`, qui n'existait qu'à partir du premier lot.

## Tests

| Suite                      | Commande                             | Résultat                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------- |
| Unitaires + intégration    | `npm test`                           | **335 réussis / 2 ignorés** (49 fichiers) |
| End-to-end (suite entière) | `npx playwright test`                | **76 réussis / 0 échec**                  |
| Statique                   | `npm run typecheck` · `npm run lint` | verts                                     |

Répartition E2E : `e2e/boutiques-platesformes.spec.ts` (2 scénarios de navigation/cartes) ·
`e2e/publication-produit-jumia.spec.ts` (3 scénarios de publication).

## Base de données

Migrations `0016` (suivi des publications) et `0017` (référentiel catégories) appliquées en
production. `product_publications` contient **0 ligne** : aucun produit n'a été envoyé à Jumia,
aucun quota d'écriture n'a été consommé.

## Comptes vendeurs Jumia connectés

| Compte           | Boutique    | Identifiant distant                    | Clients commerciaux | État     |
| ---------------- | ----------- | -------------------------------------- | ------------------- | -------- |
| MaxiShopsCI      | MaxiShopsCI | `58b3b1f5-ccbb-41e8-be72-af4b843e01fc` | `jumia-ci`          | actif ✅ |
| Compte principal | NKSF SHOP   | `eb47fa58-891c-406c-a799-1303dcbd4f1b` | `jumia-ci`          | actif ✅ |

Les refresh tokens sont chiffrés (AES-256-GCM) et ne sont jamais journalisés : seul leur
empreinte SHA-256 peut l'être. `scripts/connect-jumia-account.mjs` permet de reconnecter un
compte, de contrôler le jeton stocké et de relire la liste des boutiques distantes.

## Référentiel des catégories

Chargé pour les deux boutiques : **27 147 catégories**, chacune avec son ensemble d'attributs,
271 pages parcourues, état `complete`. C'est ce qui permet de choisir une catégorie réelle et de
valider les attributs avant publication.

## Points d'attention résolus

1. Le workflow de déploiement déclarait « succès » en quelques secondes : l'ancienne instance
   Render continuait de répondre pendant que le nouveau build se compilait (constaté :
   `/boutiques/ajouter` renvoyait 404). La vérification est désormais adossée au commit déployé —
   voir `docs/deploiement.md` § 2ter.
2. `app_settings.value` est un `jsonb` : la valeur est relue **déjà décodée** (un objet), alors
   que la lecture de l'état du chargement n'acceptait qu'une chaîne. L'état était donc perdu et
   un chargement terminé restait affiché comme « en cours », avec un rafraîchissement de
   l'interface toutes les 5 secondes. Corrigé par `parseCatalogSyncState` (4 tests unitaires).

## Reste à faire, le cas échéant

- Envoyer un **vrai** produit à Jumia à la main (quota + secrets) : jamais fait automatiquement.
- La sauvegarde Google Drive reste bloquée par une limitation de débit de l'API ; la sauvegarde
  locale `backups/backup-2026-11-25-13-59-07.sql.gz` est disponible.

## Synchronisation des commandes — corrigée et vérifiée (25/11/2026)

Jumia refuse (HTTP 422) de filtrer `GET /orders` par création **et** par mise à jour dans la
même requête, alors que la case « relire aussi les commandes plus anciennes » est proposée par
défaut : toute synchronisation se faisait refuser. La lecture se fait désormais en deux
requêtes, fusionnées.

| Boutique    | HTTP | Commandes lues | Insérées | Mis à jour | État | Commandes en base |
| ----------- | ---- | -------------- | -------- | ---------- | ---- | ----------------- |
| MaxiShopsCI | 200  | 64             | 2        | 62         | `ok` | 195               |
| NKSF SHOP   | 200  | 26             | 0        | 26         | `ok` | 124               |

Une seconde synchronisation est idempotente (0 insertion). Détail : `docs/jumia-integration.md`
§ 5 bis et `docs/matrice-etat-regressions.md` § 10.

## Identité de marque — logo officiel « Tout en Un » (25/11/2026)

Le logo communiqué par le commanditaire remplace le placeholder « TU » dans toute l'application : pictogramme vectoriel dans la barre latérale, l'accueil, la connexion et la Mini App, et icône applicative (`src/app/icon.svg`).

| Contrôle | Résultat |
|---|---|
| Fidélité à la source officielle | **0,69/255 d'écart absolu moyen par canal (0,27 %)** |
| Rendu desktop / mobile / Mini App, clair et sombre | vérifié dans un navigateur (captures régénérées) |
| Typecheck · lint · tests unitaires | verts · **335 réussis / 2 ignorés** |
| Suite E2E complète (dont audits WCAG axe) | **76 réussis / 0 échec** |

Détail : `docs/design-system.md` § 1.1 et `docs/matrice-etat-regressions.md` § 11.

## Étiquettes d'expédition — « Factures à imprimer » devient « Étiquettes à imprimer » (22/11/2026, revu le 26/11/2026)

La page **« Factures à imprimer »** était honnête mais vide : l'API Vendor Center ne fournit
pas de factures. Or la même API fournit les **étiquettes d'expédition**
(`POST /orders/print-labels`), documents réels, PDF à l'identique. La page est donc
**renommée** et devient fonctionnelle.

### Ce qui a été construit

| Brique | Emplacement | Rôle |
| --- | --- | --- |
| Schéma | `src/db/schema.ts` (migration `0018`) | `order_items` (21 colonnes) et `shipment_labels` (17 colonnes, PDF en `bytea`) |
| Client Jumia | `src/lib/jumia/order-items.ts` | `GET /orders/items` (plusieurs commandes par appel) et `POST /orders/print-labels` |
| Persistance | `src/lib/order-items.ts` · `src/lib/shipment-labels.ts` | upsert idempotent des articles et des étiquettes, trois états finaux |
| Job | `src/lib/labels-sync.ts` | relecture des articles, éligibilité, impression, enregistrement |
| Routes | `POST /api/shops/:id/etiquettes/generer` · `GET /api/etiquettes/:id/pdf` | permission `orders:write` / `orders:read` + périmètre vérifié côté serveur |
| Interface | `/commandes/a-traiter/etiquettes` | deux sections : **Prêtes à expédier** et **En attente** |

### Vérifications réelles

| Contrôle | Résultat |
| --- | --- |
| Contrat `GET /orders/items` relu sur l'API réelle | correspondance **exacte** des 17 champs (`trackingNumber`, `shipmentType`, `itemPriceLocal`, `country.code`, `product.sellerSku`…) |
| Articles synchronisés depuis les 2 boutiques | **41 articles** (20 + 21), 0 écarté pour une autre boutique |
| Articles imprimables (`READY_TO_SHIP` sans suivi) | **0** — aucun appel en écriture n'a donc été déclenché chez Jumia |
| Rendu des deux sections (donnée réelle en base) | « Disponible » + `JG-00D-…` + bouton de téléchargement ; « Erreur Jumia » + code et message exacts |
| Téléchargement du PDF | HTTP 200, `application/pdf`, `X-Content-SHA256`, octets identiques au document stocké |
| Étiquette hors périmètre | **404** (aucune fuite entre boutiques) |
| Redirections | `/commandes/factures` et `/commandes/a-traiter/factures` → **308** vers `/commandes/a-traiter/etiquettes` |

### Règles appliquées

1. Une étiquette n'est **disponible** qu'après décodage base64, vérification de la signature
   `%PDF-`, empreinte SHA-256 et persistance réussie.
2. Trois états **jamais fusionnés** : disponible, pas encore disponible, erreur Jumia. Chaque
   transition remplace le précédent : un article ne peut pas être à la fois disponible et en
   attente.
3. Jumia ne renvoyant pas d'identifiant de colis, la clé d'idempotence est construite par nous
   (SHA-256 de la boutique, de la commande et des articles **triés**) : relancer l'impression
   ne crée jamais deux étiquettes pour le même colis.
4. Une réponse **partielle** reste visible comme telle : les colis produits et les articles
   refusés sont conservés séparément, avec le motif exact renvoyé par Jumia.

### Tests

| Suite | Commande | Résultat |
| --- | --- | --- |
| Unitaires (clés, décodage PDF, contrat `print-labels`) | `npx vitest run src/lib/__tests__/shipment-labels.test.ts src/lib/__tests__/print-labels.test.ts` | **15 réussis** |
| Intégration (base réelle : idempotence, états, périmètre) | `npx vitest run src/lib/__tests__/shipment-labels.integration.test.ts` | **5 réussis** |
| Contrat Jumia réel (lecture seule, opt-in `JUMIA_LIVE=1`) | `npx vitest run src/lib/__tests__/jumia-live.test.ts` | **2 réussis** |
| Suite complète | `npm test` | **373 réussis / 7 ignorés** (55 fichiers passés, 3 ignorés) |
| Chaîne d'impression complète (serveur Jumia simulé) | `npx vitest run src/lib/__tests__/labels-print.e2e.test.ts` | **2 réussis** |
| End-to-end (suite entière) | `npx playwright test` | **79 réussis / 0 échec** |
| Statique | `npm run typecheck` · `npm run lint` | verts |

### Les deux points laissés ouverts — et leur résolution

| Point laissé ouvert | Résolution |
| --- | --- |
| **Suite E2E non rejouable** (Chromium exige `libnspr4.so`, non installable sans root) | **Réglé.** `scripts/install-chromium-deps.sh` récupère les paquets avec `apt-get download` (aucun privilège), les extrait dans `~/.local/chromium-deps`, et `playwright.config.ts` ajoute ce chemin au `LD_LIBRARY_PATH`. La suite complète **rejoue : 76 réussis / 0 échec** |
| **Impression réelle d'une étiquette** jamais déclenchée | **Diagnostic établi, pas un défaut.** La relecture complète des deux boutiques donne **337 articles**, dont **0 imprimable** : aucun n'est à l'état `READY_TO_SHIP`. Jumia refuse d'imprimer l'étiquette d'un colis déjà suivi ou dans un état terminal — l'appel aurait été refusé. La chaîne complète est en revanche **prouvée** de bout en bout par un serveur local rejouant le contrat officiel (voir ci-dessous) |

### Preuve de la chaîne d'impression

`src/lib/__tests__/labels-print.e2e.test.ts` fait tourner le **vrai** code de l'application
(client HTTP, lecture des articles, éligibilité, décodage base64, validation `%PDF-`, empreinte
SHA-256, persistance, relecture) contre un serveur local qui rejoue le contrat officiel de
`POST /orders/print-labels` — réponse **201**, `success.labels[]` avec le PDF en base64,
`error.orderItems[]` pour les refus.

Résultat : **1 colis produit, 1 article refusé, 0 en attente** ; le PDF relu est identique à
celui reçu ; le numéro de suivi est reporté sur l'article (qui n'est donc plus proposé à
l'impression) ; relancer l'opération **ne crée aucun doublon**. Aucun appel n'est fait chez
Jumia : aucun numéro de suivi n'est attribué sur un compte réel.

Pour permissive qu'ait été l'API, l'éligibilité reste stricte : seuls les articles
`READY_TO_SHIP` **sans** numéro de suivi sont proposés. Un compte dont tous les articles sont
livrés, expédiés, annulés ou échoués n'a donc rien à imprimer — c'est un **fait de la
donnée**, pas une limite du code.

### Outillage ajouté

| Outil | Rôle |
| --- | --- |
| `scripts/install-chromium-deps.sh` | installe les bibliothèques Chromium **sans root** (`npm run e2e:deps`) |
| `playwright.config.ts` | rend ces bibliothèques visibles à Playwright, automatiquement |
| `src/lib/__tests__/jumia-live.test.ts` | relecture du contrat `GET /orders/items` sur l'API réelle (opt-in `JUMIA_LIVE=1`) |
| `src/lib/__tests__/jumia-printable-items.live.test.ts` | compte les articles réellement imprimables (opt-in `JUMIA_LIVE=1`) |
| `src/lib/__tests__/labels-print.e2e.test.ts` | chaîne d'impression complète contre un serveur simulant Jumia |

`JUMIA_API_BASE` est désormais lu **à l'appel** (`jumiaApiBase()`) et non figé à l'import :
l'API peut être redirigée vers un serveur local sans redémarrer le processus.

---

## Vérification globale du 26/11/2026

Contrôle de bout en bout sur le **build de production**, après avoir démarré l'application
en `next start` (et non en développement) : routes, authentification, autorisations, API,
base, tests, build et parcours E2E.

### Ce qui a été contrôlé

| Domaine | Contrôle | Résultat |
| --- | --- | --- |
| Inventaire des routes | 46 pages et 62 routes API relevées dans les fichiers ; 111 routes au build (pages + API + techniques) | **réconciliation exacte** |
| Pages | balayage HTTP des 46 pages avec une session réelle | **46 / 46** répondent (200, 307 ou 308) |
| API | balayage HTTP des 62 routes API (GET et POST) | **62 / 62** répondent ; les 405 sont des méthodes non prévues, pas des pannes |
| Authentification | pages et API sans session | **307 vers `/login`** pour les pages, **401** pour les API |
| Redirections | `/commandes/factures` et `/commandes/a-traiter/factures` | **308** vers `/commandes/a-traiter/etiquettes` |
| Isolation | boutique d'un autre propriétaire (lecture, génération d'étiquettes) | **404** partout |
| Permissions | membre de rôle `stock` : `orders:read` oui, `orders:write` non | **403** avec le motif exact, pas de fuite de données |
| Santé | `/api/health` | `status: ok`, base et secrets détectés, migrations **ok** |
| Base | contraintes, index uniques, orphelins, doublons | **0 orphelin**, **0 doublon**, index uniques **effectifs** (doublon rejeté : `23505`) |
| Migrations | journal Drizzle ↔ base | **19 / 19** appliquées |
| Connexion Jumia réelle | validation des refresh tokens + synchronisation de commandes | **2 comptes valides**, synchronisation **ok** (27 commandes lues) |
| Génération d'étiquettes sur boutique réelle | `syncShopLabels` sur une boutique rattachée | **0 article éligible ⇒ 0 impression déclenchée**, 0 étiquette créée |
| Téléchargement PDF | étiquette éphémère, propriétaire puis utilisateur tiers | **200** `application/pdf`, SHA-256 conforme, disposition correcte ; **404** pour un tiers |
| Base après contrôle | nettoyage des données de test | **1 utilisateur, 2 boutiques, 320 commandes, 337 articles, 0 étiquette** |

### Défauts trouvés et corrigés

| Défaut | Gravité | Correction |
| --- | --- | --- |
| `/commandes/<identifiant non UUID>` renvoyait une **erreur 500** (erreur SQL `22P02` remontée à l'utilisateur) | réelle | `src/lib/ids.ts` : `isUuid()` ; la page et `getShopAccess()` traitent un identifiant malformé comme « introuvable » → **404** |
| Identifiant de boutique, de compte Jumia ou de membre malformé : même chemin d'erreur SQL | réelle | même garde-fou appliqué dans `permissions.ts`, `jumia/accounts.ts` et `shops.ts` |
| `upsertOrderItems` lisait les articles existants **une requête par commande** (320 requêtes pour une lecture complète) | performance | une seule requête large + filtrage du couple exact en mémoire : lecture live passée de **60 s à 14,8 s** |
| Dates de statut figées au 22/11/2026 dans la documentation | documentaire | documentation remise à jour au 26/11/2026 |

### Note sur le statut des migrations

`/api/health` publie le résultat des migrations de démarrage. Un `null` observé en cours de
manipulation venait du remplacement du dossier `.next` **sous un serveur déjà démarré** : le
bundle d'instrumentation charges en mémoire ne correspondait plus au bundle servi. Sur un
démarrage propre, `migrations.ok` vaut `true` et l'instrumentation journalise le résultat —
comportement attendu, pas un défaut de l'application.

### Résultat final

Typecheck, lint et build verts ; **373 tests réussis / 7 ignorés** ; **79 tests E2E réussis /
0 échec**. La connexion réelle à Jumia est opérationnelle, la chaîne d'impression est prouvée
de bout en bout, et **aucune impression n'a été déclenchée sur un compte vendeur réel**.

## Déploiement en production

Le lot (étiquettes + synchronisation automatique) a été **commité, poussé et déployé**.

| Élément | Valeur |
| --- | --- |
| Commit | `a4ae2a9` — `feat(ventes): étiquettes à imprimer + synchronisation automatique` |
| Branche distante | `main` = `a4ae2a9da9745af3c8faa682272fa3629761fe6d` |
| CI | run `45895601782` — **2 jobs verts** : `lint-test-build` (lint, typecheck, tests, build) et `e2e-smoke` (Chromium, parcours publics, accessibilité WCAG 2.1 AA) |
| Déploiement | run `45895777780` — **succès** : secret présent, déploiement Render déclenché, mise en ligne et `/api/health` vérifiés |
| Production | `https://tout-en-un-business-manager.onrender.com` — `/api/health` publie `commit: a4ae2a9da9745af3c8faa682272fa3629761fe6d`, `migrations.ok: true` |

### Contrôles effectués sur la production déployée

| Contrôle | Attendu | Constaté |
| --- | --- | --- |
| `/api/health` | commit `a4ae2a9` | **conforme** |
| `/commandes/a-traiter/etiquettes` | 200 | **200** — page « Étiquettes à imprimer », trois états (disponible / pas encore disponible / refus Jumia), filtre par boutique, composant d'auto-sync présent |
| `/commandes/a-traiter/factures` | 308 → `/etiquettes` | **308**, `location: /commandes/a-traiter/etiquettes` |
| `GET /api/shops/:id/auto-sync` | état de fraîcheur | `stale: true` sur les deux boutiques, verrou libéré |
| `POST /api/shops/:id/auto-sync` | `started: true` | **conforme**, puis cycle `périmé=true` → relecture → `lastSyncAt` mis à jour → `périmé=false` |
| Audit base | `shop.orders_auto_synced` puis `shop.orders_synced` | **présents** (21:10:18Z puis 21:10:19Z) |
| `GET /api/cron/sync` sans secret / faux secret / secret en query string | **401** | **401** dans les trois cas |
| `GET /api/cron/sync` avec `Authorization: Bearer <CRON_SECRET>` | 200 | **200** (`shops: 1`, `protected: true`) |
| Base après déploiement | 2 utilisateurs, 2 boutiques, 320 commandes, 337 articles, 0 étiquette, 2 comptes Jumia | **conforme** ; tables `order_items` et `shipment_labels` présentes (migration `0018` appliquée) |

### Note sur l'accès au dépôt

Le push s'est fait en SSH. L'identifiant `sergefabien56-eng` écrit en minuscules est **filtré par
le réseau du poste d'exécution** (`Repository not found` alors que le dépôt existe et est public) ;
la même clé fonctionne avec `Sergefabien56-Eng`. Le dépôt distant n'a pas été renommé : GitHub
lui-même répond `This repository moved. Please use the new location:
git@github.com:sergfabien56-eng/telegram-tout-en-un-.git` — c'est bien le dépôt d'origine. Si un
push futur échoue avec `Repository not found`, utiliser la variante capitalisée du nom de
propriétaire.

## Défaut corrigé : une commande « en attente » qui n'existait pas

**Signalement.** « Sur MaxiShops j'ai une commande en attente alors réellement je n'ai rien. »

### Ce que l'application affichait

Une seule commande, sur **MaxiShopsCI** : la commande `325542321` (créée le 06/11/2026),
2 articles, `packedItems = 1` sur 2, statut agrégé **« Multiple Status »**. Elle comptait
dans l'onglet « En attente » de « À traiter ».

### Ce que Jumia dit réellement

Trois lectures directes de l'API Vendor Center, sans interprétation :

| Lecture | Résultat |
| --- | --- |
| `GET /orders` (90 jours) | commande `325542321` présente, `status: "Multiple Status"`, `totalItems: 2`, `packedItems: 1`, `updatedAt: 2026-11-10T19:08:09Z` |
| `GET /orders/items` (articles) | article 1 `CANCELED` (`statusDetail: "Duplicated order"`), article 2 `DELIVERED` (suivi `DS-AAC-325542321-9031`, expédié le 07/11) |
| Base de l'application | **identique** : 1 article `CANCELED`, 1 article `DELIVERED` |

La donnée de l'application était donc **juste**. Ce n'était pas une synchronisation
manquante ni un statut périmé : la commande n'avait simplement **plus rien à préparer**
depuis le 07/11.

### Cause

La famille d'une commande était décidée à partir du **statut agrégé** et du compteur
`packedItems`. Pour une commande « Multiple Status », ce compteur compte les articles
emballés — y compris celui qui avait été annulé, et celui qui était déjà livré. Le
compteur indiquait « 1 sur 2 → préparation incomplète », et la commande partait donc
dans « En attente ».

Le statut global de Jumia ne dit rien de ce qu'il reste à faire. **Seuls les statuts
d'articles le disent** — et l'application les stocke déjà.

### Correctif

La famille d'une commande à statut agrégé inconnu est désormais décidée **article par
article** :

- au moins un article encore à préparer → « en attente » ;
- tous les articles restants `READY_TO_SHIP` → « prête à expédier » ;
- plus aucun article à préparer → la commande **sort de « À traiter »** et rejoint
  l'historique, classée d'après l'article le plus avancé (livrée, expédiée, échec de
  livraison, retour, annulée) ;
- sans information sur les articles → prudence : « en attente » (comportement inchangé).

La classification est écrite **une seule fois**, en SQL (`orderFamilySql()`), et le code
JS (`orderFamily()`) en est le miroir : les compteurs affichés et les listes ne peuvent
donc pas diverger. Un test d'intégration compare les deux sur la base réelle.

### Preuves

| Contrôle | Avant | Après |
| --- | --- | --- |
| MaxiShopsCI — « En attente » | **1** | **0** |
| MaxiShopsCI — « Livrées » | 127 | **128** (la commande `325542321` y rejoint) |
| NKSF SHOP — « En attente » / « Prêtes à expédier » | 0 / 0 | 0 / 0 |
| Commande `325542321` | classée « en attente » | classée **« livrées »** |
| Page « À traiter » (application locale, session réelle) | « En attente : 1 » | **« En attente : 0 »** |

Tests ajoutés : `order-status.test.ts` (19 tests, dont les 6 cas de la nouvelle règle),
`orders-workspace.integration.test.ts` (fixture multi-statuts réelle, régression
« ne présente pas en « à traiter » une commande dont tous les articles sont clos »).
Suite complète : **380 tests réussis / 7 ignorés** ; **79 tests E2E réussis / 0 échec** ;
typecheck, lint et build verts.

---

# Module « Notifications — commandes Jumia » — 27/11/2026

Lot livré : alertes de commandes **in-application** (web + Mini App Telegram),
avec préparation des articles et demande de passage « Prêtes à expédier »
sans ouvrir Vendor Center. Détail complet : `docs/notifications-commandes-jumia.md`.

## Périmètre tenu

- **In-application uniquement** : aucun message Telegram, e-mail ou push. Les
  helpers capables d'envoyer un Telegram direct (`src/lib/telegram-service.ts`,
  `src/lib/coherence-alerts.ts`) ne sont pas utilisés par ce module.
- **La synchronisation continue en arrière-plan** : la tâche planifiée
  (`POST /api/cron/sync`, toutes les 3 h) et le polling à l'écran n'ont pas
  changé. Les alertes sont recalculées à la fin de chaque relecture, donc
  elles existent même si le vendeur n'a pas ouvert l'application.
- **Le seuil de 24 h est préventif**, jamais une heure d'annulation : le texte
  des alertes le dit explicitement, et le seuil est configurable par boutique.

## Base de données

Migration `0019_order_alerts` :

- `order_alerts` — une alerte active par commande (clé unique
  `dedupe_key = boutique:commande`), avec priorité, contenu, résolution ;
- `order_alert_reads` — lecture **personnelle** (clé primaire composite) ;
- `orders.first_seen_at` — heure de première réception par l'application,
  `null` pour les commandes antérieures à la colonne (leur date de réception
  n'est pas connue : la date du jour serait un faux).

Aucune donnée n'est inventée : les commandes de test sont supprimées, les
alertes ne portent que des faits lisibles en base.

## Tests — ce qui est testé

| Scénario exigé | Couverture |
| --- | --- |
| Nouvelle commande, application ouverte | E2E (`alertes-commandes.spec.ts`) + intégration |
| Arrivée pendant l'absence, rattrapée à la réouverture | E2E (alerte **non vue** présentée) + intégration (lecture personnelle : un utilisateur qui a vu n'a pas signalé l'autre) |
| Alerte avant / après 24 h | Unitaire (18 tests), intégration, E2E |
| Renforcement de l'alerte (escalade) | Unitaire + intégration + E2E (priorité `critical`, alerte réveillée) |
| Changement de statut de la commande | Intégration + E2E (alerte résolue avec sa raison) |
| Absence de doublons | Intégration (réconciliation rejouée 3×) + E2E (une seule alerte) |
| Synchronisation en panne | Intégration + E2E (alerte `synchronisation`, résolue au retour) |
| Statuts d'articles mixtes | Intégration (article livré + annulé → aucune alerte) + E2E (1 `PENDING` + 1 `DELIVERED` → 1 article à préparer) |
| Utilisateur non autorisé | E2E : rôle `stock` → **403** sur l'action de préparation ; `owner` → le contrôle des articles prend le relais (400) |
| Succès / refus / réponse partielle Jumia | Unitaire (`jumia-order-preparation.test.ts`, 7 tests) : succès complet, réussite partielle (article par article), refus complet, enveloppe vide, refus global |
| Décodage réel des transporteurs Jumia | Sonde **lecture seule** exécutée sur l'API réelle (HTTP 200, format conforme) |

Résultats : **414 tests unitaires + intégration réussis / 7 ignorés** (61
fichiers) · **88 tests E2E réussis / 0 échec** · typecheck, lint et build
verts.

## Mise en production

Commits `011ace1` (module) et `2ac75e7` (correction de la résolution), poussés
sur `main`. CI verte, workflow « Déploiement Render » vert.

Contrôles sur `https://tout-en-un-business-manager.onrender.com` :

| Contrôle | Résultat |
| --- | --- |
| `/api/health` | HTTP 200, `commit: 2ac75e7c17fdd19dac3a13a1dafe89d2a64a029f` |
| Migration `0019` | appliquée au démarrage du service (`migrations.ok = true`) |
| `GET /api/order-alerts` (session réelle) | HTTP 200 — **0 alerte**, 0 non vue, 2 boutiques au périmètre |
| `GET /alertes` | HTTP 200 — section « Commandes Jumia » et réglage du seuil présents |
| `GET /commandes/<commande réelle>` | HTTP 200 — section « Préparation » présente, mention « Prêt à expédier n'est pas expédié » |
| `GET /api/orders/<commande réelle>/preparation` | HTTP 200 — famille `pretes-a-expedier`, article `Prête à expédier` avec son **vrai** numéro de suivi, aucun transporteur proposé (aucun article à emballer) |

Les **0 alerte** en production sont le résultat correct : sur les données
réelles, aucune commande n'attend sa préparation (la commande du jour est
déjà `READY_TO_SHIP`, la commande à statuts multiples est close). Le module
ne fabrique donc aucune alerte.

## Ce qui n'est **pas** testé

- **Les appels en écriture chez Jumia** (`POST /orders/pack`,
  `POST /orders/ready-to-ship`) n'ont **pas** été exécutés en conditions
  réelles : aucune commande Jumia réelle n'était dans un état « à préparer »,
  et modifier une commande réelle d'un client n'a pas étéjugé acceptable sans
  demande explicite. Leur comportement est couvert par :
  - le décodage des réponses (tests unitaires, enveloppes conformes à la
    documentation officielle) ;
  - le contrat de la spec Vendor Center (`orderItemIds` / `orderItems`,
    réponses 201 avec succès **et** erreurs par article, rôle **VC - Order
    Manager**) ;
  - une lecture réelle de `GET /orders/shipment-providers` (HTTP 200), qui
    confirme le format réel des transporteurs ;
  - le contrôle des droits et des articles côté serveur, testé en E2E.
- **Le délai de préparation officiel par boutique et par processus** : l'API
  Vendor Center n'expose aucun endpoint de délai (liste complète des chemins
  de la spec OpenAPI vérifiée). Le seuil est donc une règle saisie par le
  vendeur, réglable par boutique, avec 24 h par défaut — jamais une valeur
  inventée par l'application.
- **La notification Telegram hors application** : hors périmètre, et
  volontairement absente.
## Test réel sur une commande Jumia genuine — 27/11/2026

Une **vraie** commande est arrivée chez MaxiShopsCI pendant la livraison :
commande **385851761** (`c3e3f87c-5d61-4975-a504-b16fcc5dfb16`), créée chez
Jumia le 27/11 à 18:54:03, 1 article (`b2b38de5-108f-43ee-8220-0874db3b2d99`,
SKU `VBR1`), 4 169 XOF, retrait point relais Yopougon. Le module a été
exercé **de bout en bout** sur elle, via l'API de production.

| Étape | Résultat réel |
| --- | --- |
| Synchronisation automatique | Commande détectée à 18:55:12, **69 s** après sa création chez Jumia |
| Alerte créée | `nouvelle_commande` / `info`, **sans intervention** (voir le texte ci-dessous) |
| `GET /api/orders/<id>/preparation` | 200 — famille `en-attente`, 1 article à emballer, Jumia propose **1 seul** transporteur : `CI-VDO-Own-Yop-Station` |
| `POST {action: "pack"}` | **200** — Jumia crée le colis : vrai numéro de suivi `DS-FAJ-385851761-8118` |
| Alerte après `pack` | **Résolue automatiquement** : « La commande est préparée : elle n'attend plus d'action. » |
| `POST {action: "ready_to_ship"}` | **200** — confirmation de Jumia, article passé à `READY_TO_SHIP` |
| Contrôle direct `GET /orders/items` | `status: READY_TO_SHIP`, `trackingNumber: DS-FAJ-385851761-8118`, **`shippedDate: null`** |

Le dernier point est la preuve que « Prêt à expédier » n'est **pas**
« expédié » : la commande est prête à partir, le transporteur ne l'a pas
encore prise en charge.

### Défaut trouvé et corrigé par ce test réel

Après l'emballage, Jumia **laisse l'article en `PENDING`** : seul le numéro
de suivi atteste que le colis est créé. Le module proposait donc encore cet
article comme « à préparer » — une seconde préparation aurait été refusée
par Jumia (« article déjà emballé »).

Corrigé : un article qui porte un numéro de suivi est considéré comme
**emballé**, il n'est plus proposé à l'emballage ; il reste sélectionnable
pour le passage « prête à expédier ». Tests ajoutés :
`order-preparation.test.ts` (7 tests, dont le cas réel) et un scénario E2E
« un article déjà emballé n'est pas proposé à l'emballage ».

### Textes produits par le module (commande réelle 385851761)

**1. Alerte « nouvelle commande »** — créée automatiquement par la
synchronisation, 69 s après la commande :

> **Nouvelle commande reçue — 385851761**
>
> Boutique MaxiShopsCI. Commande 385851761, reçue le 27/11 18:55 : elle attend
> sa préparation depuis 1 min. Le seuil préventif est de 24 h : il permet de
> traiter les commandes les plus anciennes en premier. Ce seuil est un repère
> de priorisation, pas une annulation automatique.

**2. Résolution automatique** — après la préparation confirmée par Jumia :

> La commande est préparée : elle n'attend plus d'action.

**3. Résultat par article** — après `pack` puis « prête à expédier » :

> `b2b38de5-108f-43ee-8220-0874db3b2d99` — accepté par Jumia (suivi
> `DS-FAJ-385851761-8118`)

## Étiquettes d'expédition — défaut de sélection corrigé (27/11/2026)

**Symptôme** : la page « Étiquettes à imprimer » ne montrait jamais rien —
« Articles à imprimer : 0 », aucune étiquette disponible, aucune étiquette
en attente. La table `shipment_labels` était vide.

**Cause** : le filtre d'éligibilité exigeait `READY_TO_SHIP` **et**
l'absence de numéro de suivi. Cette condition ne peut **jamais** être
satisfaite : Jumia n/met un article en `READY_TO_SHIP` qu'après son
emballage, donc il a forcément déjà un numéro de suivi. Résultat : aucun
article sélectionnable, donc aucun appel `POST /orders/print-labels`, donc
aucune étiquette — le module n'avait jamais pu fonctionner.

La règle réelle de l'API Vendor Center (`orders@print-labels`) est plus
simple : Jumia refuse un article **annulé, expédié ou livré**, pas un
article déjà suivi. La sélection locale est désormais :

1. statut livrable : `PENDING` ou `READY_TO_SHIP` ;
2. aucune étiquette déjà obtenue pour cet article (les refus restent
   ré-essayables).

**Preuve réelle** — deux étiquettes obtenues de Jumia pour MaxiShopsCI :

| Commande | Article | Suivi | PDF stocké | Empreinte |
| --- | --- | --- | --- | --- |
| 358145761 | `9328395e-6c6d-4a15-a1b9-9b4fc91b3f00` | `DS-EAH-358145761-4492` | 49 571 octets, en-tête `%PDF-` | SHA-256 `78db778a6a535390…` |
| 385851761 | `b2b38de5-108f-43ee-8220-0874db3b2d99` | `DS-FAJ-385851761-8118` | 49 173 octets, en-tête `%PDF-` | SHA-256 `d46b7725475d4a04…` |

Le PDF n'est enregistré comme *disponible* qu'après décodage base64,
vérification de l'en-tête `%PDF-` et calcul de son empreinte SHA-256. Le
numéro de suivi du colis est reporté sur l'article, qui n'est alors plus
proposé à l'impression : **un colis n'est jamais réimprimé chez Jumia**.

Tests : `labels-print.e2e.test.ts` (chaîne complète sur serveur Jumia
simulé, y compris l'absence de doublon), `labels-real-shop.test.ts` (sur
boutique réelle : après l'opération plus aucun article n'est éligible, et
une seconde passe ne crée aucune étiquette), `shipment-labels.*`
(5 + 10 tests).
