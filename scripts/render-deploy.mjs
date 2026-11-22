/**
 * Déploiement Render piloté par l'API (0 FCFA, plan Free).
 * Usage : RENDER_API_KEY=xxx node scripts/render-deploy.mjs
 *
 *   1. retrouve ou crée le service web ;
 *   2. récupère son URL publique ;
 *   3. upsére les variables d'environnement ;
 *   4. déclenche un déploiement et attend ;
 *   5. vérifie /api/health.
 */
const API = "https://api.render.com/v1";
const key = process.env.RENDER_API_KEY;

if (!key) {
  console.error("RENDER_API_KEY est requis.");
  process.exit(1);
}

const SERVICE_NAME = "tout-en-un-business-manager";
const REPO = "https://github.com/sergefabien56-eng/telegram-tout-en-un-";

const call = async (method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} : ${text.slice(0, 400)}`);
  }
  return data;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listServices() {
  const response = await call("GET", "/services?limit=100");
  return (response ?? []).map((entry) => entry.service);
}

async function main() {
  const owners = await call("GET", "/owners");
  console.log(`Compte Render : ${owners[0]?.name ?? owners[0]?.id ?? "(inconnu)"}`);

  let service = (await listServices()).find((s) => s.name === SERVICE_NAME);

  if (!service) {
    console.log("Service introuvable → création…");
    service = await call("POST", "/services", {
      type: "web_service",
      name: SERVICE_NAME,
      runtime: "node",
      repo: REPO,
      branch: "main",
      rootDir: "",
      buildCommand: "npm install --include=dev && npm run build",
      startCommand: "npm run start",
      healthCheckPath: "/api/health",
      plan: "free",
      autoDeploy: "yes",
    });
    console.log(`Service créé : ${service.id}`);
    await sleep(3000);
  } else {
    console.log(`Service trouvé : ${service.id}`);
  }

  const id = service.id;

  // Le build a besoin des devDependencies (Tailwind, TypeScript…) : NODE_ENV=production
  // les sauterait au `npm install`. On force --include=dev.
  // IMPORTANT : le champ vit dans serviceDetails.envSpecificDetails, pas à la racine.
  // Le blueprint (render.yaml sur GitHub) reste la source de vérité ; ce PATCH ne sert
  // que de filet de sécurité si le YAML n'est pas à jour.
  const BUILD_COMMAND = "npm install --include=dev && npm run build";
  const START_COMMAND = "npm run start";
  await call("PATCH", `/services/${id}`, {
    serviceDetails: { envSpecificDetails: { buildCommand: BUILD_COMMAND, startCommand: START_COMMAND } },
  });
  const check = await call("GET", `/services/${id}`);
  const applied = check.serviceDetails?.envSpecificDetails?.buildCommand;
  if (applied !== BUILD_COMMAND) {
    console.error(`buildCommand non appliqué (lu : ${applied}). Synchronise le blueprint puis relance.`);
    process.exit(1);
  }
  console.log("buildCommand corrigé (devDependencies inclus).");

  const details = await call("GET", `/services/${id}`);
  const url = details.serviceDetails?.url;
  if (!url) {
    console.error("URL du service indisponible : " + JSON.stringify(details.serviceDetails ?? {}));
    process.exit(1);
  }
  console.log(`URL : ${url}`);

  const ENV = {
    NODE_VERSION: "20",
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL: url,
  };

  const missing = Object.entries(ENV).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.error("Variables manquantes : " + missing.join(", "));
    process.exit(1);
  }

  const existing = await call("GET", `/services/${id}/env-vars`);
  const byKey = new Map((existing ?? []).map((entry) => [entry.envVar.key, entry]));

  // NODE_ENV=production casse `npm install` (dev deps omis) : on le retire.
  if (byKey.has("NODE_ENV")) {
    await call("DELETE", `/services/${id}/env-vars/${byKey.get("NODE_ENV").id}`);
    byKey.delete("NODE_ENV");
    console.log("NODE_ENV retiré (Render le pose en production au runtime).");
  }
  for (const [name, value] of Object.entries(ENV)) {
    const found = byKey.get(name);
    if (found) {
      await call("PUT", `/services/${id}/env-vars/${found.id}`, { value });
    } else {
      await call("POST", `/services/${id}/env-vars`, { key: name, value });
    }
  }
  console.log("Variables d'environnement synchronisées (" + Object.keys(ENV).length + ").");

  const deploy = await call("POST", `/services/${id}/deploys`, { clearCache: "clear" });
  console.log(`Déploiement ${deploy.id} déclenché…`);

  let current = deploy;
  for (let i = 0; i < 50; i += 1) {
    await sleep(15000);
    const list = await call("GET", `/services/${id}/deploys?limit=5`);
    current = (list ?? []).map((entry) => entry.deploy).find((d) => d.id === deploy.id) ?? current;
    console.log(`  [${i + 1}] ${current.status}`);
    if (["live", "build_failed", "update_failed", "prebuild_failed", "canceled"].includes(current.status)) {
      break;
    }
  }

  if (current.status !== "live") {
    console.error(`Déploiement non abouti (${current.status}). Logs : tableau de bord Render.`);
    process.exit(1);
  }

  console.log("Vérification /api/health…");
  for (let i = 0; i < 15; i += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        console.log(`✅ EN LIGNE : ${url}`);
        console.log("   " + (await response.text()));
        return;
      }
    } catch {
      // le réveil peut prendre ~50 s
    }
    await sleep(10000);
  }
  console.error("Healthcheck absent (réveil possible). Vérifie : " + url);
  process.exit(1);
}

main().catch((error) => {
  console.error("ÉCHEC :", error instanceof Error ? error.message : error);
  process.exit(1);
});
