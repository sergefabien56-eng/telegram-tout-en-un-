# Boutiques, rôles & permissions — Phase 1 · Lot 5

> État : **livré et prouvé** (API 12/12, tests d'intégration 11/11 sur la base réelle).

## 1. Rôles

| Rôle | Permissions |
|---|---|
| `owner` | **tout** (propriétaire, non révocable) |
| `manager` | boutiques, commandes, produits, stocks, finances (lecture), rapports, membres |
| `stock` | commandes (lecture), produits (lecture), stocks (lecture + écriture) |
| `accountant` | commandes (lecture), finances (lecture + écriture), rapports |
| `assistant` | commandes (lecture), stocks (lecture) |

Convention : `module:action`. Vérifié **côté serveur** à chaque appel (`getShopAccess`).

## 2. API

| Méthode | Route | Permission |
|---|---|---|
| GET | `/api/shops` | — (boutiques de l'utilisateur) |
| POST | `/api/shops` | — (crée + devient `owner`) |
| GET | `/api/shops/:id` | accès membre |
| PATCH | `/api/shops/:id` | `shops:write` |
| POST | `/api/shops/:id/disconnect` | `shops:write` |
| GET | `/api/shops/:id/members` | `members:read` |
| POST | `/api/shops/:id/members` | `members:write` |
| PATCH | `/api/shops/:id/members/:userId` | `members:write` |
| DELETE | `/api/shops/:id/members/:userId` | `members:write` |
| GET | `/api/shops/:id/invites` | accès membre |
| POST | `/api/shop-invites/accept` | authentifié |

## 3. Règles métier

- **Création** : transaction — la boutique est créée et le créateur reçoit `owner`.
- **Invitation par e-mail** :
  - compte existant → ajout **immédiat** ;
  - compte inconnu → **invitation en attente** (7 jours), acceptable à la connexion.
- **Invariants** : impossible de retirer ou rétrograder le `owner` ; impossible de s'auto-retirer.
- **Doublon** : unicité `(platform, externalShopId)`.
- **Audit** : `shop.created`, `shop.updated`, `shop.disconnected`, `shop.member_invited`,
  `shop.member_removed`, `shop.member_role_changed`.

## 4. Preuves

```
node scripts/shops-smoke.mjs http://localhost:3000
=== RÉSULTAT : 12 OK / 0 ÉCHEC ===
```
Couvert : création, listing, rôle owner, refus d'accès à un non-membre,
invitation (ajout immédiat), liste des membres, **refus d'écriture pour un rôle assistant**,
déconnexion.

Tests d'intégration : `src/lib/__tests__/shops-integration.test.ts` (11 tests, base réelle).
Tests unitaires : `src/lib/__tests__/permissions.test.ts`.

## 5. Interface

Page **`/boutiques`** : liste des boutiques, création, équipe, invitation, retrait.
Navigation mise à jour (tableau de bord → « Connecter une boutique »).

## 6. Limites connues (honnête)

- **Aucune synchronisation Jumia** encore : une boutique est créée `pending`, sans données
  (pas de fausses données). La connexion API Jumia arrive avec l'intégration (Lot 6+).
- **Invitation sans e-mail** : une invitation en attente n'est pas notifiée par e-mail
  (service d'e-mail non configuré) ; elle apparaît dans l'espace du membre à sa connexion.
- **Changement de rôle** : seulement par le propriétaire / manager (pas d'interface de changement
  de rôle dans cette version, l'API est prête).
