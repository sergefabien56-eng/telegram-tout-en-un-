/**
 * Génère une page HTML de démonstration autonome.
 *
 * Les captures sont intégrées en `data:` URI : la page s'affiche donc
 * entièrement hors ligne, sans aucune ressource externe — c'est ce qui
 * permet de la rendre dans le visualiseur de l'espace de travail.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CAPTURES = "docs/captures";
const OUT = process.argv[2] ?? "docs/demo-apercu.html";

const ECRANS = [
  {
    fichier: "20-ventes-b-etiquettes.png",
    titre: "Étiquettes à imprimer",
    route: "/commandes/a-traiter/etiquettes",
    note: "La rubrique qui remplace « Factures à imprimer ». Documents fournis par Jumia, articles sans document, et refus Jumia avec code et message exacts — jamais confondus avec une attente.",
  },
  {
    fichier: "17-ventes-b-a-traiter.png",
    titre: "À traiter",
    route: "/commandes/a-traiter",
    note: "Le hub : les commandes qui demandent une action avant l'expédition, avec le total affiché et la source des données.",
  },
  {
    fichier: "18-ventes-b-en-attente.png",
    titre: "En attente",
    route: "/commandes/a-traiter/en-attente",
    note: "Préparation non confirmée : la commande n'est pas encore emballée.",
  },
  {
    fichier: "19-ventes-b-pretes-a-expedier.png",
    titre: "Prêtes à expédier",
    route: "/commandes/a-traiter/pretes-a-expedier",
    note: "Colis prêts, en attente d'une étiquette d'expédition.",
  },
  {
    fichier: "16-ventes-a-historique.png",
    titre: "Toutes les commandes",
    route: "/commandes",
    note: "L'historique complet, filtrable par période, boutique et statut.",
  },
  {
    fichier: "02-tableau-de-bord-agregat.png",
    titre: "Tableau de bord — agrégat",
    route: "/dashboard?boutique=toutes",
    note: "Le pilotage avec un périmètre explicite : une boutique hors périmètre produit un refus affiché, jamais un tableau vide.",
  },
  {
    fichier: "08-refus-perimetre.png",
    titre: "Refus de périmètre",
    route: "/dashboard?boutique=<inconnu>",
    note: "L'isolation est visible par l'utilisateur, pas seulement vérifiée côté serveur.",
  },
  {
    fichier: "26-mobile-ventes-a-traiter.png",
    titre: "Mobile — À traiter",
    route: "/commandes/a-traiter",
    note: "Le même contenu sur téléphone.",
  },
];

await mkdir("docs", { recursive: true });

const cartes = [];
for (const ecran of ECRANS) {
  const chemin = join(CAPTURES, ecran.fichier);
  let dataUri;
  try {
    const buffer = await readFile(chemin);
    dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    console.warn(`capture absente : ${chemin}`);
    continue;
  }
  cartes.push(
    JSON.stringify({
      titre: ecran.titre,
      route: ecran.route,
      note: ecran.note,
      image: dataUri,
    }),
  );
}

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOUT EN UN — Démonstration</title>
<style>
  :root {
    --bleu: #2563eb;
    --encre: #0f172a;
    --gris: #64748b;
    --bord: #e2e8f0;
    --fond: #f8fafc;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--fond);
    color: var(--encre);
    line-height: 1.6;
  }
  header {
    background: linear-gradient(135deg, #1e3a8a, #2563eb);
    color: #fff;
    padding: 40px 24px;
    text-align: center;
  }
  header h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.02em; }
  header p { margin: 0; opacity: 0.92; font-size: 15px; }
  header .badge {
    display: inline-block; margin-top: 14px; padding: 5px 14px;
    background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.3);
    border-radius: 999px; font-size: 13px;
  }
  main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }
  .intro {
    background: #fff; border: 1px solid var(--bord); border-radius: 12px;
    padding: 20px 24px; margin-bottom: 32px;
  }
  .intro h2 { margin: 0 0 8px; font-size: 18px; }
  .intro ul { margin: 10px 0 0; padding-left: 20px; color: var(--gris); font-size: 14px; }
  .intro li { margin-bottom: 4px; }
  .ecran {
    background: #fff; border: 1px solid var(--bord); border-radius: 12px;
    overflow: hidden; margin-bottom: 28px;
  }
  .ecran header {
    all: unset; display: block; padding: 16px 20px;
    background: #fff; border-bottom: 1px solid var(--bord);
  }
  .ecran .titre { font-size: 17px; font-weight: 700; margin: 0 0 2px; }
  .ecran .route {
    display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; color: var(--bleu); background: #eff6ff;
    border: 1px solid #bfdbfe; border-radius: 6px; padding: 1px 7px;
  }
  .ecran .note { margin: 10px 0 0; font-size: 14px; color: var(--gris); }
  .ecran .shot { padding: 14px; background: #eef2f7; }
  .ecran img { width: 100%; display: block; border-radius: 8px; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
  footer { text-align: center; color: var(--gris); font-size: 13px; padding: 0 20px 40px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>TOUT EN UN — Business Manager</h1>
  <p>Démonstration du module « Ventes &amp; Commandes » sur les données réelles (2 boutiques Jumia, 320 commandes, 337 articles)</p>
  <span class="badge">Captures du build de production · 26/11/2026</span>
</header>
<main>
  <section class="intro">
    <h2>Ce que montrent ces écrans</h2>
    <ul>
      <li>« Factures à imprimer » a été remplacé par <strong>« Étiquettes à imprimer »</strong> : le Vendor Center API ne fournit pas de factures, l'interface n'en invente donc aucune.</li>
      <li>Les étiquettes sont les <strong>documents d'expédition fournis par Jumia</strong> : PDF téléchargé tel quel, empreinte SHA-256 vérifiée.</li>
      <li>Trois états distincts et jamais confondus : <strong>disponible</strong>, <strong>pas encore disponible</strong>, <strong>refus Jumia</strong> (code et message exacts).</li>
      <li>Les compteurs sont à <strong>0</strong> parce qu'aucun article réel n'est à l'état <code>READY_TO_SHIP</code> sans numéro de suivi — c'est un fait de la donnée, pas une limite du code.</li>
    </ul>
  </section>
${cartes.map((brut) => { const c = JSON.parse(brut); return `<section class="ecran">
  <header>
    <p class="titre">${c.titre.replace(/"/g, "&quot;")}</p>
    <span class="route">${c.route.replace(/"/g, "&quot;")}</span>
    <p class="note">${c.note.replace(/"/g, "&quot;")}</p>
  </header>
  <div class="shot"><img alt="${c.titre.replace(/"/g, "&quot;")}" src="${c.image}" /></div>
</section>`; }).join("\n")}
</main>
<footer>
  Application réelle, base réelle, API Jumia réelle — aucune donnée factice dans les écrans ci-dessus.
</footer>
</body>
</html>
`;

await writeFile(OUT, html, "utf-8");
console.log(`Démonstration écrite : ${OUT} (${(html.length / 1024 / 1024).toFixed(1)} Mo)`);
