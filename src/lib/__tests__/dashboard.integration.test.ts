import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { dashboardOverview } from "@/lib/dashboard";

/** Tableau de bord sur la base réelle (ignoré en CI). */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("tableau de bord (base réelle)", () => {
  it("agrége les ventes et le catalogue sans inventer de valeur", async () => {
    const db = getDb();
    const [shop] = await db.select().from(schema.shops);
    if (!shop) throw new Error("Aucune boutique en base de test.");
    const owner = (
      await db.select().from(schema.users).where(eq(schema.users.id, shop.ownerUserId))
    )[0];
    if (!owner) throw new Error("Aucun propriétaire en base de test.");

    const overview = await dashboardOverview(owner.id, 30);
    expect(overview.period.days).toBe(30);
    expect(overview.shops.length).toBeGreaterThan(0);

    // Les KPI proviennent des commandes : on retrouve le même total que le
    // rapport seul, ce qui prouve qu'aucun chiffre n'est doublé ni estimé.
    const { reportSales } = await import("@/lib/reports");
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86_400_000);
    from.setUTCHours(0, 0, 0, 0);
    const sales = await reportSales(
      shop.id,
      { from, to },
      {
        statusFilter: ["DELIVERED", "SHIPPED"],
      },
    );
    expect(overview.kpis.revenueMinor).toBe(sales.totals.revenueMinor);
    expect(overview.kpis.orders).toBe(sales.totals.orders);
  });

  it("renvoie une vue vide pour un utilisateur sans boutique", async () => {
    const overview = await dashboardOverview("00000000-0000-0000-0000-000000000000");
    expect(overview.shops).toHaveLength(0);
    expect(overview.alerts).toHaveLength(0);
    expect(overview.kpis.revenueMinor).toBe(0);
  });
});
