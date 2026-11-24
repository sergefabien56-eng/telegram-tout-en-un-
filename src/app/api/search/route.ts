import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { searchUserShops } from "@/lib/search";
import { searchSpace } from "@/lib/dashboard";

/** GET /api/search?q=… — recherche globale (boutiques accessibles). */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (query.trim().length < 2) {
    return ok({ query, shops: [], message: "Saisis au moins 2 caractères." });
  }

  const [shops, space] = await Promise.all([
    searchUserShops(user.id, query),
    searchSpace(user.id, query),
  ]);
  const total = shops.length + space.products.length;
  return ok({
    query,
    shops,
    products: space.products,
    message: total === 0 ? "Aucun résultat dans vos boutiques accessibles." : null,
  });
}
