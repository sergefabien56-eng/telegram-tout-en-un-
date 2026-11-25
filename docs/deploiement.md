# Déploiement — Phase 1 · Lot 8 (gratuit)

> Objectif : une URL **HTTPS publique** pour (1) le web, (2) la Mini App, (3) le webhook Telegram.
> Budget : **0 FCFA**.

## 1. Choisir l'hébergeur

| Option | Gratuit ? | Remarque |
|---|---|---|
| **Render** (recommandé) | ✅ plan Free | Next.js natif, veille après 15 min d'inactivité |
| Netlify | ✅ | possible, builder Next.js |
| Vercel Hobby | ⚠️ | **non commercial uniquement** → exclu ici |
| Railway / Render Postgres | ❌ payant | on utilise **Neon** pour la base |

La base reste **Neon** (déjà configurée) : aucune base payante.

## 2. Déploiement Render en 1 clic

1. Ouvre : **https://render.com/deploy?repo=https://github.com/sergefabien56-eng/telegram-tout-en-un-**
2. Crée un compte Render (gratuit, e-mail).
3. Render détecte `render.yaml` → vérifie le plan **Free**.
4. Renseigne les variables (voir §3) — celles marquées `sync: false`.
5. Clique **Deploy**.

Le build : `npm install --include=dev && npm run build` ; le démarrage : `npm run start`.
HealthCheck : `/api/health` (doit répondre `{"status":"ok",...}`).

> ⚠️ **`NODE_ENV=production` casse le build.** Render pose `NODE_ENV=production` au runtime, mais s'il
> est aussi présent dans les variables, `npm install` omet les `devDependencies` (Tailwind,
> TypeScript…) → `Module not found`. C'est pour ça que le buildCommand force `--include=dev` et que
> `NODE_ENV` n'est **jamais** déclaré dans les variables d'environnement.
>
> ⚠️ **Un service piloté par blueprint** (`render.yaml` sur GitHub) **ignore les modifications
> faites via le tableau de bord ou l'API**. Il faut pousser le YAML à jour. Pour piloter autrement :
> `render.yaml` est la source de vérité, l'API sert de filet de sécurité (et le PATCH doit viser
> `serviceDetails.envSpecificDetails.buildCommand`, pas la racine).

### Déploiement piloté par l'API (optionnel)

```bash
RENDER_API_KEY=xxx node scripts/render-deploy.mjs
```

Le script : retrouve le service → corrige le `buildCommand` → synchronise les 9 variables →
déploiement avec purge du cache → attend `live` → vérifie `/api/health`.

## 2bis. Déploiement automatique à chaque push (CI verte)

Le workflow `.github/workflows/deploy.yml` déploie **uniquement si la CI réussit**
(lint + typecheck + tests unitaires + build + tests E2E). Rien n'est donc mis en production sur un
commit rouge.

**Une seule action manuelle est nécessaire** : créer un secret GitHub.

1. Render → https://dashboard.render.com/web/srv-dc1m8rqfngtc7381n0rg → onglet **Settings** →
   descendre jusqu'à **Deploy Hook** → copier l'URL
   (de la forme `https://api.render.com/deploy/srv-dc1m8rqfngtc7381n0rg/xxxxxxxx`).
2. GitHub → dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :
   - Name : `RENDER_DEPLOY_HOOK`
   - Secret : l'URL copiée

C'est tout. Le hook est une permission **minimale** : il ne sert qu'à déclencher UN déploiement, et
il se régénère dans le même écran si tu soupçonnes une fuite.

**Alternative** (si le hook n'est pas disponible) : créer aussi `RENDER_API_KEY`
(Render → Account Settings → API Keys → Create API Key, préfixe `rnd_`) et `RENDER_SERVICE_ID`
(vaut `srv-dc1m8rqfngtc7381n0rg`). Le workflow utilise alors l'API avec attente du statut `live`.

Vérifier que ça a marché : onglet **Actions** du dépôt → workflow « Déploiement Render ».
Échec fréquent : secret absent → le job affiche explicitement l'URL où le créer.

### 2ter. Ce que « déploiement réussi » veut dire (et ne veut pas dire)

Pendant un déploiement, **l'ancienne instance Render continue de répondre** : un simple
`/api/health` qui renvoie `{"status":"ok"}` ne prouve donc *rien* — il peut s'agir de l'ancien
code, encore en ligne, pendant que le nouveau build se compile. Constaté le 25/11/2026 : le
workflow déclarait « succès » en 7 secondes alors que `/boutiques/ajouter` renvoyait encore 404
sur l'ancienne instance.

La vérification est donc **adossée au commit** :

- `/api/health` publie le commit réellement déployé (`RENDER_GIT_COMMIT`, fourni par Render) ;
- le workflow attend que l'instance en ligne serve **le commit attendu** (celui de la CI verte) ;
- si un push plus récent a déjà été déployé entre-temps, le commit en ligne est accepté s'il est
  **postérieur** à l'attendu (vérifié via l'API `compare` de GitHub) ;
- si le commit n'est pas communiqué, le workflow retombe sur l'ancien contrôle et **le dit**
  dans le journal.

Conséquence pratique : un « Déploiement Render » vert signifie « le **nouveau** code est en
ligne », et non plus « une instance répond ».

## 3. Variables d'environnement de production

| Variable | Où la trouver |
|---|---|
| `DATABASE_URL` | Neon → ton projet → **Connection string** (poolé) |
| `DATABASE_URL_UNPOOLED` | idem, option **Unpooled** (pour les migrations) |
| `TELEGRAM_BOT_TOKEN` | @BotFather (déjà créé) |
| `TELEGRAM_WEBHOOK_SECRET` | généré (64 caractères) |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | l'URL Render, ex. `https://tout-en-un-business-manager.onrender.com` |

## 4. Après le déploiement

```bash
# 1. Appliquer les migrations sur la base de production
#    (depuis un poste avec DATABASE_URL_UNPOOLED)
npm run db:migrate

# 2. Configurer le webhook Telegram
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
APP_URL=https://TON-URL.onrender.com node scripts/telegram-setup.mjs

# 3. Mini App
#    @BotFather -> /mybots -> ton bot -> Bot Settings -> Configure Mini App
#    URL : https://TON-URL.onrender.com/mini-app
```

## 5. Vérifications

```
curl https://TON-URL.onrender.com/api/health
curl -X POST https://TON-URL.onrender.com/api/telegram/webhook   # doit renvoyer 401 (secret manquant)
node scripts/shops-smoke.mjs https://TON-URL.onrender.com        # 12 OK / 0 ÉCHEC
```

### État du déploiement (2026-11-22, 22:45)

| Élément | Valeur |
|---|---|
| URL de production | **https://tout-en-un-business-manager.onrender.com** |
| Service Render | `srv-dc1m8rqfngtc7381n0rg`, plan **Free**, région **frankfurt** |
| Tableau de bord | https://dashboard.render.com/web/srv-dc1m8rqfngtc7381n0rg |
| Base de données | Neon, branche `production` (14 tables) |
| Webhook Telegram | actif → `…/api/telegram/webhook` (secret vérifié, 401 sans) |
| Pages vérifiées | `/` `/register` `/login` `/boutiques` `/mini-app` → 200 |
| API boutiques | 12/12 OK en production |
| `config` du healthcheck | `database` ✅ `encryptionKey` ✅ `sessionSecret` ✅ `telegramBotToken` ✅ `telegramWebhookSecret` ✅ · `storage` ❌ `aiKey` ❌ (non configurés) |

**Limites du plan Free** : l'instance se met en veille après ~15 min d'inactivité (premier accès
lent, ~30-60 s). Aucune carte bancaire, aucune facturation.

> ⚠️ **Auto-déploiement** : le service est en `autoDeploy: yes` (trigger `commit`), mais les
> commits poussés sur `main` **n'ont pas déclenché de déploiement** (constaté les 22 et 23/11).
> Après chaque push, **vérifie** dans le tableau de bord Render et, si rien ne démarre,
> déclenche un déploiement manuellement (bouton **Manual Deploy** → **Deploy latest commit**,
> ou `POST /v1/services/{id}/deploys`). C'est le point à corriger pour rendre le CI/CD réel.

## 6. Coûts

- Render Free : **0 FCFA** (veille automatique, pas de carte).
- Neon Free : **0 FCFA** (1 Go, 6 h PITR).
- Telegram : **0 FCFA**.
- Aucun domaine payant (sous-domaine `onrender.com` offert).

## 7. Pourquoi le webhook ne marchait pas en local

Telegram exige une URL **HTTPS publique**. L'aperçu Arena (`*.e2b.app`) est derrière une garde
d'origine (403 pour Telegram) → impossible. D'où le déploiement.

## Migrations appliquées automatiquement

Au démarrage du serveur, l'application applique les migrations Drizzle en
attente (`src/instrumentation.ts` → `src/lib/db-migrate.ts`). Un déploiement ne
peut donc jamais laisser la base en retard sur le code (colonne manquante →
écran en erreur).

- La migration est **idempotente** : Drizzle n'applique que ce qui manque.
- En cas d'échec, l'application démarre quand même et `/api/health` publie le
  résultat (`migrations: { ok, applied, error }`) : rien n'est caché.
- La commande manuelle reste disponible : `npm run db:migrate`.
