/**
 * Synchronise les relevés de versement Jumia d'une boutique.
 *
 *   DATABASE_URL=… npx vite-node --config vitest.config.ts scripts/sync-shop-payments.ts <shopId>
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t
    .slice(i + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (process.env[k] === undefined) process.env[k] = v;
}

import { eq } from "drizzle-orm";

const shopId = process.argv[2];
if (!shopId) {
  console.error("Usage: npx vite-node scripts/sync-shop-payments.ts <shopId>");
  process.exit(1);
}

const { getDb, schema } = await import("../src/db/index");
const db = getDb();
const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
if (!shop) throw new Error("Boutique introuvable.");

const { syncShopPayments } = await import("../src/lib/payments-sync");
console.log(`Synchronisation des relevés de « ${shop.name} »…`);
const result = await syncShopPayments({ userId: shop.ownerUserId, shopId: shop.id });
console.log(JSON.stringify(result, null, 1));
