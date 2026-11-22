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

Le build : `npm install && npm run build` ; le démarrage : `npm run start`.
HealthCheck : `/api/health` (doit répondre `{"status":"ok",...}`).

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
```

## 6. Coûts

- Render Free : **0 FCFA** (veille automatique, pas de carte).
- Neon Free : **0 FCFA** (1 Go, 6 h PITR).
- Telegram : **0 FCFA**.
- Aucun domaine payant (sous-domaine `onrender.com` offert).

## 7. Pourquoi le webhook ne marchait pas en local

Telegram exige une URL **HTTPS publique**. L'aperçu Arena (`*.e2b.app`) est derrière une garde
d'origine (403 pour Telegram) → impossible. D'où le déploiement.
