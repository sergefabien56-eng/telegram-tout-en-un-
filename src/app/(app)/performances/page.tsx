import { redirect } from "next/navigation";
import { BarChart3, TrendingUp } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { memberScope } from "@/lib/shop-scope";
import { isRefusedScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { reportSales } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Kpi } from "@/components/ui/kpi";
import { EmptyState } from "@/components/ui/empty-state";
import { ScopeBar } from "@/components/ui/scope-bar";
import { ShopScopeSelect } from "@/components/shop-scope-select";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

/**
 * PERFORMANCES — comparer les boutiques et lire les tendances.
 *
 * Cette page a une identité propre : elle **compare** (boutique contre
 * boutique) et montre l'**évolution** jour par jour. Le tableau de bord,
 * lui, summarise l'état courant.
 */
export default async function PerformancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const values = readSearchValues(await searchParams);
  const daysRaw = Number(values.days ?? "30");
  const days = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 90 ? daysRaw : 30;

  const scope = await memberScope(user.id);
  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);

  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Performances" />
        <EmptyState
          title="Aucune boutique accessible"
          description="Créez une boutique pour comparer ses performances."
        />
      </div>
    );
  }

  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Performances" />
        <EmptyState
          tone="danger"
          title="Cette boutique n’est pas dans votre périmètre"
          description="Aucune donnée n’est affichée pour une boutique à laquelle vous n’avez pas accès."
        />
      </div>
    );
  }

  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  from.setUTCHours(0, 0, 0, 0);

  // Comparaison boutique par boutique : mêmes filtres, même période.
  const rows = await Promise.all(
    shopIds.map(async (shopId) => {
      const shop = scope.allowed.find((item) => item.id === shopId)!;
      const access = await getShopAccess(user.id, shopId);
      const sales = await reportSales(
        shopId,
        { from, to },
        { statusFilter: ["DELIVERED", "SHIPPED"] },
      );
      return {
        id: shopId,
        name: shop.name,
        currency: shop.currency ?? "XOF",
        revenueMinor: sales.totals.revenueMinor,
        orders: sales.totals.orders,
        canceledOrders: sales.totals.canceledOrders,
        units: sales.totals.units,
        averageOrderMinor:
          sales.totals.orders > 0
            ? Math.round(sales.totals.revenueMinor / sales.totals.orders)
            : null,
        series: sales.series.map((point) => ({
          period: point.period,
          revenueMinor: point.revenueMinor,
          orders: point.orders,
        })),
        canSee: Boolean(access?.permissions.has("reports:read")),
      };
    }),
  );

  const visible = rows.filter((row) => row.canSee);
  const totals = visible.reduce(
    (acc, row) => ({
      revenueMinor: acc.revenueMinor + row.revenueMinor,
      orders: acc.orders + row.orders,
      units: acc.units + row.units,
    }),
    { revenueMinor: 0, orders: 0, units: 0 },
  );
  const best = [...visible].sort((a, b) => b.revenueMinor - a.revenueMinor)[0] ?? null;
  const aggregate = shopIds.length > 1;

  // Série agrégée (tous les points au même jour) : sert de courbe commune.
  const dayMap = new Map<string, { revenueMinor: number; orders: number }>();
  for (const row of visible) {
    for (const point of row.series) {
      const entry = dayMap.get(point.period) ?? { revenueMinor: 0, orders: 0 };
      entry.revenueMinor += point.revenueMinor;
      entry.orders += point.orders;
      dayMap.set(point.period, entry);
    }
  }
  const aggregatedSeries = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, value]) => ({ period, ...value }));
  const maxDay = Math.max(...aggregatedSeries.map((point) => point.revenueMinor), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performances"
        description="Comparer mes boutiques et lire l’évolution jour par jour."
        actions={
          <ShopScopeSelect
            shops={scope.allowed.map((shop) => ({ id: shop.id, name: shop.name }))}
            value={aggregate ? "toutes" : (shopIds[0] ?? "")}
          />
        }
      >
        <ScopeBar
          label={
            aggregate
              ? `${shopIds.length} boutiques`
              : (scope.allowed.find((s) => s.id === shopIds[0])?.name ?? "Boutique")
          }
          detail={`${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} · ${days} j · commandes livrées ou expédiées`}
          actions={
            <form method="GET" className="flex items-center gap-2">
              {values.boutique ? (
                <input type="hidden" name="boutique" value={values.boutique} />
              ) : null}
              <label htmlFor="periode" className="text-xs text-muted">
                Période
              </label>
              <select
                id="periode"
                name="days"
                defaultValue={String(days)}
                className="focusable rounded-lg border border-border bg-surface px-2 py-1 text-sm text-night"
              >
                <option value="7">7 jours</option>
                <option value="30">30 jours</option>
                <option value="90">90 jours</option>
              </select>
              <button
                type="submit"
                className="focusable rounded-lg border border-border bg-surface px-3 py-1 text-sm font-medium text-night hover:bg-border"
              >
                Actualiser
              </button>
            </form>
          }
        />
      </PageHeader>

      {visible.length === 0 ? (
        <EmptyState
          title="Aucun rapport disponible"
          description="Votre rôle ne permet pas de lire les rapports sur les boutiques de ce périmètre."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="CA commandes"
              value={formatMoney(totals.revenueMinor, visible[0]?.currency ?? "XOF")}
              hint={`${aggregate ? `${visible.length} boutiques` : visible[0]?.name} · ${days} j`}
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            />
            <Kpi
              label="Commandes"
              value={totals.orders.toLocaleString("fr-FR")}
              hint="Livrées ou expédiées sur la période."
            />
            <Kpi
              label="Panier moyen"
              value={
                totals.orders > 0
                  ? formatMoney(
                      Math.round(totals.revenueMinor / totals.orders),
                      visible[0]?.currency ?? "XOF",
                    )
                  : "—"
              }
              hint={
                totals.orders > 0
                  ? "CA commandes ÷ commandes livrées ou expédiées."
                  : "Aucune commande sur la période."
              }
            />
            <Kpi
              label="Meilleure boutique"
              value={best?.name ?? "—"}
              hint={
                best
                  ? `${formatMoney(best.revenueMinor, best.currency)} sur ${days} j`
                  : "Aucune donnée comparable."
              }
              icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
            />
          </div>

          <Section
            title="Comparaison des boutiques"
            description="Même période, mêmes filtres : le classement n’est pas faussé par des fenêtres différentes."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Boutique</th>
                    <th className="py-2 pr-3 text-right">CA</th>
                    <th className="py-2 pr-3 text-right">Commandes</th>
                    <th className="py-2 pr-3 text-right">Unités</th>
                    <th className="py-2 pr-3 text-right">Panier moyen</th>
                    <th className="w-40 py-2">Part du CA</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-night">{row.name}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-night">
                        {formatMoney(row.revenueMinor, row.currency)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted">
                        {row.orders}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted">
                        {row.units}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted">
                        {row.averageOrderMinor === null
                          ? "—"
                          : formatMoney(row.averageOrderMinor, row.currency)}
                      </td>
                      <td className="py-2.5">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${
                                totals.revenueMinor > 0
                                  ? Math.round((row.revenueMinor / totals.revenueMinor) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <span className="mt-1 block text-xs text-muted">
                          {totals.revenueMinor > 0
                            ? `${Math.round((row.revenueMinor / totals.revenueMinor) * 100)} %`
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Évolution journalière"
            description="CA commandes par jour, toutes boutiques du périmètre confondues."
          >
            {aggregatedSeries.length === 0 ? (
              <EmptyState
                title="Aucune donnée sur la période"
                description="Aucun graphique n'est inventé : la courbe n'apparaît que si des commandes existent."
              />
            ) : (
              <div>
                <div
                  className="flex h-40 items-end gap-[2px]"
                  role="img"
                  aria-label={`CA quotidien sur ${days} jours`}
                >
                  {aggregatedSeries.map((point) => {
                    const height = maxDay > 0 ? Math.round((point.revenueMinor / maxDay) * 100) : 0;
                    return (
                      <div
                        key={point.period}
                        className="flex-1 rounded-t bg-primary/70"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${point.period} — ${formatMoney(point.revenueMinor, visible[0]?.currency ?? "XOF")} · ${point.orders} commande(s)`}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>{aggregatedSeries[0]?.period}</span>
                  <span>{aggregatedSeries[aggregatedSeries.length - 1]?.period}</span>
                </div>
              </div>
            )}
          </Section>

          <p className="text-xs text-muted">
            Les montants proviennent des commandes enregistrées dans l&apos;application (statuts
            livrée ou expédiée). Le maximum atteint par une boutique sert uniquement d&apos;échelle
            au graphique.
          </p>
        </>
      )}
    </div>
  );
}
