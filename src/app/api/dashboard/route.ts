import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listUserShops } from "@/lib/shops";
import { dashboardOverview } from "@/lib/dashboard";

/** GET /api/dashboard?days=30 — indicateurs réels de l'espace. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const daysRaw = Number(new URL(request.url).searchParams.get("days") ?? "30");
  const days = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 90 ? daysRaw : 30;

  // Le tableau de bord exige au moins une boutique accessible.
  const shops = await listUserShops(user.id);
  if (shops.length === 0) return fail(409, "Aucune boutique accessible.");

  return ok({ overview: await dashboardOverview(user.id, days) });
}
