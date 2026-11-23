import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { searchUserShops } from "@/lib/search";

/** GET /api/search?q=… — recherche globale (boutiques accessibles). */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (query.trim().length < 2) {
    return ok({ query, shops: [], message: "Saisis au moins 2 caractères." });
  }

  const shops = await searchUserShops(user.id, query);
  return ok({ query, shops, message: shops.length === 0 ? "Aucun résultat." : null });
}
