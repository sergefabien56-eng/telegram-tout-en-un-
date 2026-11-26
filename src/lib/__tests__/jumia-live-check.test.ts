import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { testJumiaAccount } from "@/lib/jumia/accounts";
import { syncShopOrders } from "@/lib/orders-sync";

/**
 * Contrôle de bout en bout contre l'**API Jumia réelle**.
 *
 * Ce test vérifie que la refonte de la base (`jumiaApiBase()`) n'a rien
 * cassé : on valide le refresh token stocké contre l'API officielle, puis on
 * lance une vraie synchronisation de commandes sur une boutique rattachée.
 *
 * Test manuel (`JUMIA_LIVE=1`) : il consomme du quota de lecture Jumia.
 */
describe("connexion réelle à Jumia", () => {
  const live = process.env.JUMIA_LIVE === "1";

  it.skipIf(!live)("valide les refresh tokens stockés", async () => {
    const db = getDb();
    const comptes = await db
      .select({
        id: schema.jumiaAccounts.id,
        label: schema.jumiaAccounts.label,
        ownerUserId: schema.jumiaAccounts.ownerUserId,
      })
      .from(schema.jumiaAccounts);

    expect(comptes.length).toBeGreaterThan(0);
    for (const compte of comptes) {
      const result = await testJumiaAccount(compte.ownerUserId, compte.id);
      console.log(
        `  ${compte.label} → ${result.ok ? "OK" : "ÉCHEC"} ${JSON.stringify(result).slice(0, 200)}`,
      );
      expect(result.ok).toBe(true);
    }
  });

  it.skipIf(!live)("synchronise réellement les commandes d'une boutique", async () => {
    const db = getDb();
    const boutique = (
      await db
        .select()
        .from(schema.shops)
        .where(sql`${schema.shops.remoteShopId} is not null`)
        .limit(1)
    )[0];
    expect(boutique).toBeDefined();
    if (!boutique) throw new Error("boutique introuvable");

    const result = await syncShopOrders({
      userId: boutique.ownerUserId,
      shopId: boutique.id,
      days: 30,
    });
    console.log(
      `  ${boutique.name} → ok=${result.ok} commandes=${result.orders} insérées=${result.inserted} mises à jour=${result.updated} pages=${result.pages} partiel=${result.partial}`,
    );
    expect(result.ok).toBe(true);
    // La lecture des articles doit avoir eu lieu elle aussi.
    expect(result.items).toBeGreaterThan(0);
  });
});
