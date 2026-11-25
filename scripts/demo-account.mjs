/**
 * Prépare un compte de démonstration pour les captures d'écran.
 *
 * Le harnais E2E purge tous les comptes `@exemple.ci` : le compte de
 * démonstration doit donc être (re)créé juste avant la génération des
 * captures. Il ne modifie **aucune** donnée existante : il n'est que membre
 * des boutiques déjà présentes, avec le rôle `owner` (celui du propriétaire).
 *
 * Usage : node scripts/demo-account.mjs
 */
import pg from "pg";

const EMAIL = process.env.DEMO_EMAIL ?? "demo-captures@exemple.ci";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Captures2026!";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL absente.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

// 1. Création du compte via l'API (le mot de passe est haché par l'application).
const base = process.env.BASE_URL ?? "http://localhost:3000";
const register = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, fullName: "Démo Captures" }),
});
const registerBody = await register.json().catch(() => ({}));
if (!register.ok && registerBody?.error !== "already") {
  console.error("Inscription impossible :", JSON.stringify(registerBody));
}

// 2. Rattachement aux boutiques existantes, avec le rôle du propriétaire.
const user = await client.query(`SELECT id FROM users WHERE email = $1`, [EMAIL]);
const userId = user.rows[0]?.id;
if (!userId) {
  console.error("Compte introuvable après inscription.");
  await client.end();
  process.exit(1);
}

const shops = await client.query(`SELECT id, name FROM shops`);
for (const shop of shops.rows) {
  await client.query(
    `INSERT INTO shop_members (shop_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (shop_id, user_id) DO UPDATE SET role = 'owner'`,
    [shop.id, userId],
  );
}

console.log(`Compte de démonstration prêt : ${EMAIL}`);
console.log(`Boutiques rattachées : ${shops.rows.map((s) => s.name).join(", ") || "aucune"}`);
await client.end();
