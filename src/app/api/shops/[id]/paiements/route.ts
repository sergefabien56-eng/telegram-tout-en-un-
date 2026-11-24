import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listPayoutStatements, sumStatements } from "@/lib/payments";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/paiements — relevés Jumia enregistrés dans la base. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("finance:read")) {
    return fail(403, "Permission insuffisante pour consulter les finances.");
  }

  const rows = await listPayoutStatements(id, 50);
  return ok({ statements: rows, totals: sumStatements(rows) });
}
