/**
 * Test de bout en bout des boutiques et permissions (API réelle).
 * Usage : node scripts/shops-smoke.mjs [base_url]
 * Nécessite DATABASE_URL pour le nettoyage.
 */
const BASE = process.env.BASE_URL ?? process.argv[2] ?? "http://localhost:3000";

const suffix = Date.now();
const ownerEmail = `smoke-owner-${suffix}@exemple.ci`;
const memberEmail = `smoke-member-${suffix}@exemple.ci`;
const PASSWORD = "MotDePasse123";

let pass = 0;
let fail = 0;
function check(label, ok) {
  console.log(`${ok ? "OK  " : "ÉCHEC"}: ${label}`);
  if (ok) pass += 1;
  else fail += 1;
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, payload, cookie: response.headers.get("set-cookie") };
}

function cookieFrom(setCookie) {
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}

async function register(email) {
  const result = await api("/api/auth/register", {
    method: "POST",
    body: { email, password: PASSWORD, fullName: email },
  });
  return { ...result, cookie: cookieFrom(result.cookie) };
}

const owner = await register(ownerEmail);
check(`inscription owner -> 201`, owner.status === 201);

const member = await register(memberEmail);
check(`inscription membre -> 201`, member.status === 201);

const created = await api("/api/shops", {
  method: "POST",
  cookie: owner.cookie,
  body: {
    name: "Boutique Smoke",
    platform: "jumia",
    externalShopId: `SMOKE-${suffix}`,
    country: "CI",
    currency: "XOF",
  },
});
check(`création boutique -> 201`, created.status === 201);
const shopId = created.payload?.data?.id;
check(`id boutique présent`, Boolean(shopId));

const list = await api("/api/shops", { cookie: owner.cookie });
check(`liste contient la boutique`, (list.payload?.data ?? []).some((s) => s.id === shopId));
check(`rôle owner renvoyé`, list.payload?.data?.[0]?.role === "owner");

const detail = await api(`/api/shops/${shopId}`, { cookie: owner.cookie });
check(`détail accessible (owner)`, detail.status === 200 && detail.payload?.data?.role === "owner");

const denied = await api(`/api/shops/${shopId}`, { cookie: member.cookie });
check(`membre non invité -> 404/403`, denied.status === 404 || denied.status === 403);

const invite = await api(`/api/shops/${shopId}/members`, {
  method: "POST",
  cookie: owner.cookie,
  body: { email: memberEmail, role: "assistant" },
});
check(`invitation -> 201 ajout immédiat`, invite.status === 201 && invite.payload?.data?.status === "added");

const members = await api(`/api/shops/${shopId}/members`, { cookie: owner.cookie });
check(`2 membres listés`, members.payload?.data?.length === 2);

const patchDenied = await api(`/api/shops/${shopId}`, {
  method: "PATCH",
  cookie: member.cookie,
  body: { name: "Modification interdite" },
});
check(`assistant ne peut pas modifier -> 403`, patchDenied.status === 403);

const disconnect = await api(`/api/shops/${shopId}/disconnect`, {
  method: "POST",
  cookie: owner.cookie,
});
check(`déconnexion boutique -> 200`, disconnect.status === 200);

// Nettoyage
try {
  const { Client } = await import("pg");
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (connectionString) {
    const client = new Client({ connectionString });
    await client.connect();
    const shop = await client.query("select owner_user_id as id from shops where id=$1", [shopId]);
    await client.query("delete from shops where id=$1", [shopId]);
    await client.query("delete from users where email = ANY($1)", [[ownerEmail, memberEmail]]);
    if (shop.rows[0]) await client.query("delete from users where id=$1", [shop.rows[0].id]);
    // Filet de sécurité : aucun compte de test ne doit rester en production.
    await client.query(
      "delete from users where email like 'smoke-%@exemple.ci' or email like 'tg-smoke-%@exemple.ci'",
    );
    await client.query("delete from audit_logs a where a.user_id is not null and not exists (select 1 from users u where u.id=a.user_id)");
    await client.query("delete from notifications n where not exists (select 1 from users u where u.id=n.user_id)");
    await client.end();
    console.log("Nettoyage base effectué.");
  }
} catch (error) {
  console.log("Nettoyage ignoré :", error instanceof Error ? error.message : error);
}

console.log(`\n=== RÉSULTAT : ${pass} OK / ${fail} ÉCHEC ===`);
process.exit(fail === 0 ? 0 : 1);
