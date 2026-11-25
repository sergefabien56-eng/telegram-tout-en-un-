# État de livraison — 25/11/2026

## Ce qui est livré et en production

| Lot                           | Commit    | CI    | Déploiement |
| ----------------------------- | --------- | ----- | ----------- |
| Publication de produits Jumia | `9f00e56` | verte | ✅          |
| Boutiques & Plateformes       | `4256bc2` | verte | ✅          |
| Déploiement adossé au commit  | `c0fdb04` | verte | ✅          |
| Documentation du déploiement  | `be50093` | verte | ✅          |

Production : `https://tout-en-un-business-manager.onrender.com` — `/api/health` répond
`{"status":"ok"}` et publie le commit réellement déployé (`commit`).

## Ordre de publication retenu

« Publication de produits Jumia » **puis** « Boutiques & Plateformes » : la nouvelle navigation
pointe vers `/boutiques/produits/nouveau`, qui n'existait qu'à partir du premier lot.

## Tests

| Suite                      | Commande                             | Résultat                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------- |
| Unitaires + intégration    | `npm test`                           | **329 réussis / 2 ignorés** (49 fichiers) |
| End-to-end (suite entière) | `npx playwright test`                | **76 réussis / 0 échec**                  |
| Statique                   | `npm run typecheck` · `npm run lint` | verts                                     |

Répartition E2E : `e2e/boutiques-platesformes.spec.ts` (2 scénarios de navigation/cartes) ·
`e2e/publication-produit-jumia.spec.ts` (3 scénarios de publication).

## Base de données

Migrations `0016` (suivi des publications) et `0017` (référentiel catégories) appliquées en
production. `product_publications` contient **0 ligne** : aucun produit n'a été envoyé à Jumia,
aucun quota d'écriture n'a été consommé.

## Point d'attention résolu

Le workflow de déploiement déclarait « succès » en quelques secondes : l'ancienne instance Render
continuait de répondre pendant que le nouveau build se compilait (constaté : `/boutiques/ajouter`
renvoyait 404). La vérification est désormais adossée au commit déployé — voir `docs/deploiement.md`
§ 2ter.

## Reste à faire, le cas échéant

- Envoyer un **vrai** produit à Jumia à la main (quota + secrets) : jamais fait automatiquement.
- Synchronisation réelle des commandes sur les deux boutiques : jamais exécutée automatiquement.
- La sauvegarde Google Drive reste bloquée par une limitation de débit de l'API ; la sauvegarde
  locale `backups/backup-2026-11-25-13-59-07.sql.gz` est disponible.
