# Accès API Jumia — pas à pas (Self Authorization)

- **Date** : 22/11/2026 · **Coût** : 0 FCFA (l'API Vendor Center est gratuite)
- **Source** : documentation officielle [Vendor API (GPM/GOP)](https://vendorcenter.jumia.com/api-docs/), versions 8.0 (11/08/2026) et 9.0 (16/09/2026)
- **Objectif** : obtenir un _refresh token_ qui permet à l'ERP d'appeler les API Jumia **sans personne devant l'écran**.

---

## 1. Le bon type d'application : Self Authorization

Deux types existent, et le choix est **définitif** (non modifiable après création) :

|                        | **Self Authorization** ✅ (notre cas)          | Web Application                             |
| ---------------------- | ---------------------------------------------- | ------------------------------------------- |
| Usage                  | ERP, script, tâche planifiée, **aucun humain** | application avec écran de connexion         |
| Informations à fournir | un nom                                         | un nom **et** une Redirect URI              |
| Reçu                   | Client Id + Refresh Token                      | Client Id + Client Secret + Redirect URI    |
| `grant_type`           | `refresh_token`                                | `authorization_code`                        |
| Renouvellement         | automatique, sans humains                      | **reconnexion humaine à chaque expiration** |

> Un ERP doit impérativement choisir **Self Authorization** : avec « Web Application »,
> l'intégration s'arrête dès que le _access token_ expire, jusqu'à ce qu'une
> personne se reconnecte.

## 2. Créer l'application (5 minutes)

1. Ouvrir **[https://vendorcenter.jumia.com/](https://vendorcenter.jumia.com/)** (ou
   `vendorcenter-staging.jumia.com` pour tester d'abord) et se connecter avec le
   compte vendeur.
2. Cliquer sur **Settings**.
3. Ouvrir **Applications** → écran _Manage Applications_.
4. Cliquer **Create Application**.
5. Choisir le type **Self Authorization**, saisir un nom parlant :
   `TOUT EN UN Business Manager`.
6. Valider. Il n'y a **ni Redirect URI ni Client Secret** à conserver.

## 3. Générer le refresh token

1. Sur _Manage Applications_, ligne de l'application → colonne **Actions** → icône **Generate Token**.
2. Copier le **Refresh Token** affiché et le stocker en lieu sûr (c'est le secret
   qui donne accès au compte — hors dépôt, hors capture d'écran partagée).

## 4. Échange contre un access token

```bash
curl -i -X POST 'https://vendor-api.jumia.com/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode 'client_id=<votre-client-id>' \
  --data-urlencode 'refresh_token=<votre-refresh-token>'
```

Réponse (extrait) :

```json
{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid email profile offline_access",
  "id_token": "…",
  "refresh_token": "NOUVEAU refresh token",
  "refresh_expires_in": 7776000
}
```

Appels API : `Authorization: Bearer <access_token>`.

### Règles à respecter (issues de la doc officielle)

1. **Le refresh token tourne** : chaque appel renvoie un **nouveau** `refresh_token`
   qui remplace l'ancien. Il faut donc le **ré-écrire à chaque rafraîchissement**,
   sinon il finit par expirer et l'intégration cesse de s'authentifier.
2. **Ne pas coder de durées en dur** : lire `expires_in` (et `refresh_expires_in`)
   dans la réponse. Elles sont configurables et ont déjà changé.
3. **Pas de `client_secret`** pour ce type d'application (il n'existe pas).
4. **Erreurs OAuth** : `{ "error", "error_description" }` (pas le format des endpoints
   GPM/GOP). `400 unauthorized_client` = mauvais `grant_type` ; `400 invalid_grant` =
   refresh token expiré ou déjà remplacé.
5. **Une seule session par navigateur** : se connecter à Vendor Center en tant
   qu'un autre utilisateur invalide les jetons en cours.
6. **Limites de débit** : 200 requêtes/minute et 4 requêtes/seconde, **par mastershop**
   (donc partagées entre toutes nos boutiques) → backoff et respect de `Retry-After`.

## 4bis. Où coller les valeurs (recommandé : Render, pas moi)

Les deux valeurs sont **des secrets** : elles donnent accès au compte vendeur.
Elles ne doivent ni dans le dépôt, ni m'être affichées.

1. Ouvrir **https://dashboard.render.com/web/srv-dc1m8rqfngtc7381n0rg/env**
2. **Add Environment Variable** → `JUMIA_CLIENT_ID` = la valeur affichée dans Vendor Center.
3. **Add Environment Variable** → `JUMIA_REFRESH_TOKEN` = le jeton généré.
4. **Save Changes** : le service redémarre.

Ensuite, dans l'application : **Santé → « Tester la connexion Jumia »**. Le serveur
échange le refresh token, **ré-écrit automatiquement le nouveau jeton en base
(chiffré AES-256-GCM)** et affiche la durée de validité. Je n'ai jamais besoin de
connaître ces valeurs.

> Si vous aviez généré un token il y a longtemps sans l'avoir utilisé depuis :
> un autre utilisateur connecté à Vendor Center invalide les jetons en cours, et
> chaque utilisation en remplace le précédent. Le plus sûr est de cliquer une
> dernière fois sur **Generate Token** et d'utiliser ce jeton tout neuf.

## 5. Qu'est-ce qu'il faut me fournir

Deux valeurs, **à ne jamais coller dans le dépôt** :

| Valeur          | Où la coller                                                                |
| --------------- | --------------------------------------------------------------------------- |
| `client_id`     | secret GitHub `JUMIA_CLIENT_ID` + variable Render `JUMIA_CLIENT_ID`         |
| `refresh_token` | secret GitHub `JUMIA_REFRESH_TOKEN` + variable Render `JUMIA_REFRESH_TOKEN` |

Une fois ces deux valeurs en place, je branche : client HTTP `src/lib/jumia/` (rotation
du refresh token, backoff, cache du access token), table des boutiques distantes, puis
les premiers appels `GET /shops` et `GET /orders`.

> Alternative : si vous préférez générer le token vous-même d'abord, la commande
> `curl` du §4 suffit — le résultat reste volatile, ne le conservez pas.

## 5bis. Vérification en conditions réelles (24/11/2026)

Application **`TOUT EN UN ERP`** (Self Authorization, client
`a3ec005d-43c1-4006-acf8-0e6d16ca0955`). Test lancé depuis l'application
(propriétaire temporaire) :

```
authenticated   : true
source          : base            (jeton relu et re-écrit en base chiffrée)
expires_in      : 86399 s         (access token, 24 h)
refresh_expires : 31535074 s      (~365 j)
shopsStatus     : 200
boutiques       : 1 — « NKSF Shop (CI) »
```

Deux points à retenir :

1. **Un second outil branché sur la même application invalide le jeton** :
   chaque rafraîchissement remplace le refresh token. C'est ce qui a rendu
   inutilisables les deux premiers jetons. Une application par consommateur.
2. `GET /shops` renvoie un **tableau** (pas `{shops: []}`), avec
   `id`, `name`, `email`, `businessClients[].countryCode`.

## 6. Points à vérifier avant d'aller plus loin (honnêtement)

- **Disponibilité CI** : la Côte d'Ivoire a un portail vendeur (`vendorhub.jumia.ci`).
  Vendor Center est multi-pays ; si votre compte CI n'a pas encore d'accès Vendor
  Center, il faut le demander à votre _account manager_.
- **Boutiques rattachées** : toutes nos boutiques doivent être dans le **même
  mastershop** (même adresse e-mail de création). Sinon, contacter l'_account manager_
  pour le rattachement ; les boutiques orphelines resteront hors synchronisation.
- **API de secours** : si une boutique n'est pas en Vendor Center, l'API **Seller Center**
  (par boutique, signature HMAC) peut la reprendre — voir `jumia-integration.md` §1.1.

## 7. Sources

1. [Vendor API — GPM & GOP (documentation officielle)](https://vendorcenter.jumia.com/api-docs/) — étapes 1 à 5, rotation du refresh token, limites.
2. [n8n-nodes-jumia-vendor](https://github.com/buildsbycarl/n8n-nodes-jumia-vendor) — implémentation tierce confirmant `POST /token` et la rotation.
