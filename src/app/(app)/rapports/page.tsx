import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { reportCatalog, reportSales } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

/** Rapports calculés sur les données réellement enregistrées. */
export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const days = Number(query.days ?? "30");
  const fromRaw = query.from;
  const toRaw = query.to;

  const { shop } = await getCurrentShop(user.id);
  if (!shop) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Rapports</h1>
        <p className="text-sm text-muted">Aucune boutique accessible.</p>
      </div>
    );
  }

  const access = await getShopAccess(user.id, shop.id);
  if (!access?.permissions.has("reports:read")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Rapports</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas de consulter les rapports.
        </p>
      </div>
    );
  }

  const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : new Date();
  const from =
    fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)
      ? new Date(`${fromRaw}T00:00:00Z`)
      : new Date(to.getTime() - (days - 1) * DAY_MS);

  const windowLabel = `${from.toLocaleDateString("fr-FR")} → ${to.toLocaleDateString("fr-FR")}`;

  const sales = await reportSales(
    shop.id,
    { from, to },
    {
      statusFilter: ["DELIVERED", "SHIPPED"],
    },
  );
  const catalog = await reportCatalog(shop.id);

  const maxRevenue = Math.max(...sales.series.map((row) => row.revenueMinor), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Rapports</h1>
        <p className="mt-1 text-sm text-muted">
          Boutique : <span className="font-medium text-night">{shop.name}</span> · période :{" "}
          {windowLabel}.
        </p>
      </div>

      <form method="GET" className="card flex flex-wrap items-end gap-3 p-5">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Période
          <select
            name="days"
            defaultValue={String(days)}
            className="focusable rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
          >
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Du
          <input
            type="date"
            name="from"
            defaultValue={fromRaw ?? ""}
            className="focusable rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Au
          <input
            type="date"
            name="to"
            defaultValue={toRaw ?? ""}
            className="focusable rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
          />
        </label>
        <button
          type="submit"
          className="focusable rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Actualiser
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Chiffre d&apos;affaires
          </p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {formatMoney(sales.totals.revenueMinor, shop.currency ?? "XOF")}
          </p>
          <p className="mt-1 text-xs text-muted">Commandes livrées et expédiées.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
          <p className="mt-3 text-2xl font-semibold text-night">{sales.totals.orders}</p>
          <p className="mt-1 text-xs text-muted">
            dont {sales.totals.canceledOrders} annulée(s) sur la période.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Articles vendus</p>
          <p className="mt-3 text-2xl font-semibold text-night">{sales.totals.units}</p>
          <p className="mt-1 text-xs text-muted">Unités commandées.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Panier moyen</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {sales.totals.orders === 0
              ? "—"
              : formatMoney(
                  Math.round(sales.totals.revenueMinor / sales.totals.orders),
                  shop.currency ?? "XOF",
                )}
          </p>
          <p className="mt-1 text-xs text-muted">CA ÷ nombre de commandes.</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Ventes par jour</h2>
        {sales.totals.orders === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucune commande livrée ou expédiée sur cette période. Les commandes non synchronisées
            n&apos;apparaissent pas — lancez d&apos;abord la synchronisation des commandes.
          </p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {sales.series.map((row) => (
              <div key={row.period} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted">
                  {new Date(`${row.period}T00:00:00Z`).toLocaleDateString("fr-FR")}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${Math.max(2, (row.revenueMinor / maxRevenue) * 100)}%` }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right text-xs text-night">
                  {row.orders} · {formatMoney(row.revenueMinor, shop.currency ?? "XOF")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">
          Catalogue au {windowLabel.split(" → ")[1]}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Déclinaisons</p>
            <p className="text-xl font-semibold text-night">{catalog.variants}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Unités en stock</p>
            <p className="text-xl font-semibold text-night">
              {catalog.stockUnits.toLocaleString("fr-FR")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Stocks faibles (≤ 5)</p>
            <p
              className={`text-xl font-semibold ${catalog.lowStock > 0 ? "text-danger" : "text-night"}`}
            >
              {catalog.lowStock}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Valeur du stock (prix catalogue)</p>
            <p className="text-xl font-semibold text-night">
              {formatMoney(catalog.stockValueMinor, shop.currency ?? "XOF")}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {catalog.productsByStatus.length === 0 ? (
            <span className="text-xs text-muted">Aucun produit enregistré.</span>
          ) : (
            catalog.productsByStatus.map((row) => (
              <span key={row.status} className="badge badge-neutral">
                {row.status} : {row.count}
              </span>
            ))
          )}
        </div>
        {catalog.lowestStock.length > 0 ? (
          <ul className="mt-4 divide-y divide-border text-sm">
            {catalog.lowestStock.map((item) => (
              <li key={item.sellerSku} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-muted">{item.name}</span>
                <span className="shrink-0 font-mono text-xs text-night">{item.sellerSku}</span>
                <span
                  className={`shrink-0 font-medium ${
                    (item.stock ?? 0) <= 5 ? "text-danger" : "text-night"
                  }`}
                >
                  {item.stock}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Plus grosses commandes de la période</h2>
        {sales.topOrders.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune commande sur la période.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {sales.topOrders.map((order) => (
              <li
                key={order.orderNumber ?? String(order.createdAt)}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="font-mono text-xs text-night">{order.orderNumber}</span>
                <span className="text-xs text-muted">{order.customerCity ?? "—"}</span>
                <span className="badge badge-neutral">{order.status}</span>
                <span className="font-medium text-night">
                  {formatMoney(order.totalMinor, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
