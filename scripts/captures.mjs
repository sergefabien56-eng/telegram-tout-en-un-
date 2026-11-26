/**
 * Captures de démonstration de la refonte « Pilotage ».
 *
 * Ouvre une session sur un compte de démonstration, parcourt les pages du
 * pilotage et enregistre une capture par écran (web desktop, web mobile,
 * Mini App Telegram).
 *
 * Usage : node scripts/captures.mjs [dossier]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL ?? "demo-captures@exemple.ci";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Captures2026!";
const OUT = process.argv[2] ?? "docs/captures";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function shoot(page, name) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("📸", name);
}

async function session(context) {
  const page = await context.newPage();
  await page.request.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  return page;
}

/* ---------- Web desktop ---------- */
{
  const context = await browser.newContext({ viewport: DESKTOP, locale: "fr-FR", baseURL: BASE });
  const page = await session(context);

  const ecrans = [
    ["01-tableau-de-bord-boutique", "/dashboard"],
    ["02-tableau-de-bord-agregat", "/dashboard?boutique=toutes"],
    ["03-performances", "/performances?boutique=toutes"],
    ["04-alertes", "/alertes?boutique=toutes"],
    ["05-activites", "/activites?boutique=toutes"],
    ["06-recherche", "/recherche"],
    ["07-apparence", "/apparence"],
    ["08-refus-perimetre", "/dashboard?boutique=00000000-0000-0000-0000-000000000000"],
    // Module « Ventes & commandes » : les quatre rubriques et leurs sous-vues.
    ["16-ventes-a-historique", "/commandes?boutique=toutes"],
    ["17-ventes-b-a-traiter", "/commandes/a-traiter?boutique=toutes"],
    ["18-ventes-b-en-attente", "/commandes/a-traiter/en-attente?boutique=toutes"],
    ["19-ventes-b-pretes-a-expedier", "/commandes/a-traiter/pretes-a-expedier?boutique=toutes"],
    ["20-ventes-b-etiquettes", "/commandes/a-traiter/etiquettes?boutique=toutes"],
    ["21-ventes-c-expediees", "/commandes/expediees?boutique=toutes"],
    ["22-ventes-c-retours", "/commandes/retours?boutique=toutes"],
    ["23-ventes-d-villes", "/commandes/villes?boutique=toutes"],
    ["24-ventes-a-annulees", "/commandes/annulees?boutique=toutes"],
  ];

  for (const [nom, chemin] of ecrans) {
    await page.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded" });
    await shoot(page, nom);
  }

  // Thème sombre.
  await page.goto(`${BASE}/apparence`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /sombre/i })
    .click()
    .catch(() => {});
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/dashboard?boutique=toutes`, { waitUntil: "domcontentloaded" });
  await shoot(page, "09-tableau-de-bord-sombre");

  // Les ventes en thème sombre : le contraste doit rester lisible.
  await page.goto(`${BASE}/commandes?boutique=toutes`, { waitUntil: "domcontentloaded" });
  await shoot(page, "25-ventes-sombre");

  await context.close();
}

/* ---------- Web mobile ---------- */
{
  const context = await browser.newContext({
    viewport: MOBILE,
    locale: "fr-FR",
    isMobile: true,
    hasTouch: true,
    baseURL: BASE,
  });
  const page = await session(context);

  for (const [nom, chemin] of [
    ["10-mobile-tableau-de-bord", "/dashboard?boutique=toutes"],
    ["11-mobile-performances", "/performances?boutique=toutes"],
    ["12-mobile-recherche", "/recherche"],
    ["26-mobile-ventes-a-traiter", "/commandes/a-traiter?boutique=toutes"],
    ["27-mobile-ventes-villes", "/commandes/villes?boutique=toutes"],
  ]) {
    await page.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded" });
    await shoot(page, nom);
  }

  // Tiroir de navigation ouvert.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /ouvrir le menu/i })
    .click()
    .catch(() => {});
  await shoot(page, "13-mobile-navigation");

  await context.close();
}

/* ---------- Mini App Telegram ---------- */
{
  const context = await browser.newContext({
    viewport: MOBILE,
    locale: "fr-FR",
    isMobile: true,
    hasTouch: true,
    baseURL: BASE,
  });
  const page = await session(context);
  await context.addCookies([{ name: "teu_ui", value: "mini", domain: "localhost", path: "/" }]);

  await page.goto(`${BASE}/dashboard?boutique=toutes`, { waitUntil: "domcontentloaded" });
  await shoot(page, "14-mini-app-accueil");

  // Mini App : les quatre rubriques de « Ventes et commandes ».
  await page.goto(`${BASE}/commandes?boutique=toutes`, { waitUntil: "domcontentloaded" });
  await shoot(page, "28-mini-app-ventes");

  await page
    .getByRole("button", { name: /^plus$/i })
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
  await shoot(page, "15-mini-app-menu");

  await context.close();
}

await browser.close();
console.log("\nCaptures enregistrées dans", OUT);
