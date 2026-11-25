import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import {
  analyzeProductPhoto,
  classifyCategories,
  proposeProductAttributes,
  ASSISTANT_UNAVAILABLE,
} from "@/lib/product-assistant";
import { searchProductImages, verifyImageCorrespondence } from "@/lib/product-images";
import { searchLocalCategories } from "@/lib/jumia/catalog-referentiel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Taille maximale d'une photo analysée (base64). */
const MAX_IMAGE_BASE64 = 6_000_000;

/**
 * POST /api/shops/:id/produits/assistant
 *
 * Les trois parcours MIMI de la création de produit :
 * - `photo` : photo → texte (uniquement ce qui est visible) ;
 * - `images` : nom → images Web **existantes**, avec source et licence ;
 * - `attributs` : informations fournisseur → propositions d'attributs ;
 * - `categories` : nom/photo → classes du référentiel **Jumia réel** ;
 * - `verifier-image` : contrôle de correspondance d'une image choisie.
 *
 * Aucune de ces actions n'écrit chez Jumia : le quota d'écriture n'est pas
 * consommé et aucun produit n'est créé.
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Corps JSON attendu.");
  }

  const action = typeof body.action === "string" ? body.action : "";

  /* ---------------------------------------------------------------------- */
  /* Parcours 1 — photo → texte                                             */
  /* ---------------------------------------------------------------------- */
  if (action === "photo") {
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const nameHint = typeof body.name === "string" ? body.name : undefined;
    if (!imageBase64) return fail(422, "Photo absente.");
    if (imageBase64.length > MAX_IMAGE_BASE64) {
      return fail(413, "Photo trop volumineuse : utilisez une image plus légère.");
    }
    const resultat = await analyzeProductPhoto({ imageBase64, mimeType, nameHint });
    if (!resultat.analyzed) {
      return fail(503, resultat.message ?? ASSISTANT_UNAVAILABLE);
    }
    return ok(resultat);
  }

  /* ---------------------------------------------------------------------- */
  /* Parcours 2 — nom → images Web existantes                              */
  /* ---------------------------------------------------------------------- */
  if (action === "images") {
    const query = typeof body.query === "string" ? body.query : "";
    const resultat = await searchProductImages({ query });
    return ok(resultat);
  }

  /* ---------------------------------------------------------------------- */
  /* Vérification de correspondance d'une image choisie                     */
  /* ---------------------------------------------------------------------- */
  if (action === "verifier-image") {
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    const productName = typeof body.name === "string" ? body.name : "";
    const productDescription = typeof body.description === "string" ? body.description : null;
    if (!imageUrl) return fail(422, "Adresse d'image absente.");
    const resultat = await verifyImageCorrespondence({
      imageUrl,
      productName,
      productDescription,
    });
    return ok(resultat);
  }

  /* ---------------------------------------------------------------------- */
  /* Parcours 3a — informations fournisseur → attributs proposés            */
  /* ---------------------------------------------------------------------- */
  if (action === "attributs") {
    const name = typeof body.name === "string" ? body.name : "";
    const description = typeof body.description === "string" ? body.description : null;
    const supplierInfo = typeof body.supplierInfo === "string" ? body.supplierInfo : null;
    const photoSummary = typeof body.photoSummary === "string" ? body.photoSummary : null;
    const resultat = await proposeProductAttributes({
      name,
      description,
      supplierInfo,
      photoSummary,
    });
    return ok(resultat);
  }

  /* ---------------------------------------------------------------------- */
  /* Parcours 3b — nom/photo → catégories du référentiel Jumia réel         */
  /* ---------------------------------------------------------------------- */
  if (action === "categories") {
    const name = typeof body.name === "string" ? body.name : "";
    const description = typeof body.description === "string" ? body.description : null;
    const photoSummary = typeof body.photoSummary === "string" ? body.photoSummary : null;
    const query = typeof body.query === "string" ? body.query : name;

    // Les candidats viennent de la **copie locale du référentiel Jumia**,
    // lui-même rempli par l'API Vendor Center.
    const candidats = await searchLocalCategories(id, query, 25);
    if (candidats.length === 0) {
      return ok({
        chosen: [],
        candidates: [],
        message:
          "Aucune catégorie du référentiel Jumia ne correspond à cette recherche. " +
          "Rechargez le référentiel ou reformulez la recherche.",
      });
    }
    const classement = await classifyCategories({
      candidates: candidats.map((row) => ({
        code: row.code,
        name: row.name,
        completePath: row.completePath,
      })),
      name,
      description,
      photoSummary,
    });
    return ok({
      chosen: classement.chosen,
      candidates: candidats.map((row) => ({
        code: row.code,
        name: row.name,
        completePath: row.completePath,
        attributeSetSid: row.attributeSetSid,
        attributeSetName: row.attributeSetName,
      })),
      message: classement.message,
    });
  }

  return fail(422, "Action inconnue.");
}
