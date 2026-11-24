import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listProducts, listVariants } from "@/lib/catalog";
import { CatalogSyncButton } from "@/components/catalog-sync-button";
import { ExportButton } from "@/components/export-button";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Produits et stocks réels enregistrés dans notre base — jamais inventés. */
export default async function ProduitsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { shop } = await getCurrentShop(user.id);
  if (!shop) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Produits</h1>
        <p className="text-sm text-muted">
          Aucune boutique accessible. Créez d&apos;abord une boutique, puis rattachez-la à une
          boutique Jumia.
        </p>
      </div>
    );
  }

  const access = await getShopAccess(user.id, shop.id);
  if (!access?.permissions.has("products:read")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Produits</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas de consulter le catalogue.
        </p>
      </div>
    );
  }

  const products = await listProducts(shop.id, 100);
  const variants = await listVariants(shop.id, 1000);

  // Agrégats par produit : nombre de déclinaisons et stock total.
  const byProduct = new Map<string, { count: number; stock: number | null }>();
  for (const { variant } of variants) {
    const entry = byProduct.get(variant.productId) ?? { count: 0, stock: 0 };
    entry.count += 1;
    if (variant.stockGlobal === null) entry.stock = null;
    else if (entry.stock !== null) entry.stock += variant.stockGlobal;
    byProduct.set(variant.productId, entry);
  }

  const totalStock = variants.reduce(
    (sum, row) => (row.variant.stockGlobal === null ? sum : sum + row.variant.stockGlobal),
    0,
  );
  const knownStock = variants.some((row) => row.variant.stockGlobal !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Produits</h1>
        <p className="mt-1 text-sm text-muted">
          Boutique : <span className="font-medium text-night">{shop.name}</span> ·{" "}
          {shop.remoteShopName ? `Jumia : ${shop.remoteShopName}` : "non rattachée"}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Produits</p>
          <p className="mt-3 text-3xl font-semibold text-night">{products.length}</p>
          <p className="mt-1 text-xs text-muted">Ensembles produits enregistrés.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Déclinaisons</p>
          <p className="mt-3 text-3xl font-semibold text-night">{variants.length}</p>
          <p className="mt-1 text-xs text-muted">SKU vendeur (tailles, couleurs…).</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Stock total</p>
          <p className="mt-3 text-3xl font-semibold text-night">
            {knownStock ? totalStock.toLocaleString("fr-FR") : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {knownStock ? "Somme des stocks déclarés." : "Pas encore synchronisé."}
          </p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Synchronisation Jumia</h2>
        <p className="mt-2 text-sm text-muted">
          Catalogue et stocks lus chez Jumia (5 pages de 100 maximum, limites respectées), puis
          enregistrés dans la base.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ExportButton
            href={`/api/shops/${shop.id}/produits/export`}
            count={products.length}
            label="Exporter le catalogue (CSV)"
          />
          <CatalogSyncButton shopId={shop.id} linked={Boolean(shop.remoteShopId)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Catalogue enregistré</h2>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucun produit enregistré. Lancez la synchronisation ci-dessus : les produits proviennent
            de Jumia, aucun n&apos;est inventé.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Produit</th>
                  <th className="py-2 pr-3">Marque</th>
                  <th className="py-2 pr-3">Catégorie</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Déclinaisons</th>
                  <th className="py-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const aggregate = byProduct.get(product.id);
                  return (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td
                        className="max-w-[280px] truncate py-2.5 pr-3 text-night"
                        title={product.name}
                      >
                        {product.name}
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{product.brandName ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-muted">{product.categoryName ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        <span className="badge badge-neutral">{product.status ?? "—"}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{aggregate?.count ?? 0}</td>
                      <td className="py-2.5 text-right text-night">
                        {aggregate?.stock === null || aggregate === undefined
                          ? "—"
                          : aggregate.stock.toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {products.length > 0 ? (
          <p className="mt-3 text-xs text-muted">
            Prix indicatifs et stocks sont portés par les déclinaisons — voir l&apos;écran Stocks.
          </p>
        ) : null}
      </section>
    </div>
  );
}
