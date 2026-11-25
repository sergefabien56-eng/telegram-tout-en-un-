/**
 * Vérification du périmètre en production.
 *
 * Ouvre une session sur le site déployé, parcourt le tableau de bord pour
 * chaque boutique, puis relève les chiffres affichés. Le but : prouver que
 * MaxiShopsCI et NKSF ne renvoient **pas** les mêmes résultats (le reproche
 * d'origine), et que l'agrégat vaut leur somme.
 *
 * Usage : node scripts/verif-perimetre.mjs [url]
 */
import { chromium } from "playwright";

const BASE =
  process.argv[2] ?? process.env.APP_URL ?? "https://tout-en-un-business-manager.onrender.com";
const EMAIL = process.env.DEMO_EMAIL ?? "demo-captures@exemple.ci";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Captures2026!";

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, locale: "fr-FR" });
const page = await context.newPage();

await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });

/** Relit les KPI affichés (valeur + provenance). */
async function lireKpi() {
  return page.evaluate(() => {
    const cartes = Array.from(
      document.querySelectorAll("div.rounded-xl.border.border-border.bg-surface.p-4"),
    );
    const lire = (titre) => {
      const carte = cartes.find(
        (el) => el.querySelector("p")?.textContent?.trim().toLowerCase() === titre.toLowerCase(),
      );
      if (!carte) return null;
      const valeur = carte
        .querySelector("p.text-2xl, p.font-semibold, div.font-semibold")
        ?.textContent?.trim();
      const note = carte.querySelectorAll("p")[1]?.textContent?.trim();
      return { valeur: valeur ?? null, note: note ?? null };
    };
    return {
      ca: lire("CA commandes"),
      articles: lire("Articles vendus"),
      stocks: lire("Stocks faibles"),
      net: lire("Net à verser (Jumia)"),
    };
  });
}

const reponseShops = await (await page.request.get("/api/shops")).json();
const boutiques = (reponseShops?.data?.shops ?? reponseShops?.data ?? []).map((s) => ({
  id: s.id,
  name: s.name,
}));

console.log(`Production : ${BASE}`);
console.log("Boutiques du compte :", boutiques.map((b) => b.name).join(", "), "\n");

const releves = [];
for (const boutique of boutiques) {
  await page.goto(`/dashboard?boutique=${boutique.id}`, { waitUntil: "networkidle" });
  const kpi = await lireKpi();
  releves.push({ boutique: boutique.name, ...kpi });
  console.log(`• ${boutique.name}`);
  console.log(`    CA commandes  : ${kpi.ca?.valeur} (${kpi.ca?.note})`);
  console.log(`    Articles      : ${kpi.articles?.valeur}`);
  console.log(`    Net à verser  : ${kpi.net?.valeur}\n`);
}

await page.goto("/dashboard?boutique=toutes", { waitUntil: "networkidle" });
const agregat = await lireKpi();
console.log("• Agrégat (toutes)");
console.log(`    CA commandes  : ${agregat.ca?.valeur} (${agregat.ca?.note})\n`);

await page.goto(`/dashboard?boutique=${crypto.randomUUID()}`, { waitUntil: "networkidle" });
const refus = await page.getByRole("alert").first().textContent();
console.log("• Boutique hors périmètre →", refus?.trim().slice(0, 90), "\n");

const [a, b] = releves;
if (a && b) {
  const distinct = a.ca?.valeur !== b.ca?.valeur || a.articles?.valeur !== b.articles?.valeur;
  console.log(
    distinct
      ? "✅ Les deux boutiques renvoient des chiffres DIFFÉRENTS : le périmètre est respecté."
      : "❌ Les deux boutiques renvoient les mêmes chiffres : le périmètre n'est PAS respecté.",
  );
}

await context.close();
await browser.close();
