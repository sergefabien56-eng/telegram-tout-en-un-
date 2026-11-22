# Intégration Telegram — Bot + Mini App

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Coût** : **0 FCFA** (Bot API officielle, aucune licence)
- **Statut** : À valider

---

## 1. Les trois briques

1. **Un bot** (créé via @BotFather) : réception des commandes, notifications, liaison de compte.
2. **Une Mini App** (la même application web, affichée dans Telegram).
3. **Un webhook** : Telegram → notre serveur (HTTPS obligatoire).

---

## 2. Création du bot (procédure)

1. Ouvrir **@BotFather** dans Telegram.
2. `/newbot` → nom + username (doit se terminer par `bot`).
3. Conserver le **token** secret (variable d'environnement serveur, jamais dans le code).
4. `/setdescription`, `/setabouttext`, `/setcommands` (liste des commandes).
5. Désactiver le mode « privacy » si on veut lire les messages de groupe (sinon, indisponible).

---

## 3. Webhook (Telegram → serveur)

- API : `https://api.telegram.org/bot<token>/setWebhook`.
- Paramètres : `url` (HTTPS), `secret_token`, `allowed_updates`, `max_connections` (1–100, défaut 40).
- **HTTPS obligatoire**, ports autorisés : **443, 80, 88, 8443**. [1]
- Le `secret_token` est renvoyé dans l'en-tête `X-Telegram-Bot-Api-Secret-Token` : notre serveur **vérifie** cet en-tête sur chaque appel. [1]
- Les mises à jour non acquittées sont conservées **24 h** par Telegram. [1]
- En production, répondre **200 vite** et traiter les tâches en asynchrone.

Sécurité : ne **jamais** exposer le token ; limiter le débit ; journaliser (sans le token).

---

## 4. Mini App

### 4.1 Mise en place

1. L'application est une page web **HTTPS** (sous-domaine gratuit de l'hébergeur).
2. Ajouter le script officiel `telegram-web-app.js` dans le `<head>` : `window.Telegram.WebApp`. [2]
3. Dans **@BotFather** : `/mybots` → votre bot → **Bot Settings → Configure Mini App → Enable Mini App** (ou `/setmenubutton` pour le bouton de menu) avec l'URL HTTPS. [3]
4. Liens d'ouverture : bouton de menu, `t.me/<bot>?startapp`, ou `t.me/<bot>/<appname>` (Mini App principale). [3]

### 4.2 Adaptation de l'interface

- Thème : lire les couleurs du client Telegram (`themeParams`) et les appliquer (mode clair/sombre Telegram) **en plus** des thèmes de l'application.
- Boutons natifs : `MainButton`, `BackButton`, `HapticFeedback`.
- Safe-area (encoche) et clavier virtuel.
- La Mini App affiche **la même application** que le web, en présentation compacte.

---

## 5. Authentification Mini App (sécurité)

### 5.1 Principe

Le client envoie le `initData` brut ; le serveur le **vérifie**. `initDataUnsafe` n'est **jamais** une preuve d'identité.

Algorithme officiel : [4]

```
data_check_string = champs (hors hash), triés par clé, "clé=valeur" joints par \n
secret_key = HMAC_SHA256(bot_token, clé = "WebAppData")
hash_attendu = HMAC_SHA256(data_check_string, secret_key) en hexadécimal
```

Vérifications obligatoires :
1. `hash` présent et de la bonne forme (64 hex).
2. Comparaison **à temps constant** (`timingSafeEqual`) — jamais `===`.
3. `auth_date` dans une fenêtre de fraîcheur (on recommande ≤ 1 h ; plus strict = mieux).
4. `user.id` → identité Telegram **prouvée**.

Extrait (conceptuel, à implémenter en TypeScript) :

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function checkInitData(initData: string, botToken: string, maxAgeSeconds = 3600) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSeconds) return null;
  return JSON.parse(params.get("user") || "null");
}
```

### 5.2 Échange contre une session

- `initData` n'est pas refait à chaque requête : après vérification, on délivre une **session courte** (cookie ou JWT signé).
- La session référence l'`user_id` local (pas seulement le `telegram_id`).

### 5.3 Liaison de comptes (Web ↔ Telegram)

1. L'utilisateur **connecté sur le web** génère un **code à usage unique** (expiration 10 min, taux limité).
2. Dans Telegram : `/lier <code>`.
3. Le serveur valide le code et associe `telegram_id ↔ user_id`.
4. Confirmation affichée des deux côtés ; code invalidé immédiatement.
5. **Jamais** un identifiant Telegram « envoyé par le navigateur » ne suffit.

---

## 6. Commandes du bot (proposition)

| Commande | Rôle |
|---|---|
| `/start` | Accueil + ouvrir la Mini App |
| `/tableau` | Lien direct tableau de bord |
| `/boutiques` | État des boutiques |
| `/commandes` | Dernières commandes / alertes |
| `/stocks` | Alertes stocks |
| `/finance` | Derniers chiffres (rappel) |
| `/mimi` | Ouvrir la discussion MIMI |
| `/rapport` | Rapport périodique |
| `/notifications` | Gérer les préférences |
| `/lier` | Lier un compte web |
| `/aide` | Aide |

Le bot **n'ouvre pas** d'action sensible sans confirmation ; il renvoie vers la Mini App pour tout écriture.

---

## 7. Notifications (règles)

- Types : nouvelle commande, commande à traiter, stock faible, rupture, boutique déconnectée, sync en erreur, paiement attendu, transaction non rapprochée, retour, anomalie, rapport périodique.
- **Préférences par utilisateur** (`user_notification_prefs`) ; **regroupement** des notifications répétitives (fenêtre de 15 min) ; **pas de notification** en heures silencieuses configurées.
- **Limites Telegram** : ≈1 message/s par chat, 20/min par groupe, ≈30/s global. [1]
- **Groupes** : n'ajouter le bot que dans des groupes **autorisés et privés** ; jamais de données confidentielles dans un groupe non autorisé.
- Chaque envoi est tracé (`notifications` : `status`, `sent_at`, `error`).

---

## 8. Sécurité (checklist)

- [x] Token bot en variable d'environnement serveur, jamais dans le front.
- [x] `secret_token` de webhook vérifié.
- [x] `initData` vérifié côté serveur, comparaison à temps constant, `auth_date` borné.
- [x] Liaison de compte par code à usage unique (pas par simple id).
- [x] Permissions vérifiées côté serveur sur chaque action.
- [x] Aucun secret dans les logs.
- [x] Rate limiting (commandes, liaison, API).
- [x] Notifications tracées et préférables.

---

## 9. Sources

- [1] Limites Bot API (webhooks, ports, secret_token, débits) : https://www.conferbot.com/limits/telegram
- [2] Telegram Mini Apps (script `telegram-web-app.js`, `window.Telegram.WebApp`) : https://core.telegram.org/bots/webapps
- [3] Création d'une Mini App (BotFather, Configure Mini App, menu button) : https://tiny-shops.com/blog/how-to-create-telegram-mini-app
- [4] Validation `initData` (HMAC-SHA256) : https://core.telegram.org/bots/webapps
