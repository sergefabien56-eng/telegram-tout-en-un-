/**
 * Bot Telegram en mode « sondage » (polling) pour les tests locaux.
 *
 * Le webhook nécessite une URL HTTPS publique (Lot 8). Sans elle, ce script lit
 * les messages avec getUpdates et répond, en réutilisant la VRAIE logique métier
 * (handleMessage) — aucune duplication.
 *
 * Usage :
 *   npx tsx scripts/telegram-poll.ts [durée_secondes]
 */
import { readFileSync } from "node:fs";

// Charge .env.local AVANT les imports de la logique métier.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (process.env[key] === undefined) process.env[key] = value;
}

type TelegramMessage = Parameters<typeof import("../src/lib/telegram-bot").handleMessage>[0];

async function main() {
  const durationSeconds = Number(process.argv[2] ?? 120);

  const { handleMessage } = await import("../src/lib/telegram-bot");
  const { sendTelegramMessage } = await import("../src/lib/telegram");
  const { findLinkedUser, traceNotification } = await import("../src/lib/telegram-service");

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN manquant.");
    process.exit(1);
  }

  const api = (method: string, payload: Record<string, unknown> = {}) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(
      (r) =>
        r.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>,
    );

  let offset = 0;
  const deadline = Date.now() + durationSeconds * 1000;

  console.log(`🤖 Bot en écoute pendant ${durationSeconds}s… (Ctrl+C pour arrêter)`);

  while (Date.now() < deadline) {
    const updates = await api("getUpdates", { offset, timeout: 20, allowed_updates: ["message"] });
    if (!updates.ok) {
      console.error("getUpdates :", updates.description);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const update of updates.result as { update_id: number; message?: TelegramMessage }[]) {
      offset = update.update_id + 1;
      const message = update.message;
      if (!message?.text) continue;

      console.log(`📩 recu : ${message.text} (chat ${message.chat.id})`);
      const outcome = await handleMessage(message);
      if (!outcome.handled || !outcome.reply) continue;

      const linked = message.from ? await findLinkedUser(message.from.id) : null;
      const sent = await sendTelegramMessage(token, message.chat.id, outcome.reply);
      console.log(sent.ok ? "📤 réponse envoyée" : `⚠️ envoi échoué : ${sent.error}`);

      if (linked) {
        await traceNotification({
          userId: linked.userId,
          type: "bot_reply",
          title: "Réponse du bot (polling)",
          body: outcome.reply.slice(0, 200),
          status: sent.ok ? "sent" : "failed",
        });
      }
    }
  }

  console.log("⏹️  Fin de l'écoute.");
}

main().catch((error) => {
  console.error("Erreur du bot :", error instanceof Error ? error.message : error);
  process.exit(1);
});
