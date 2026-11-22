import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listPendingInvites } from "@/lib/shops";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/invites — invitations en attente. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");

  return ok(await listPendingInvites(id));
}
