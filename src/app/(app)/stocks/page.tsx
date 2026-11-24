import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listVariants } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { CatalogSyncButton } from "@/components/catalog-sync-button";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Stocks par SKU vendeur — données enregistrées, jamais estimées. */
export default async function StocksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { shop } = await getCurrentShop(user.id);
  if (!shop) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Stocks</h1>
        <p className="text-sm text-muted">Aucune boutique accessible.</p>
      </div>
    );
  }

  const access = await getShopAccess(user.id, shop.id);
  if (!access?.permissions.has("inventory:read")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Stocks</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas de consulter les stocks.
        </p>
      </div>
    );
  }

  const rows = await listVariants(shop.id, 500);
  const lowStock = rows.filter(
    (row) => row.variant.stockGlobal !== null && row.variant.stockGlobal <= 5,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Stocks</h1>
        <p className="mt-1 text-sm text-muted">
          Boutique : <span className="font-medium text-night">{shop.name}</span> ·{" "}
          {shop.remoteShopName ? `Jumia : ${shop.remoteShopName}` : "non rattachée"}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Déclinaisons</p>
          <p className="mt-3 text-3xl font-semibold text-night">{rows.length}</p>
          <p className="mt-1 text-xs text-muted">SKU vendeur enregistrés.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Stock faible (≤ 5)
          </p>
          <p className="mt-3 text-3xl font-semibold text-night">{lowStock}</p>
          <p className="mt-1 text-xs text-muted">À surveiller, d&apos;après le stock déclaré.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Dernière synchro</p>
          <p className="mt-3 text-lg font-semibold text-night">
            {rows.find((row) => row.variant.stockUpdatedAt)?.variant.stockUpdatedAt
              ? new Date(
                  rows.find((row) => row.variant.stockUpdatedAt)!.variant.stockUpdatedAt!,
                ).toLocaleString("fr-FR")
              : "Jamais"}
          </p>
          <p className="mt-1 text-xs text-muted">Dernière mise à jour lue chez Jumia.</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Synchronisation des stocks</h2>
        <div className="mt-4">
          <CatalogSyncButton shopId={shop.id} linked={Boolean(shop.remoteShopId)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Stocks enregistrés</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucune déclinaison enregistrée. Lancez la synchronisation : les stocks proviennent de
            Jumia, aucun n&apos;est inventé.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">SKU vendeur</th>
                  <th className="py-2 pr-3">Produit</th>
                  <th className="py-2 pr-3">Déclinaison</th>
                  <th className="py-2 pr-3">Prix</th>
                  <th className="py-2 pr-3">Promo</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                  <th className="py-2 pr-3">Mise à jour</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ variant, productName }) => (
                  <tr key={variant.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-night">
                      {variant.sellerSku ?? "—"}
                    </td>
                    <td
                      className="max-w-[220px] truncate py-2.5 pr-3 text-muted"
                      title={productName}
                    >
                      {productName}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{variant.variationName ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-night">
                      {variant.priceMinor !== null
                        ? formatMoney(variant.priceMinor, variant.currency)
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-success">
                      {variant.salePriceMinor !== null
                        ? formatMoney(variant.salePriceMinor, variant.currency)
                        : "—"}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right font-medium ${
                        variant.stockGlobal === null
                          ? "text-muted"
                          : variant.stockGlobal <= 5
                            ? "text-danger"
                            : "text-night"
                      }`}
                    >
                      {variant.stockGlobal ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {variant.stockUpdatedAt
                        ? new Date(variant.stockUpdatedAt).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
