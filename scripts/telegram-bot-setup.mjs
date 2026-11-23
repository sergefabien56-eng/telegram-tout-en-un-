/**
 * Configure le bot Telegram : commandes affichées + bouton de menu vers la Mini App.
 * Usage :
 *   TELEGRAM_BOT_TOKEN=... APP_URL=https://....onrender.com node scripts/telegram-bot-setup.mjs
 *
 * La liste des commandes doit rester synchronisée avec `COMMANDS`
 * dans src/lib/telegram-bot.ts.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.APP_URL?.replace(/\/+$/, "");

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN est requis.");
  process.exit(1);
}

const COMMANDS = [
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

const base = `https://api.telegram.org/bot${token}`;

async function call(method, body) {
  const response = await fetch(`${base}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`${method} -> ${data.error_code} ${data.description}`);
  }
  return data.result;
}

async function main() {
  await call("setMyCommands", { commands: COMMANDS });
  console.log(`✅ ${COMMANDS.length} commandes enregistrées.`);

  if (appUrl) {
    await call("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Ouvrir la Mini App",
        web_app: { url: `${appUrl}/mini-app` },
      },
    });
    console.log(`✅ Bouton de menu → ${appUrl}/mini-app`);
  } else {
    console.log("ℹ️  APP_URL absent : bouton de menu non configuré.");
  }

  const info = await call("getMyCommands", {});
  console.log(`   commandes visibles : ${info.map((c) => "/" + c.command).join(" ")}`);
  const button = await call("getChatMenuButton", {});
  console.log(`   bouton de menu : ${JSON.stringify(button)}`);
}

main().catch((error) => {
  console.error("ÉCHEC :", error instanceof Error ? error.message : error);
  process.exit(1);
});
