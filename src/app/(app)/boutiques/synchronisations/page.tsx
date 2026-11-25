import { ShopSelect } from "@/components/shop-select";
import { ScopeNotice } from "@/components/scope-notice";
import { ShopFullSyncButton } from "@/components/shop-full-sync-button";
import Link from "next/link";
import { shopCounts, shopSyncHistory } from "@/lib/insights";
import { connectionStates } from "@/lib/connection-state";
import { readSearchValues, resolveShopIds } from "@/lib/order-access";
import { scopedShops } from "@/lib/shop-scope";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Synchronisations : état réel de chaque boutique (rattachement Jumia, dernière
 * synchronisation, volumes enregistrés). Aucun compteur n'est estimé.
 */
export default async function SynchronisationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await scopedShops(user.id, "shops:read");
  const values = readSearchValues(await searchParams);
  const notice = ScopeNotice({ total: scope.total, allowed: scope.allowed.length });
  if (notice)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Synchronisations</h1>
        {notice}
      </div>
    );

  const shopIds = resolveShopIds(values.boutique, scope.allowed);
  const counts = await shopCounts(shopIds);
  const history = await shopSyncHistory(shopIds);
  const states = await connectionStates(shopIds);
  const rows = scope.allowed.filter((shop) => shopIds.includes(shop.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Synchronisations</h1>
        <p className="mt-1 text-sm text-muted">
          État de la liaison Jumia et volumes réellement enregistrés dans notre base.
        </p>
      </div>

      <section className="card flex items-end justify-between gap-3 p-5">
        <ShopSelect shops={scope.allowed} selected={values.boutique} />
      </section>

      <section className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Boutique</th>
                <th className="py-2 pr-3">Jumia</th>
                <th className="py-2 pr-3">Dernière synchro</th>
                <th className="py-2 pr-3">Commandes</th>
                <th className="py-2 pr-3">Produits</th>
                <th className="py-2 pr-3">Relevés</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((shop) => {
                const count = counts.get(shop.id);
                return (
                  <tr key={shop.id} className="border-b border-border align-top last:border-0">
                    <td className="py-2.5 pr-3 text-night">{shop.name}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-medium ${
                          states.get(shop.id)?.operational ? "text-success" : "text-danger"
                        }`}
                      >
                        {states.get(shop.id)?.label ?? "inconnu"}
                      </span>
                      {states.get(shop.id) && !states.get(shop.id)?.operational ? (
                        <p className="mt-0.5 text-xs text-muted">
                          {states.get(shop.id)?.detail}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {shop.remoteShopName ?? "non rattachée"}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {shop.lastSyncAt
                        ? new Date(shop.lastSyncAt).toLocaleString("fr-FR")
                        : "Jamais"}
                      {shop.lastSyncStatus ? ` · ${shop.lastSyncStatus}` : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{count?.orders ?? 0}</td>
                    <td className="py-2.5 pr-3 text-muted">{count?.variants ?? 0}</td>
                    <td className="py-2.5 pr-3 text-muted">{count?.statements ?? 0}</td>
                    <td className="py-2.5 pr-3 text-xs text-muted">
                      <ul className="space-y-0.5">
                        {(
                          [
                            ["Catalogue", history.get(shop.id)?.catalog],
                            ["Commandes", history.get(shop.id)?.orders],
                            ["Relevés", history.get(shop.id)?.payments],
                          ] as [string, Date | null | undefined][]
                        ).map(([label, date]) => (
                          <li key={label}>
                            {label} :{" "}
                            {date ? new Date(date).toLocaleString("fr-FR") : "jamais"}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                        <ShopFullSyncButton
                          shopId={shop.id}
                          linked={Boolean(shop.remoteShopId)}
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href="/commandes"
                            className="focusable text-primary-600 hover:underline"
                          >
                            Commandes
                          </Link>
                          <Link
                            href="/produits"
                            className="focusable text-primary-600 hover:underline"
                          >
                            Catalogue
                          </Link>
                          <Link
                            href="/finances"
                            className="focusable text-primary-600 hover:underline"
                          >
                            Finances
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Les volumes comptent les lignes enregistrées ; sans synchronisation, ils restent à zéro,
          sans estimation. « Tout synchroniser » relit le catalogue, les commandes (90 jours) et les
          relevés de versement de la boutique.
        </p>
      </section>
    </div>
  );
}
