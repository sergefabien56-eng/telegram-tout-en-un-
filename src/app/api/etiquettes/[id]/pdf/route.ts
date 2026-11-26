import { fail } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { scopedShops } from "@/lib/shop-scope";
import { getShipmentLabel } from "@/lib/shipment-labels";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/etiquettes/:id/pdf — télécharge le PDF d'une étiquette.
 *
 * Le PDF est renvoyé **tel que Jumia l'a produit** : aucun octet n'est
 * modifié. L'empreinte SHA-256 conservée en base permet de vérifier que le
 * document téléchargé est bien celui qui a été reçu.
 *
 * Le périmètre est vérifié côté serveur : une étiquette d'une boutique non
 * autorisée n'est jamais servie, même si son identifiant est deviné.
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const scope = await scopedShops(user.id, "orders:read");
  const label = await getShipmentLabel(id, scope.allowed.map((shop) => shop.id));
  if (!label) return fail(404, "Étiquette introuvable ou accès refusé.");
  if (!label.pdf) {
    return fail(409, "Cette étiquette n'a pas encore de document disponible.");
  }

  const reference = label.trackingNumber ?? label.orderNumber ?? label.externalOrderId;
  const filename = `etiquette-${String(reference).replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`;

  return new Response(new Uint8Array(label.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(label.pdf.length),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-SHA256": label.pdfSha256 ?? "",
      "Cache-Control": "private, no-store",
    },
  });
}
