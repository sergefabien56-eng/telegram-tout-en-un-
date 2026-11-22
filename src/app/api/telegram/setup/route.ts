import { fail, ok } from "@/lib/http";
import { setTelegramWebhook } from "@/lib/telegram";

/**
 * Configure le webhook Telegram. Protégé par CRON_SECRET (ou une clé admin).
 * Nécessite une URL publique HTTPS (APP_URL).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(500, "CRON_SECRET n'est pas configuré.");

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) return fail(401, "Non autorisé.");

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!botToken || !webhookSecret || !appUrl) {
    return fail(500, "TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET et APP_URL sont requis.");
  }

  const url = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  const result = await setTelegramWebhook(botToken, url, webhookSecret);
  if (!result.ok) return fail(502, `Telegram a refusé : ${result.error}`);

  return ok({ url, configured: true });
}
