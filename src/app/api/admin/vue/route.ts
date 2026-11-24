import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { adminOverview, hasAdminAccess } from "@/lib/admin";

/** GET /api/admin/vue — agrégats d'administration (permission admin:read). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  if (!(await hasAdminAccess(user.id))) {
    return fail(403, "Permission insuffisante pour l'administration.");
  }

  const overview = await adminOverview(user.id);
  return ok({ overview });
}
