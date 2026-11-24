import { existsSync, readFileSync } from "node:fs";

/**
 * Synchronisation ponctuelle des commandes d'une boutique.
 *
 * Usage :
 *   DATABASE_URL=… npx vite-node scripts/sync-shop-orders.ts <shopId> [jours]
 *
 * Le script réutilise exactement le code de l'application (authentification,
 * backoff, upsert idempotent) : il ne sert qu'à déclencher une première
 * synchronisation sans passer par l'écran.
 */

function loadEnvLocal() {
  const file = ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const [shopId, daysRaw] = process.argv.slice(2);
  if (!shopId) {
    console.error("Usage : npx vite-node scripts/sync-shop-orders.ts <shopId> [jours]");
    process.exit(2);
  }
  const days = Number(daysRaw ?? 30);

  const { getDb, schema } = await import("../src/db/index");
  const { eq } = await import("drizzle-orm");
  const { syncShopOrders } = await import("../src/lib/orders-sync");

  const db = getDb();
  const rows = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      ownerUserId: schema.shops.ownerUserId,
      remoteShopId: schema.shops.remoteShopId,
    })
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1);
  const shop = rows[0];
  if (!shop) {
    console.error(`Boutique introuvable : ${shopId}`);
    process.exit(1);
  }
  if (!shop.remoteShopId) {
    console.error(`Boutique non rattachée à Jumia : ${shop.name}`);
    process.exit(1);
  }

  console.log(`Synchronisation de « ${shop.name} » sur ${days} jour(s)…`);
  const result = await syncShopOrders({ userId: shop.ownerUserId, shopId: shop.id, days });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

void main();
