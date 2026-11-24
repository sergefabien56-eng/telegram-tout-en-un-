import { audit } from "@/lib/audit";
import {
  consumeLinkCode,
  countUserShops,
  findLinkedUser,
  traceNotification,
} from "@/lib/telegram-service";

/**
 * Traitement des mises à jour Telegram (commandes du bot).
 * Le bot ne réalise aucune action sensible sans confirmation :
 * il renvoie vers la Mini App pour toute écriture.
 */

type TelegramMessage = {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string; last_name?: string };
  chat: { id: number; type?: string };
  text?: string;
};

export type BotOutcome = { handled: boolean; reply?: string };

const COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "Démarrer et ouvrir la Mini App" },
  { command: "lier", description: "Lier un compte web (/lier CODE)" },
  { command: "tableau", description: "Tableau de bord" },
  { command: "boutiques", description: "État des boutiques" },
  { command: "commandes", description: "Dernières commandes" },
  { command: "stocks", description: "Alertes stocks" },
  { command: "finance", description: "Derniers chiffres" },
  { command: "mimi", description: "Ouvrir MIMI" },
  { command: "notifications", description: "Gérer les notifications" },
  { command: "aide", description: "Aide" },
];

export function listCommands() {
  return COMMANDS;
}

/** URL publique de l'app (pour les liens cliquables des réponses du bot). */
function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : "";
}

function appLink(path: string, label: string): string {
  const url = appUrl(path);
  return url ? `<a href="${url}">${label}</a>` : label;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Traite un message entrant et renvoie la réponse à envoyer. */
export async function handleMessage(message: TelegramMessage): Promise<BotOutcome> {
  const text = (message.text ?? "").trim();
  const from = message.from;

  if (!text || !from) return { handled: false };

  const [rawCommand, ...args] = text.split(/\s+/);
  // Accepte « /start » et « /start@MonBot ».
  const command = (rawCommand ?? "").replace(/^\//, "").split("@")[0]?.toLowerCase() ?? "";

  switch (command) {
    case "start": {
      const payload = args[0] ?? "";
      if (payload.startsWith("link_")) {
        return handleLink(payload.slice(5), from);
      }
      const linked = await findLinkedUser(from.id);
      const greeting = from.first_name ? `Bonjour ${escapeHtml(from.first_name)}` : "Bonjour";
      if (linked) {
        return {
          handled: true,
          reply:
            `${greeting} ! 👋\n\nVotre compte <b>${escapeHtml(linked.email)}</b> est lié.\n\n` +
            `• Mini App : ${appLink("/mini-app", "ouvrir l'espace mobile")}\n` +
            `• Site : ${appLink("/boutiques", "gérer vos boutiques")}`,
        };
      }
      return {
        handled: true,
        reply: `${greeting} ! 👋\n\nJe suis <b>TOUT EN UN Business Manager</b>.\n\nPour lier votre compte web, tapez <code>/lier CODE</code>.\nLe code se génère dans votre espace web (10 minutes de validité).`,
      };
    }

    case "lier": {
      const code = args[0];
      if (!code) {
        return {
          handled: true,
          reply: "Usage : <code>/lier CODE</code>\nLe code s'obtient dans votre espace web, section Telegram.",
        };
      }
      return handleLink(code, from);
    }

    case "tableau":
    case "boutiques":
    case "commandes":
    case "stocks":
    case "finance":
    case "notifications":
    case "rapport": {
      const linked = await findLinkedUser(from.id);
      if (!linked) {
        return {
          handled: true,
          reply: "⚠️ Compte non lié. Tapez <code>/lier CODE</code> après avoir généré un code sur le site.",
        };
      }
      if (command === "boutiques") {
        const shops = await countUserShops(linked.userId);
        return {
          handled: true,
          reply:
            shops > 0
              ? `🏪 Vous avez <b>${shops}</b> boutique(s) connectée(s).\n${appLink("/boutiques", "Gérer mes boutiques")}`
              : "🏪 Aucune boutique connectée pour le moment.\n" +
                `Ajoutez-en une depuis le site : ${appLink("/boutiques", "Créer ma boutique")}\n` +
                "(la gestion des boutiques dans la Mini App arrive avec l'interface commune, Lot 6).",
        };
      }
      if (command === "notifications") {
        return {
          handled: true,
          reply: "🔔 Vous recevez les alertes sur ce chat.\nLes préférences seront réglables dans la Mini App.",
        };
      }
      return {
        handled: true,
        reply: "Bientôt disponible dans la Mini App.\nAucune donnée fictive n'est affichée pour l'instant.",
      };
    }

    case "mimi": {
      const link = appLink("/mini-app?page=mimi", "ouvrir MIMI");
      return {
        handled: true,
        reply:
          "🤖 <b>MIMI</b> répond à vos questions avec les données réelles de vos boutiques :\n" +
          "commandes, stocks et relevés Jumia. Chaque chiffre est sourcé, et « donnée indisponible » " +
          "est affiché quand l'outil ne peut pas répondre.\n\n" +
          `→ ${link}`,
      };
    }

    case "aide":
    default: {
      const lines = COMMANDS.map((c) => `<code>/${c.command}</code> — ${c.description}`).join("\n");
      return { handled: true, reply: `<b>Commandes disponibles</b>\n\n${lines}` };
    }
  }
}

async function handleLink(
  code: string,
  from: { id: number; username?: string; first_name?: string; last_name?: string },
): Promise<BotOutcome> {
  const result = await consumeLinkCode(code, {
    id: from.id,
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
  });

  if (result.ok) {
    await audit({
      action: "auth.telegram_linked",
      result: "success",
      userId: result.userId,
      entityType: "telegram",
      entityId: String(from.id),
    });
    await traceNotification({
      userId: result.userId,
      type: "account_linked",
      title: "Compte Telegram lié",
      body: "Votre compte Telegram a été associé à votre espace web.",
      status: "sent",
    });
    return { handled: true, reply: "✅ <b>Compte lié avec succès.</b>\nVous pouvez désormais utiliser la Mini App et recevoir les alertes ici." };
  }

  return { handled: true, reply: `⚠️ ${escapeHtml(result.reason)}` };
}


