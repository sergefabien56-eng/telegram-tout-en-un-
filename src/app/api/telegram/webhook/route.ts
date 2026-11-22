import { fail, ok } from "@/lib/http";
import { verifyWebhookSecret } from "@/lib/telegram";
import { handleMessage } from "@/lib/telegram-bot";
import { findLinkedUser, traceNotification } from "@/lib/telegram-service";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Webhook Telegram (Telegram → serveur).
 * HTTPS + en-tête secret obligatoires. Répond 200 rapidement.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return fail(500, "TELEGRAM_WEBHOOK_SECRET n'est pas configuré.");
  }
  if (!verifyWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return fail(401, "En-tête secret de webhook invalide.");
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return fail(500, "TELEGRAM_BOT_TOKEN n'est pas configuré.");
  }

  let update: { message?: unknown; callback_query?: unknown };
  try {
    update = (await request.json()) as typeof update;
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  // Réponse rapide à Telegram, traitement ensuite.
  const message = update.message as
    | {
        message_id: number;
        from?: { id: number; username?: string; first_name?: string; last_name?: string };
        chat: { id: number; type?: string };
        text?: string;
      }
    | undefined;

  if (message?.text) {
    const outcome = await handleMessage(message);
    if (outcome.handled && outcome.reply) {
      const linked = message.from ? await findLinkedUser(message.from.id) : null;
      await sendTelegramMessage(botToken, message.chat.id, outcome.reply);
      // Traçabilité (ne bloque pas la réponse).
      if (linked) {
        await traceNotification({
          userId: linked.userId,
          type: "bot_reply",
          title: "Réponse du bot",
          body: outcome.reply.slice(0, 200),
          status: "sent",
        });
      }
    }
  }

  return ok({ accepted: true });
}
