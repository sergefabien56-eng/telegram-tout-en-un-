import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { accountIdForShop } from "@/lib/jumia/accounts";
import { syncShopLabels } from "@/lib/labels-sync";
import { countPrintableItems } from "@/lib/order-items";

/**
 * Génération d'étiquettes sur une boutique **réellement rattachée** à Jumia.
 *
 * La règle d'éligibilité est celle de l'API : un article livrable
 * (`PENDING` ou `READY_TO_SHIP`) **dont l'étiquette n'a pas encore été
 * obtenue**. Le test vérifie la propriété qui compte :
 *
 * - après l'opération, **aucun** article éligible ne reste sans étiquette ;
 * - une seconde passe **ne crée aucune étiquette supplémentaire** : un
 *   colis déjà imprimé n'est jamais réimprimé chez Jumia.
 *
 * Le test est ignoré si l'environnement n'a aucun compte vendeur Jumia
 * (CI sans identifiants) : il n'y a alors rien à prouver.
 */
describe("génération d'étiquettes sur boutique réelle", () => {
  it("n'imprime jamais deux fois la même étiquette", async () => {
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

    expect(result.ok).toBe(true);
    // Après l'opération, plus aucun article n'est éligible : chaque colis
    // livrable a reçu son étiquette.
    expect(await countPrintableItems([shop.id])).toBe(0);

    // Seconde passe : aucune étiquette supplémentaire, aucun nouvel
    // engagement d'impression chez Jumia.
    const relance = await syncShopLabels({
      userId: shop.ownerUserId,
      shopId: shop.id,
    });
    const after = await db
      .select({ id: schema.shipmentLabels.id })
      .from(schema.shipmentLabels);

    expect(relance.ok).toBe(true);
    expect(relance.items).toBe(0);
    expect(relance.packages).toBe(0);
    expect(after.length).toBe(before.length);
  });
});
