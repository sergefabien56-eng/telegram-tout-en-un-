import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { accountIdForShop } from "@/lib/jumia/accounts";
import { syncShopLabels } from "@/lib/labels-sync";

/**
 * Génération d'étiquettes sur une boutique **réellement rattachée** à Jumia.
 *
 * Sûr par construction : la chaîne n'appelle `POST /orders/print-labels`
 * que s'il existe un article `READY_TO_SHIP` **sans numéro de suivi**.
 * L'inventaire live a établi qu'il n'y en a aucun : l'opération doit donc
 * se terminer sur 0, sans aucun engagement d'impression chez Jumia.
 *
 * Le test est ignoré si l'environnement n'a aucun compte vendeur Jumia
 * (CI sans identifiants) : il n'y a alors rien à prouver.
 */
describe("génération d'étiquettes sur boutique réelle", () => {
  it("ne déclenche aucune impression quand aucun article n'est éligible", async () => {
    const db = getDb();
    const shop = (
      await db
        .select()
        .from(schema.shops)
        .where(sql`${schema.shops.remoteShopId} is not null`)
        .limit(1)
    )[0];
    expect(shop).toBeDefined();
    if (!shop) throw new Error("boutique introuvable");

    // Sans compte vendeur rattaché, la chaîne ne peut pas aller jusqu'à
    // Jumia : le test n'a alors rien à vérifier.
    const accountId = await accountIdForShop(shop.id);
    if (!accountId) {
      console.log(`  ${shop.name} → aucun compte Jumia rattaché : test ignoré`);
      return;
    }

    const before = await db
      .select({ id: schema.shipmentLabels.id })
      .from(schema.shipmentLabels);

    const result = await syncShopLabels({
      userId: shop.ownerUserId,
      shopId: shop.id,
    });
    console.log(`  ${shop.name} → ${JSON.stringify(result)}`);

    const after = await db
      .select({ id: schema.shipmentLabels.id })
      .from(schema.shipmentLabels);

    expect(result.ok).toBe(true);
    // Aucun article éligible ⇒ aucune étiquette, aucun appel d'impression.
    expect(result.items).toBe(0);
    expect(result.packages).toBe(0);
    expect(after.length).toBe(before.length);
  });
});
