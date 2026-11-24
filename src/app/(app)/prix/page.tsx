import { ExportButton } from "@/components/export-button";
import { ScopeNotice, ShopSelect } from "@/components/shop-select";
import { listVariants } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { readSearchValues, resolveShopIds } from "@/lib/order-access";
import { scopedShops } from "@/lib/shop-scope";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Prix enregistrés par déclinaison (prix catalogue et promotion). */
export default async function PrixPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await scopedShops(user.id, "products:read");
  const values = readSearchValues(await searchParams);
  const notice = ScopeNotice({ total: scope.total, allowed: scope.allowed.length });
  if (notice)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Prix</h1>
        {notice}
      </div>
    );

  const shopIds = resolveShopIds(values.boutique, scope.allowed);
  const singleShopId = shopIds.length === 1 ? shopIds[0] : undefined;
  const rows = singleShopId ? await listVariants(singleShopId, 200) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Prix</h1>
        <p className="mt-1 text-sm text-muted">
          Prix enregistrés dans notre base pour chaque déclinaison (SKU vendeur).
        </p>
      </div>

      <section className="card flex flex-wrap items-end justify-between gap-3 p-5">
        <ShopSelect shops={scope.allowed} selected={values.boutique} />
        {singleShopId ? (
          <ExportButton
            href={`/api/shops/${singleShopId}/produits/export`}
            count={rows.length}
            label="Exporter les prix (CSV)"
          />
        ) : null}
      </section>

      {shopIds.length > 1 ? (
        <section className="card p-5">
          <p className="text-sm text-muted" role="status">
            Sélectionnez une boutique pour consulter les prix : à plusieurs boutiques, devises et
            catalogues sont volontairement séparés.
          </p>
        </section>
      ) : (
        <section className="card p-5">
          {rows.length === 0 ? (
            <p className="text-sm text-muted" role="status">
              Aucune déclinaison enregistrée : lancez une synchronisation du catalogue.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Produit</th>
                    <th className="py-2 pr-3">Déclinaison</th>
                    <th className="py-2 text-right">Prix</th>
                    <th className="py-2 text-right">Promo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ variant, productName }) => (
                    <tr key={variant.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-xs text-night">
                        {variant.sellerSku ?? "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-night">{productName}</td>
                      <td className="py-2.5 pr-3 text-muted">{variant.variationName ?? "—"}</td>
                      <td className="py-2.5 text-right font-medium text-night">
                        {variant.priceMinor !== null
                          ? formatMoney(variant.priceMinor, variant.currency)
                          : "—"}
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {variant.salePriceMinor !== null
                          ? formatMoney(variant.salePriceMinor, variant.currency)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
