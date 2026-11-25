import { eq } from "drizzle-orm";
import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shops/:id/disconnect — déconnecte la boutique de son Seller
 * Center (permission `shops:write`).
 *
 * Avant, cette route ne posait qu'un statut (« déconnecté ») sans rien
 * débrancher : la boutique continuait de lire son compte Jumia et d'afficher
 * un état vert trompeur. La déconnexion est ici **réelle** : le lien distant
 * et le compte vendeur lié sont retirés.
 *
 * Les **données déjà synchronisées sont conservées** (elles appartiennent à
 * la boutique) ; elles ne sont simplement plus rafraîchies. La boutique
 * repasse en état factuel « non rattachée ».
 */
export async function POST(_request: Request, { params }: Params) {
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

  if (!updated[0]) return fail(404, "Boutique introuvable.");

  await audit({
    action: "shop.disconnected",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
    metadata: { remoteShopId: null, jumiaAccountId: null, dataPreserved: true },
  });
  return ok(updated[0]);
}
