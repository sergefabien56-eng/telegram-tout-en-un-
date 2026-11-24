import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { adminOverview, hasAdminAccess } from "@/lib/admin";

/** Vue d'administration sur la base réelle (ignorée en CI). */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("administration (base réelle)", () => {
  it("retourne des agrégats cohérents pour le propriétaire", async () => {
    const db = getDb();
    // On cible un propriétaire de boutique, pas le premier utilisateur venu :
    // les passes de tests précédentes peuvent laisser des comptes en base.
    const owners = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(
        schema.shopMembers,
        and(eq(schema.shopMembers.userId, schema.users.id), eq(schema.shopMembers.role, "owner")),
      )
      .limit(1);
    const [owner] = owners;
    if (!owner) throw new Error("Aucun propriétaire de boutique en base de test.");

    expect(await hasAdminAccess(owner.id)).toBe(true);

    const overview = await adminOverview(owner.id);
    expect(overview.shops.total).toBeGreaterThan(0);
    expect(overview.shops.rows.every((row) => typeof row.name === "string")).toBe(true);
    expect(overview.members.length).toBeGreaterThan(0);
    expect(overview.audit.length).toBeGreaterThan(0);
  });

  it("n'expose aucune boutique à un utilisateur sans accès", async () => {
    const inconnu = "00000000-0000-0000-0000-000000000000";
    expect(await hasAdminAccess(inconnu)).toBe(false);
    const overview = await adminOverview(inconnu);
    expect(overview.shops.total).toBe(0);
    expect(overview.audit).toHaveLength(0);
  });
});
