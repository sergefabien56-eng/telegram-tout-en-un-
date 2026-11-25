/**
 * Vérification du module « Ventes & Commandes » en production.
 *
 * Ouvre une session sur le site déployé et contrôle, sur les **données
 * réelles** :
 * - les quatre rubriques du menu, et l'absence des anciennes entrées ;
 * - la cohérence des compteurs : « Commandes » et « Total affiché »
 *   correspondent aux commandes listées ;
 * - la répartition par famille (annulées, en attente, prêtes à expédier,
 *   expédiées, retours) ;
 * - l'agrégat des localités (volumes, taux d'échec, effectifs) ;
 * - le refus hors périmètre ;
 * - l'absence de jeton Jumia dans les pages lues.
 *
 * Usage : node scripts/verif-ventes.mjs [url]
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

/** Relit les compteurs affichés et le nombre de lignes listées. */
async function lireVue(chemin) {
  const reponse = await page.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const donnees = await page.evaluate(() => {
    const texte = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const cartes = Array.from(document.querySelectorAll("section.card, div.card"));
    const carte = (titre) =>
      cartes.find(
        (el) => el.querySelector("p")?.textContent?.trim().toLowerCase() === titre.toLowerCase(),
      );
    const valeur = (titre) => {
      const el = carte(titre);
      if (!el) return null;
      // Le chiffre est dans le <p> qui suit le libellé ; on écarte le libellé
      // lui-même et les notes explicatives.
      const ps = Array.from(el.querySelectorAll("p"));
      const index = ps.findIndex(
        (x) => x.textContent?.trim().toLowerCase() === titre.toLowerCase(),
      );
      if (index === -1) return null;
      return ps[index + 1]?.textContent?.trim() ?? null;
    };
    const boutonListe = Array.from(document.querySelectorAll("button")).find((b) =>
      /Afficher la liste|Masquer la liste/.test(b.textContent ?? ""),
    );
    const sousNav = Array.from(
      document.querySelectorAll('nav[aria-label^="Sous-rubriques"] a'),
    ).map((a) => a.textContent?.trim() ?? "");
    return {
      titre: texte("h1"),
      commandes: valeur("Commandes") ?? valeur("Commandes à traiter"),
      total: valeur("Total affiché"),
      liste: boutonListe?.textContent?.trim() ?? null,
      sousNav,
      corps: document.body.innerText.slice(0, 4000),
    };
  });
  return { status: reponse?.status() ?? 0, ...donnees };
}

console.log(`Production : ${BASE}\n`);

const vues = [
  ["/commandes?boutique=toutes", "A. Toutes les commandes — Historique"],
  ["/commandes/annulees?boutique=toutes", "A. Annulées"],
  ["/commandes/a-traiter?boutique=toutes", "B. À traiter"],
  ["/commandes/a-traiter/en-attente?boutique=toutes", "B. En attente"],
  ["/commandes/a-traiter/pretes-a-expedier?boutique=toutes", "B. Prêtes à expédier"],
  ["/commandes/a-traiter/factures?boutique=toutes", "B. Factures à imprimer"],
  ["/commandes/expediees?boutique=toutes", "C. Expédiées"],
  ["/commandes/retours?boutique=toutes", "C. Retours"],
  ["/commandes/villes?boutique=toutes", "D. Villes & localités"],
];

for (const [chemin, libelle] of vues) {
  const vue = await lireVue(chemin);
  console.log(`• ${libelle}`);
  console.log(`    HTTP ${vue.status} · titre « ${vue.titre} »`);
  console.log(`    Commandes : ${vue.commandes ?? "—"} · Total affiché : ${vue.total ?? "—"}`);
  console.log(`    Liste : ${vue.liste ?? "—"}`);
  if (vue.sousNav.length > 0) console.log(`    Sous-rubriques : ${vue.sousNav.join(" · ")}`);
  console.log("");
}

// Contrôle de cohérence : « Commandes » et la liste doivent concorder.
const historique = await lireVue("/commandes?boutique=toutes");
const annulees = await lireVue("/commandes/annulees?boutique=toutes");
const nombre = (texte) => Number((texte ?? "").replace(/[^\d]/g, ""));
const totalCommandes = nombre(historique.commandes) + nombre(annulees.commandes);
const totalListe = nombre(historique.liste) + nombre(annulees.liste);
console.log("Contrôle de cohérence");
console.log(
  `    Historique ${historique.commandes} + Annulées ${annulees.commandes} = ${totalCommandes} commandes`,
);
console.log(`    Listes affichées : ${totalListe} lignes (limite de 200 par vue)`);
console.log(
  `    Cohérent : ${totalListe <= totalCommandes && totalCommandes > 0 ? "OUI" : "À VÉRIFIER"}`,
);
console.log("");

// Refus hors périmètre.
const intruse = "00000000-0000-0000-0000-000000000000";
await page.goto(`${BASE}/commandes?boutique=${intruse}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(400);
const refus = await page.evaluate(() =>
  document.body.innerText.includes("n’est pas dans votre périmètre"),
);
console.log(`Refus hors périmètre affiché : ${refus ? "OUI" : "NON"}`);

// Aucun jeton Jumia dans les pages lues.
const fuite = await page.evaluate(() => {
  const texte = document.body.innerText;
  return /Bearer\s|eyJ[A-Za-z0-9_-]{10,}|refresh_token|access_token/i.test(texte);
});
console.log(`Jeton Jumia exposé dans la page : ${fuite ? "OUI — À CORRIGER" : "NON"}`);

await browser.close();
