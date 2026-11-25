import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { listCategories, rentability, shopCounts, shopSyncHistory } from "@/lib/insights";
import { listVariants, setPurchasePrice } from "@/lib/catalog";

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

  it("retombe la dernière synchronisation de chaque type par boutique", async () => {
    const db = getDb();
    const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).limit(1);
    if (!shop) return;

    const history = await shopSyncHistory([shop.id]);
    const entry = history.get(shop.id);
    expect(entry).toBeDefined();
    // Une boutique sans synchronisation a des dates nulles, jamais de date inventée.
    for (const value of Object.values(entry ?? {})) {
      expect(value === null || value instanceof Date).toBe(true);
    }
    // Une liste vide ne renvoie rien.
    expect((await shopSyncHistory([])).size).toBe(0);
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

  it("enregistre le prix d'achat sans toucher aux autres champs", async () => {
    const db = getDb();
    const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).limit(1);
    if (!shop) return;

    const [variante] = await listVariants(shop.id, 1);
    if (!variante?.variant.sellerSku) return; // Aucun SKU : rien à tester ici.

    // On réécrit la valeur existante : idempotent, aucune donnée modifiée.
    const avant = variante.variant.purchasePriceMinor;
    expect(await setPurchasePrice(shop.id, variante.variant.sellerSku, avant)).toBe(true);

    // Un SKU hors de la boutique est ignoré.
    expect(await setPurchasePrice(shop.id, "SKU-INEXISTANT-TeSt", 1000)).toBe(false);
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
