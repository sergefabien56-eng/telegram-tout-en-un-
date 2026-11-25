import { ShopSelect } from "@/components/shop-select";
import { ScopeNotice } from "@/components/scope-notice";
import { listCategories } from "@/lib/insights";
import { readSearchValues, resolveShopIds } from "@/lib/order-access";
import { scopedShops } from "@/lib/shop-scope";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Catégories réellement présentes dans le catalogue synchronisé. */
export default async function CategoriesPage({
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
        <h1 className="text-2xl font-semibold text-night">Catégories</h1>
        {notice}
      </div>
    );

  const shopIds = resolveShopIds(values.boutique, scope.allowed);
  const rows = await listCategories(shopIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Catégories</h1>
        <p className="mt-1 text-sm text-muted">
          Catégories Jumia présentes dans les produits enregistrés.
        </p>
      </div>

      <section className="card flex items-end justify-between gap-3 p-5">
        <ShopSelect shops={scope.allowed} selected={values.boutique} />
        <p className="text-xs text-muted">
          {rows.length} catégorie{rows.length > 1 ? "s" : ""}
        </p>
      </section>

      <section className="card p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted" role="status">
            Aucun produit enregistré : aucune catégorie à lister. Lancez une synchronisation du
            catalogue — aucune donnée n&apos;est inventée.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Catégorie</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Produits</th>
                  <th className="py-2 text-right">Déclinaisons</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.code ?? "nc"}-${index}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2.5 pr-3 text-night">{row.name ?? "Non renseignée"}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{row.code ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted">{row.products}</td>
                    <td className="py-2.5 text-right text-muted">{row.variants}</td>
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
