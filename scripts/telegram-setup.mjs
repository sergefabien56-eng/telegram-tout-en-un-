/**
 * Configure le webhook Telegram depuis la ligne de commande (JS pur).
 * Usage :
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy APP_URL=https://exemple.com node scripts/telegram-setup.mjs
 *
 * Le secret n'est jamais affiché dans les sorties.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

if (!token || !secret || !appUrl) {
  console.error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET et APP_URL sont requis.");
  process.exit(1);
}

const url = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    max_connections: 20,
    drop_pending_updates: false,
  }),
});

const data = (await response.json()) as { ok?: boolean; description?: string };
if (data.ok) {
  console.log(`Webhook configuré : ${url}`);
} else {
  console.error(`Échec : ${data.description ?? `HTTP ${response.status}`}`);
}
process.exit(data.ok ? 0 : 1);
