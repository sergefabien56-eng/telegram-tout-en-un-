import { ExportButton } from "@/components/export-button";
import { PurchasePriceField } from "@/components/purchase-price-field";
import { ShopSelect } from "@/components/shop-select";
import { ScopeNotice } from "@/components/scope-notice";
import { getShopAccess } from "@/lib/permissions";
import { listVariants, marginOf } from "@/lib/catalog";
import { formatMoney, minorUnits } from "@/lib/money";
import { isRefusedScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { scopedShops } from "@/lib/shop-scope";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

/** Conversion affichage : unités mineures → unités majeures (arrondi devise). */
function toMajor(minor: number | null, currency: string): string {
  if (minor === null) return "";
  const digits = minorUnits(currency);
  return (minor / 10 ** digits).toString();
}

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

  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);

  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Prix d&apos;achat et marge</h1>
        <p className="text-sm text-danger" role="alert">
          Cette boutique n&apos;est pas dans votre périmètre : aucune donnée ne peut être affichée.
        </p>
      </div>
    );
  }

  const singleShopId = shopIds.length === 1 ? shopIds[0] : undefined;
  const rows = singleShopId ? await listVariants(singleShopId, 200) : [];
  const access = singleShopId ? await getShopAccess(user.id, singleShopId) : null;
  const canWrite = Boolean(access?.permissions.has("products:write"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Prix</h1>
        <p className="mt-1 text-sm text-muted">
          Prix de vente enregistrés pour chaque déclinaison. Le prix d&apos;achat se saisit
          <span className="font-medium text-night">à la main</span>, ici même : rien n&apos;est
          repris de Jumia.
        </p>
      </div>

      <section className="card flex flex-wrap items-end justify-between gap-3 p-5">
        <ShopSelect
          shops={scope.allowed}
          selected={values.boutique}
          currentShopId={scope.currentShopId}
        />
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
                      <td className="py-2.5 text-right">
                        <PurchasePriceField
                          shopId={singleShopId ?? ""}
                          sku={variant.sellerSku ?? variant.id}
                          value={toMajor(variant.purchasePriceMinor, variant.currency)}
                          currency={variant.currency}
                          permissions={canWrite}
                        />
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {marginOf(variant) !== null
                          ? formatMoney(marginOf(variant) as number, variant.currency)
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
