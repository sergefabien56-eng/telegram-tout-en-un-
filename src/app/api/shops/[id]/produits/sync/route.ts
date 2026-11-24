import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { syncShopCatalog, type CatalogSyncKind } from "@/lib/catalog-sync";

type Params = { params: Promise<{ id: string }> };

const KINDS: CatalogSyncKind[] = ["products", "stocks", "all"];

/**
 * POST /api/shops/:id/produits/sync — synchronise le catalogue et/ou les stocks.
 *
 * `kind` : `products` (products:write), `stocks` (inventory:write),
 * `all` (l'une des deux suffit, la plus permissive des deux permissions).
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");

  let kind: CatalogSyncKind = "all";
  try {
    const body = (await request.json()) as { kind?: unknown };
    if (typeof body?.kind === "string" && KINDS.includes(body.kind as CatalogSyncKind)) {
      kind = body.kind as CatalogSyncKind;
    }
  } catch {
    // corps vide : synchronisation complète
  }

  // « all » accepte l'une ou l'autre des deux permissions ; les cibles
  // précises exigent la leur.
  const allowed =
    kind === "products"
      ? access.permissions.has("products:write")
      : kind === "stocks"
        ? access.permissions.has("inventory:write")
        : access.permissions.has("products:write") || access.permissions.has("inventory:write");

  if (!allowed) {
    return fail(403, "Permission insuffisante pour cette synchronisation.");
  }

  const result = await syncShopCatalog({
    userId: user.id,
    shopId: id,
    kind,
    requestMeta: { ip: requestIp(request), userAgent: requestUserAgent(request) },
  });

  if (!result.ok) {
    const running = result.reason?.includes("déjà en cours");
    await audit({
      action: kind === "stocks" ? "shop.stocks_synced" : "shop.products_synced",
      result: "blocked",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.reason ?? "inconnue" },
    });
    const status = running || result.reason?.includes("rattachée") ? 409 : 502;
    return fail(status, result.reason ?? "Synchronisation impossible.");
  }

  return ok(result);
}
