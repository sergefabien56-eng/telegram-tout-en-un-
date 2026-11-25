import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import {
  countLocalCategories,
  fetchAttributeSet,
  fetchBrandPage,
  fetchCategoryPage,
  readCatalogSyncState,
  saveCategories,
  searchLocalCategories,
  writeCatalogSyncState,
  type JumiaAttribute,
} from "@/lib/jumia/catalog-referentiel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Taille des pages de catégories lues chez Jumia. */
const PAGE_SIZE = 100;
/** Plafond de pages par rafraîchissement (au-delà, on s'arrête et on le dit). */
const MAX_PAGES = 300;

/**
 * GET /api/shops/:id/catalogue/referentiel
 *
 * - `?type=categories&q=…` : recherche dans la **copie locale** du
 *   référentiel Jumia (l'API n'a pas de filtre par nom) ;
 * - `?type=attributs&category=<code>` : les attributs **réellement exigés**
 *   par la catégorie (ils sont lus chez Jumia, puis conservés) ;
 * - `?type=marques` : les marques proposées (marques « sans marque »
 *   officielles + recherche par code).
 *
 * La réponse indique toujours la **fraîcheur** et le caractère **complet ou
 * partiel** du référentiel : jamais de chiffre présenté comme complet quand
 * il ne l'est pas.
 */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("products:read")) {
    return fail(403, "Permission insuffisante (products:read).");
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "categories";

  if (type === "categories") {
    const q = (url.searchParams.get("q") ?? "").trim();
    const state = await readCatalogSyncState(id);
    const categories = await searchLocalCategories(id, q);
    return ok({
      categories,
      state: { ...state, count: await countLocalCategories(id) },
      source: "Jumia Vendor Center (GPM) — copie locale",
    });
  }

  if (type === "attributs") {
    const code = Number(url.searchParams.get("category"));
    if (!Number.isFinite(code)) {
      return fail(422, "Code de catégorie manquant.");
    }
    const rows = await getDb()
      .select()
      .from(schema.jumiaCatalogCategories)
      .where(
        and(
          eq(schema.jumiaCatalogCategories.shopId, id),
          eq(schema.jumiaCatalogCategories.code, code),
        ),
      )
      .limit(1);
    const category = rows[0];
    if (!category) {
      return fail(
        404,
        "Catégorie inconnue du référentiel local : rafraîchissez le référentiel des catégories.",
      );
    }
    if (!category.attributeSetSid) {
      return fail(422, "Cette catégorie n'a pas d'ensemble d'attributs connu de Jumia.");
    }
    try {
      const attributes: JumiaAttribute[] = await fetchAttributeSet(
        { shopId: id },
        category.attributeSetSid,
      );
      return ok({
        category: {
          code: category.code,
          name: category.name,
          completePath: category.completePath,
          attributeSetName: category.attributeSetName,
        },
        attributes,
        source: "Jumia Vendor Center (GPM) — ensemble d'attributs",
      });
    } catch (error) {
      return fail(
        502,
        error instanceof Error ? error.message : "Lecture des attributs impossible.",
      );
    }
  }

  if (type === "marques") {
    try {
      const page = await fetchBrandPage({ shopId: id }, 1, 100);
      const officielles = [
        { code: 1045133, name: "Generic" },
        { code: 1039426, name: "Fashion" },
      ];
      const trouvees = page.filter((brand) => !officielles.some((row) => row.code === brand.code));
      return ok({
        marques: [...officielles, ...trouvees.slice(0, 60)],
        note: "Jumia compte plus de 300 000 marques : la liste proposée est un extrait. Une marque absente peut être saisie par son code.",
        source: "Jumia Vendor Center (GPM) — extrait",
      });
    } catch (error) {
      return fail(502, error instanceof Error ? error.message : "Lecture des marques impossible.");
    }
  }

  return fail(422, "Type de référentiel inconnu.");
}

/**
 * POST /api/shops/:id/catalogue/referentiel — recharge le référentiel des
 * catégories depuis Jumia.
 *
 * Le chargement est **en arrière-plan** (l'API Jumia ne propose pas de filtre
 * par nom : il faut parcourir l'arborescence). L'interface suit l'avancement.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("products:write")) {
    return fail(403, "Permission insuffisante (products:write).");
  }

  const rows = await getDb()
    .select({ remoteShopId: schema.shops.remoteShopId })
    .from(schema.shops)
    .where(eq(schema.shops.id, id))
    .limit(1);
  if (!rows[0]?.remoteShopId) {
    return fail(409, "Cette boutique n'est rattachée à aucune boutique Jumia.");
  }

  const avant = await readCatalogSyncState(id);

  after(async () => {
    let page = 1;
    let totalOfPages = 0;
    let count = 0;
    let complete = false;
    try {
      for (; page <= MAX_PAGES; page += 1) {
        const result = await fetchCategoryPage({ shopId: id }, page, PAGE_SIZE);
        if (result.categories.length === 0) {
          complete = true;
          break;
        }
        await saveCategories(id, result.categories);
        count += result.categories.length;
        totalOfPages = result.totalOfPages;
        if (result.totalOfPages > 0 && result.current >= result.totalOfPages) {
          complete = true;
          break;
        }
        await writeCatalogSyncState(id, {
          complete: false,
          count,
          pages: result.current,
          totalOfPages,
          lastSyncAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      await writeCatalogSyncState(id, {
        complete: false,
        count,
        pages: page - 1,
        totalOfPages,
        lastSyncAt: new Date().toISOString(),
      });
      await audit({
        action: "shop.catalog_refreshed",
        result: "failure",
        userId: user.id,
        entityType: "shop",
        entityId: id,
        metadata: { reason: error instanceof Error ? error.message.slice(0, 200) : "inconnue" },
      });
      return;
    }

    await writeCatalogSyncState(id, {
      complete,
      count,
      pages: page - 1,
      totalOfPages,
      lastSyncAt: new Date().toISOString(),
    });
    await audit({
      action: "shop.catalog_refreshed",
      result: "success",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { count, complete },
    });
  });

  return ok({
    message:
      "Rechargement du référentiel lancé en arrière-plan. L'avancement est visible dans le sélecteur de catégorie.",
    previous: avant,
  });
}
