import { after } from "next/server";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { getDb, schema } from "@/db";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { JumiaError } from "@/lib/jumia/client";
import { isOwnedBy, resolveDefaultAccount } from "@/lib/jumia/accounts";
import { listRemoteShops } from "@/lib/jumia/shops";
import { syncShopFullyInBackground } from "@/lib/full-sync";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shops/:id/jumia-link — rattache la boutique à une boutique Jumia.
 *
 * Vérifications : permission `shops:write` sur la boutique, identifiant distant
 * réellement renvoyé par Jumia, unicité du rattachement. Idempotent : rattacher
 * deux fois la même boutique ne crée pas de doublon.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("shops:write")) return fail(403, "Permission insuffisante.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }
  const raw = body as { remoteShopId?: unknown; accountId?: unknown };
  const remoteShopId = typeof raw?.remoteShopId === "string" ? raw.remoteShopId.trim() : "";
  const accountId = typeof raw?.accountId === "string" ? raw.accountId.trim() : "";
  if (!remoteShopId) return fail(422, "Identifiant de boutique Jumia manquant.");

  // Compte vendeur utilisé : celui choisi à l'écran, sinon le compte déjà
  // rattaché à la boutique, sinon le premier compte enregistré, sinon
  // l'identifiant historique unique.
  let scope: { accountId: string } | undefined;
  if (accountId) {
    const owned = await getDb()
      .select({ id: schema.jumiaAccounts.id })
      .from(schema.jumiaAccounts)
      .where(eq(schema.jumiaAccounts.id, accountId))
      .limit(1);
    const mine = owned[0];
    if (!mine || !(await isOwnedBy(user.id, accountId))) {
      return fail(403, "Ce compte Jumia ne vous appartient pas.");
    }
    scope = { accountId: mine.id };
  } else {
    const fallback = await resolveDefaultAccount(user.id, id);
    scope = fallback ? { accountId: fallback } : undefined;
  }

  // Le rattachement doit pointer vers une boutique qui existe réellement.
  let remote;
  try {
    const shops = await listRemoteShops(scope);
    remote = shops.find((shop) => shop.id === remoteShopId) ?? null;
  } catch (error) {
    return fail(
      502,
      error instanceof JumiaError ? error.message : "Lecture des boutiques Jumia impossible.",
    );
  }
  if (!remote) return fail(404, "Cette boutique n'existe pas sur le compte Jumia.");

  const country = remote.countries[0]?.code ?? null;

  try {
    const updated = await getDb()
      .update(schema.shops)
      .set({
        remoteShopId: remote.id,
        remoteShopName: remote.name,
        remoteLinkedAt: new Date(),
        country: country ?? undefined,
        jumiaAccountId: scope?.accountId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.shops.id, id))
      .returning();

    await audit({
      action: "shop.jumia_linked",
      result: "success",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { remoteShopId: remote.id, remoteShopName: remote.name },
    });

    // Boutique rattachée : on récupère tout de suite ses données réelles
    // (catalogue, commandes, relevés) pour qu'elle ne s'affiche pas à zéro.
    after(async () => {
      await syncShopFullyInBackground({ userId: user.id, shopId: id, days: 90 });
    });

    return ok(updated[0] ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("shops_remote_shop_idx") || message.includes("unique")) {
      await audit({
        action: "shop.jumia_linked",
        result: "blocked",
        userId: user.id,
        entityType: "shop",
        entityId: id,
        metadata: { reason: "already_linked", remoteShopId: remote.id },
      });
      return fail(409, "Cette boutique Jumia est déjà rattachée à une autre boutique locale.");
    }
    return fail(500, "Rattachement impossible.", [message]);
  }
}

/** DELETE /api/shops/:id/jumia-link — supprime le rattachement (données conservées). */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("shops:write")) return fail(403, "Permission insuffisante.");

  const updated = await getDb()
    .update(schema.shops)
    .set({
      remoteShopId: null,
      remoteShopName: null,
      remoteLinkedAt: null,
      jumiaAccountId: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, id))
    .returning();

  await audit({
    action: "shop.jumia_unlinked",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
  });

  return ok(updated[0] ?? null);
}
