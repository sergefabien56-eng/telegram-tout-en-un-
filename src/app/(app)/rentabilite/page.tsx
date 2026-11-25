import { ShopSelect } from "@/components/shop-select";
import { ScopeNotice } from "@/components/scope-notice";
import { rentability } from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { isRefusedScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { scopedShops } from "@/lib/shop-scope";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PERIODES = [
  { jours: 30, label: "30 jours" },
  { jours: 90, label: "90 jours" },
];

/**
 * Rentabilité : ce que Jumia a publié (relevés) sur la période — CA articles,
 * livraison, commissions, remboursements, net et montants versés. Aucune marge
 * n'est estimée : seuls les relevés réels comptent.
 */
export default async function RentabilitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await scopedShops(user.id, "finance:read");
  const values = readSearchValues(await searchParams);
  const notice = ScopeNotice({ total: scope.total, allowed: scope.allowed.length });
  if (notice)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Rentabilité</h1>
        {notice}
      </div>
    );

  const jours = Math.min(Math.max(Number(values.statut ?? 90), 7), 90) || 90;
  const to = new Date();
  const from = new Date(to.getTime() - jours * 24 * 60 * 60 * 1000);

  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);

  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Rentabilité</h1>
        <p className="text-sm text-danger" role="alert">
          Cette boutique n&apos;est pas dans votre périmètre : aucune donnée ne peut être affichée.
        </p>
      </div>
    );
  }

  const rows = await rentability(shopIds, from, to);
  const noms = new Map(scope.allowed.map((shop) => [shop.id, shop.name]));
  const devises = new Set(rows.map((row) => row.currency).filter(Boolean));
  const devise = devises.size === 1 ? ([...devises][0] ?? "") : "";

  const totaux = rows.reduce(
    (acc, row) => ({
      statements: acc.statements + row.statements,
      revenue: acc.revenue + row.revenueMinor,
      fees: acc.fees + row.feesMinor,
      shipment: acc.shipment + row.shipmentFeesMinor,
      refunds: acc.refunds + row.refundsMinor,
      net: acc.net + row.netMinor,
      paid: acc.paid + row.paidMinor,
    }),
    { statements: 0, revenue: 0, fees: 0, shipment: 0, refunds: 0, net: 0, paid: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Rentabilité</h1>
        <p className="mt-1 text-sm text-muted">
          Relevés Jumia sur {jours} jours : produits, commissions, remboursements et net versé.
        </p>
      </div>

      <section className="card flex flex-wrap items-end justify-between gap-3 p-5">
        <ShopSelect
          shops={scope.allowed}
          selected={values.boutique}
          currentShopId={scope.currentShopId}
        />
        <form method="get" className="flex items-end gap-2">
          {values.boutique ? <input type="hidden" name="boutique" value={values.boutique} /> : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Période
            <select
              name="statut"
              defaultValue={String(jours)}
              className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            >
              {PERIODES.map((periode) => (
                <option key={periode.jours} value={periode.jours}>
                  {periode.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="focusable rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
          >
            Appliquer
          </button>
        </form>
      </section>

      {rows.length === 0 ? (
        <section className="card p-5">
          <p className="text-sm text-muted" role="status">
            Aucun relevé Jumia sur cette période : lancez une synchronisation des finances.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">CA articles</p>
              <p className="mt-3 text-2xl font-semibold text-night">
                {devise ? formatMoney(totaux.revenue, devise) : totaux.revenue}
              </p>
              <p className="mt-1 text-xs text-muted">{totaux.statements} relevés.</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Commissions</p>
              <p className="mt-3 text-2xl font-semibold text-danger">
                {devise ? formatMoney(totaux.fees, devise) : totaux.fees}
              </p>
              <p className="mt-1 text-xs text-muted">Frais Jumia prélevés.</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-night">Net</p>
              <p className="mt-3 text-2xl font-semibold text-night">
                {devise ? formatMoney(totaux.net, devise) : totaux.net}
              </p>
              <p className="mt-1 text-xs text-muted">
                Dont versé : {devise ? formatMoney(totaux.paid, devise) : totaux.paid}
              </p>
            </div>
          </section>

          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Boutique</th>
                    <th className="py-2 pr-3">Relevés</th>
                    <th className="py-2 text-right">CA</th>
                    <th className="py-2 text-right">Commissions</th>
                    <th className="py-2 text-right">Remboursements</th>
                    <th className="py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.shopId} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 text-night">{noms.get(row.shopId) ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-muted">{row.statements}</td>
                      <td className="py-2.5 text-right text-night">
                        {row.currency
                          ? formatMoney(row.revenueMinor, row.currency)
                          : row.revenueMinor}
                      </td>
                      <td className="py-2.5 text-right text-danger">
                        {row.currency ? formatMoney(row.feesMinor, row.currency) : row.feesMinor}
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {row.currency
                          ? formatMoney(row.refundsMinor, row.currency)
                          : row.refundsMinor}
                      </td>
                      <td className="py-2.5 text-right font-medium text-night">
                        {row.currency ? formatMoney(row.netMinor, row.currency) : row.netMinor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!devise ? (
              <p className="mt-3 text-xs text-muted">
                Devises différentes sur la période : les totaux ne sont pas additionnés.
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
