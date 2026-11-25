import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { businessClientCodeForShop } from "@/lib/jumia/accounts";
import {
  fetchAttributeSet,
  productCreationSchema,
  validateAgainstAttributeSet,
} from "@/lib/jumia/catalog-referentiel";
import { buildCreateFeedPayload, submitProductCreation } from "@/lib/jumia/product-feed";
import {
  createPublication,
  findExistingSku,
  listPublications,
  skuExistsInCatalog,
} from "@/lib/product-publications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/produits/publications — historique des envois. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("products:read")) {
    return fail(403, "Permission insuffisante (products:read).");
  }
  return ok({ publications: await listPublications(id) });
}

/**
 * POST /api/shops/:id/produits/publications — envoie une fiche produit à
 * Jumia.
 *
 * La création est **asynchrone** : la route renvoie l'état « demande
 * envoyée » avec l'identifiant du flux. Le produit ne sera « publié » que
 * lorsqu'il sera retrouvé au catalogue avec un contrôle qualité approuvé.
 *
 * Refus côté serveur : permission absente, boutique non rattachée, SKU déjà
 * envoyé, attributs obligatoires manquants ou invalides.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("products:write")) {
    await audit({
      action: "product.publication_requested",
      result: "blocked",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: "permission" },
    });
    return fail(403, "Permission insuffisante (products:write).");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = productCreationSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, parsed.error.issues[0]?.message ?? "Fiche produit invalide.");
  }
  const input = parsed.data;

  const shopRows = await getDb()
    .select({ remoteShopId: schema.shops.remoteShopId, name: schema.shops.name })
    .from(schema.shops)
    .where(eq(schema.shops.id, id))
    .limit(1);
  const shop = shopRows[0];
  if (!shop) return fail(404, "Boutique introuvable.");
  if (!shop.remoteShopId) {
    return fail(
      409,
      "Cette boutique n'est rattachée à aucune boutique Jumia : rattachez-la avant de publier un produit.",
    );
  }

  // Doublons : un SKU déjà envoyé ne doit pas être envoyé deux fois.
  const dejaEnvoye = await findExistingSku(id, input.sellerSku);
  if (dejaEnvoye) {
    return fail(
      409,
      `Le SKU « ${input.sellerSku} » a déjà été envoyé pour cette boutique (état : ${dejaEnvoye.status}).`,
    );
  }
  if (await skuExistsInCatalog(id, input.sellerSku)) {
    return fail(
      409,
      `Le SKU « ${input.sellerSku} » existe déjà dans le catalogue de cette boutique.`,
    );
  }

  // Attributs réellement exigés par Jumia pour la catégorie choisie.
  const categoryRows = await getDb()
    .select()
    .from(schema.jumiaCatalogCategories)
    .where(
      and(
        eq(schema.jumiaCatalogCategories.shopId, id),
        eq(schema.jumiaCatalogCategories.code, Number(input.categoryCode)),
      ),
    )
    .limit(1);
  const categorie = categoryRows[0];
  if (!categorie) {
    return fail(
      409,
      "Catégorie inconnue du référentiel : rafraîchissez le référentiel des catégories avant de publier.",
    );
  }
  if (!categorie.attributeSetSid) {
    return fail(422, "Catégorie sans ensemble d'attributs connu de Jumia.");
  }

  let attributes;
  try {
    attributes = await fetchAttributeSet({ shopId: id }, categorie.attributeSetSid);
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : "Lecture des attributs impossible.");
  }

  const controle = validateAgainstAttributeSet({
    attributes,
    values: input.attributes,
  });
  if (controle.missing.length > 0) {
    return fail(
      422,
      `Attributs obligatoires manquants pour cette catégorie : ${controle.missing
        .map((attribute) => attribute.name)
        .join(", ")}.`,
    );
  }
  if (controle.invalid.length > 0) {
    return fail(
      422,
      `Valeur d'attribut refusée : ${controle.invalid[0]?.attribute.name} — ${controle.invalid[0]?.reason}`,
    );
  }

  const businessClientCode = await businessClientCodeForShop(id);
  const payload = buildCreateFeedPayload({
    shopId: shop.remoteShopId,
    product: input,
    businessClientCode,
  });

  let feedId: string;
  try {
    const result = await submitProductCreation({ shopId: id }, payload);
    feedId = result.feedId;
  } catch (error) {
    await audit({
      action: "product.publication_requested",
      result: "failure",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        sellerSku: input.sellerSku,
        reason: error instanceof Error ? error.message.slice(0, 200) : "inconnue",
      },
    });
    return fail(502, error instanceof Error ? error.message : "Jumia n'a pas accepté la demande.");
  }

  const publication = await createPublication({
    shopId: id,
    userId: user.id,
    sellerSku: input.sellerSku,
    payload,
    feedId,
  });

  await audit({
    action: "product.publication_requested",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { sellerSku: input.sellerSku, feedId, shop: shop.name },
  });

  return ok(
    {
      publication: {
        id: publication.id,
        sellerSku: publication.sellerSku,
        status: publication.status,
        feedId: publication.feedId,
        submittedAt: publication.submittedAt.toISOString(),
      },
      message:
        "Demande envoyée à Jumia. Le produit n'est pas encore publié : le traitement et le contrôle qualité sont en cours.",
    },
    { status: 201 },
  );
}
