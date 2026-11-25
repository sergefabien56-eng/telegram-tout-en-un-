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
