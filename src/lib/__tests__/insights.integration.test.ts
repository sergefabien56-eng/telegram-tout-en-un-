import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { listCategories, rentability, shopCounts } from "@/lib/insights";

/** Agrégats de consultation sur la base réelle (ignorés en CI). */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("informations de gestion (base réelle)", () => {
  it("compte des volumes par boutique sans jamais estimer", async () => {
    const db = getDb();
    const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).limit(1);
    if (!shop) return;

    const counts = await shopCounts([shop.id]);
    expect(counts.get(shop.id)).toBeDefined();
    const total = counts.get(shop.id);
    expect(total && total.orders >= 0).toBe(true);
    // Une boutique inconnue reste à zéro.
    const vide = await shopCounts([]);
    expect(vide.size).toBe(0);
  });

  it("regroupe les catégories réellement présentes", async () => {
    const db = getDb();
    const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).limit(1);
    if (!shop) return;

    const rows = await listCategories([shop.id]);
    for (const row of rows) {
      expect(row.products).toBeGreaterThan(0);
    }
  });

  it("additionne les relevés sans mélanger les devises", async () => {
    const db = getDb();
    const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).limit(1);
    if (!shop) return;

    const rows = await rentability([shop.id]);
    expect(rows.length).toBeLessThanOrEqual(1);
    const row = rows[0];
    if (row) {
      expect(Number.isFinite(row.revenueMinor)).toBe(true);
      // Devise unique ou vide (jamais de total mixte).
      expect(row.currency === "" || ["XOF", "USD", "EUR"].includes(row.currency)).toBe(true);
    }
  });
});
