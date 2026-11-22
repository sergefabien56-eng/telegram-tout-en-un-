import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { roleHasPermission } from "@/lib/permissions";
import {
  changeMemberRole,
  createShop,
  getShopDetail,
  inviteMember,
  listMembers,
  removeMember,
  updateShop,
} from "@/lib/shops";
import { eq } from "drizzle-orm";

/** Tests d'intégration boutiques/membres sur la base réelle (ignorés en CI). */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("boutiques & permissions (base réelle)", () => {
  const suffix = Date.now();
  const ownerEmail = `owner-${suffix}@exemple.ci`;
  const memberEmail = `member-${suffix}@exemple.ci`;
  const strangerEmail = `stranger-${suffix}@exemple.ci`;
  let ownerId = "";
  let memberId = "";
  let shopId = "";

  beforeAll(async () => {
    const db = getDb();
    const a = await db
      .insert(schema.users)
      .values({
        email: ownerEmail,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Propriétaire Test",
      })
      .returning({ id: schema.users.id });
    const b = await db
      .insert(schema.users)
      .values({
        email: memberEmail,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Membre Test",
      })
      .returning({ id: schema.users.id });
    ownerId = a[0]?.id ?? "";
    memberId = b[0]?.id ?? "";
  });

  it("crée une boutique et attribue le rôle owner", async () => {
    const shop = await createShop(ownerId, {
      name: "Ma Boutique Test",
      platform: "jumia",
      externalShopId: `SHOP-${suffix}`,
      country: "CI",
      currency: "XOF",
    });
    shopId = shop.id;
    expect(shop.status).toBe("pending");
    expect((await getShopDetail(ownerId, shopId))?.role).toBe("owner");
  });

  it("un inconnu n'a pas accès à la boutique", async () => {
    expect(await getShopDetail(memberId, shopId)).toBeNull();
  });

  it("invite un membre existant → ajout immédiat", async () => {
    const result = await inviteMember(ownerId, shopId, memberEmail, "assistant");
    expect(result).toEqual({ ok: true, status: "added", userId: memberId });
    expect((await getShopDetail(memberId, shopId))?.role).toBe("assistant");
  });

  it("invite un e-mail inconnu → invitation en attente", async () => {
    const result = await inviteMember(ownerId, shopId, strangerEmail, "stock");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe("pending");
  });

  it("un rôle assistant ne peut pas modifier la boutique", async () => {
    await expect(updateShop(memberId, shopId, { name: "Modifié sans droit" })).rejects.toThrow(
      /Permission insuffisante/,
    );
  });

  it("l'assistant ne peut pas retirer de membre", async () => {
    const result = await removeMember(memberId, shopId, memberId);
    expect(result.ok).toBe(false);
  });

  it("l'owner ne peut pas se retirer lui-même", async () => {
    const result = await removeMember(ownerId, shopId, ownerId);
    expect(result.ok).toBe(false);
  });

  it("l'owner ne peut pas être rétrogradé", async () => {
    const result = await changeMemberRole(ownerId, shopId, ownerId, "manager");
    expect(result.ok).toBe(false);
  });

  it("liste les membres", async () => {
    const members = await listMembers(shopId);
    expect(members.map((m) => m.userId).sort()).toEqual([ownerId, memberId].sort());
  });

  it("propriété des permissions", () => {
    expect(roleHasPermission("assistant", "shops:write")).toBe(false);
    expect(roleHasPermission("assistant", "orders:read")).toBe(true);
    expect(roleHasPermission("manager", "shops:write")).toBe(true);
    expect(roleHasPermission("owner", "finance:write")).toBe(true);
  });

  it("nettoie les données de test", async () => {
    const db = getDb();
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.shopInvites).where(eq(schema.shopInvites.shopId, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    await db.delete(schema.users).where(eq(schema.users.id, memberId));
    expect(true).toBe(true);
  });
});
