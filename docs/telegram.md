# Bot Telegram & Mini App — Phase 1 · Lot 4

> État : **livré et prouvé** (webhook 8/8, liaison réelle vérifiée en base, tests unitaires + intégration).
> Conception : [telegram-integration.md](telegram-integration.md).

## 1. Ce qui est implémenté

| Brique | Détail |
|---|---|
| Webhook | `POST /api/telegram/webhook` — vérifie l'en-tête `X-Telegram-Bot-Api-Secret-Token` |
| Commandes | `/start`, `/lier CODE`, `/tableau`, `/boutiques`, `/commandes`, `/stocks`, `/finance`, `/notifications`, `/mimi`, `/aide` |
| Liaison de compte | `POST /api/telegram/link-code` (web, authentifié) → code 8 caractères, 10 min, usage unique |
| Mini App | `/mini-app` — charge `telegram-web-app.js`, échange `initData` contre une session |
| Échange initData | `POST /api/telegram/mini-app/session` — vérifie HMAC puis pose le cookie de session |
| Configuration | `POST /api/telegram/setup` (protégé par `CRON_SECRET`) + `scripts/telegram-setup.mjs` |
| Traçabilité | chaque réponse bot enregistrée dans `notifications` |

## 2. Sécurité (vérifiée)

- **`initData`** : HMAC-SHA256 (`secret_key = HMAC_SHA256(bot_token, "WebAppData")`),
  comparaison **à temps constant**, `auth_date` borné à 1 h, `user.id` validé.
- **`initDataUnsafe` n'est jamais une preuve** : le serveur re-vérifie toujours la signature.
- **Webhook** : secret comparé à temps constant ; refus 401 sinon.
- **Liaison** : code à usage unique, stocké en **empreinte SHA-256**, expiration 10 min,
  invalidé immédiatement après usage. Un simple identifiant Telegram ne suffit jamais.
- **Anti-énumération** et journalisation déjà en place (Lot 3).

## 3. Procédure de mise en service (gratuite)

1. **@BotFather** → `/newbot` → noter le token.
2. Renseigner dans `.env.local` :
   ```
   TELEGRAM_BOT_TOKEN=123456:...
   TELEGRAM_WEBHOOK_SECRET=<aléatoire long>
   NEXT_PUBLIC_APP_URL=https://votre-url-publique
   ```
3. Configurer le webhook :
   ```bash
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... APP_URL=https://... node scripts/telegram-setup.mjs
   ```
   (ou `POST /api/telegram/setup` avec `Authorization: Bearer $CRON_SECRET`).
4. **@BotFather** → `/mybots` → Bot Settings → **Configure Mini App** → URL `https://.../mini-app`.
5. Enregistrer les commandes et le bouton de menu (script fourni) :
   ```bash
   TELEGRAM_BOT_TOKEN=... APP_URL=https://... node scripts/telegram-bot-setup.mjs
   ```
   → 10 commandes (`/start`, `/lier`, `/tableau`, `/boutiques`, `/commandes`, `/stocks`,
   `/finance`, `/mimi`, `/notifications`, `/aide`) + bouton de menu **« Ouvrir la Mini App »**.
   La liste doit rester synchronisée avec `COMMANDS` dans `src/lib/telegram-bot.ts`.

> ⚠️ Le webhook exige une URL **HTTPS publique** : tant que l'application n'est pas déployée,
> le bot ne peut pas recevoir de messages (la Mini App reste testable localement).

## 4. Preuves

```
bash scripts/telegram-smoke.sh http://localhost:3100 <webhook_secret>
=== RÉSULTAT : 8 OK / 0 ÉCHEC ===
```
- 401 sans secret · 401 mauvais secret · 200 bon secret · code de liaison généré ·
  code refusé sans session · initData falsifié refusé · initData vide refusé.

**Liaison réelle** : code généré → `POST /api/telegram/webhook` avec `/lier CODE` →
la table `telegram_accounts` contient bien `telegram_id ↔ linked_user_id` (vérifié en base),
avec `auth.telegram_linked` dans `audit_logs` et `account_linked` dans `notifications`.

**Tests** : `src/lib/__tests__/telegram.test.ts` (signature, expiration, secret webhook),
`telegram-integration.test.ts` (liaison sur base réelle, ignoré en CI).

## 5. État en production (2026-11-23)

| Élément | État |
|---|---|
| Webhook | actif sur `https://tout-en-un-business-manager.onrender.com/api/telegram/webhook` |
| Webhook sans secret | **401** |
| Liaison réelle | `telegram_accounts` : `5049204160` (@Fabienserge) → `fabienserge77@gmail.com` |
| Réponses du bot | `/start`, `/boutiques`, `/aide` → `notifications.bot_reply = sent` (mesuré) |
| Mini App (auth) | `initData` valide → **200** + cookie de session `teu_session` (mesuré en prod) |
| Commandes / bouton de menu | 10 commandes + bouton web_app **« Ouvrir la Mini App »** |

## 6. Limites connues (honnête)

- **La Mini App ne gère pas encore les boutiques** : elle authentifie puis renvoie vers le tableau
  de bord. La gestion des boutiques arrive avec l'interface commune (**Lot 6**). Les messages du bot
  renvoient donc vers le **site** (`/boutiques`) et ne promettent rien de faux.
- **Commandes `/commandes`, `/stocks`, `/finance`, `/tableau`, `/mimi`** répondent
  « Bientôt disponible » : aucun module métier n'est branché, aucune donnée fictive n'est affichée.
- **HTTPS public requis** pour le webhook → assuré par Render (Lot 8).
- **Notifications** : l'envoi aux utilisateurs non liés renvoie vers la liaison (pas de spam).
- **Groupes** : non activés (le bot ne répond qu'en messages privés).
