import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listPayoutStatements, sumStatements } from "@/lib/payments";
import { formatMoney } from "@/lib/money";
import { PaymentsSyncButton } from "@/components/payments-sync-button";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Relevés et versements Jumia enregistrés — aucun calcul sur données inventées. */
export default async function FinancesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { shop } = await getCurrentShop(user.id);
  if (!shop) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Finances</h1>
        <p className="text-sm text-muted">Aucune boutique accessible.</p>
      </div>
    );
  }

  const access = await getShopAccess(user.id, shop.id);
  if (!access?.permissions.has("finance:read")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Finances</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas de consulter les finances.
        </p>
      </div>
    );
  }

  const statements = await listPayoutStatements(shop.id, 50);
  const totals = sumStatements(statements);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Finances</h1>
        <p className="mt-1 text-sm text-muted">
          Boutique : <span className="font-medium text-night">{shop.name}</span> ·{" "}
          {shop.remoteShopName ? `Jumia : ${shop.remoteShopName}` : "non rattachée"}.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Relevés Jumia</h2>
        <p className="mt-2 text-sm text-muted">
          Chiffre d&apos;affaires articles, frais de livraison, commissions et remboursements tels
          que Jumia les publie pour ses versements (90 jours par défaut).
        </p>
        <div className="mt-4">
          <PaymentsSyncButton shopId={shop.id} linked={Boolean(shop.remoteShopId)} />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">CA articles</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {formatMoney(totals.revenue, shop.currency ?? "XOF")}
          </p>
          <p className="mt-1 text-xs text-muted">Somme des relevés affichés.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Commissions Jumia
          </p>
          <p className="mt-3 text-2xl font-semibold text-danger">
            {formatMoney(Math.abs(totals.fees), shop.currency ?? "XOF")}
          </p>
          <p className="mt-1 text-xs text-muted">Frais totaux, valeur absolue.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Net à verser</p>
          <p className="mt-3 text-2xl font-semibold text-success">
            {formatMoney(totals.net, shop.currency ?? "XOF")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {totals.unpaid
              ? "Au moins un relevé n'est pas encore payé."
              : "Tous les relevés sont payés."}
          </p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Relevés enregistrés</h2>
        {statements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucun relevé enregistré. Lancez la synchronisation : les montants proviennent de Jumia,
            aucun n&apos;est calculé ou inventé.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Relevé</th>
                  <th className="py-2 pr-3">Créé le</th>
                  <th className="py-2 pr-3 text-right">CA articles</th>
                  <th className="py-2 pr-3 text-right">Livraison</th>
                  <th className="py-2 pr-3 text-right">Commissions</th>
                  <th className="py-2 pr-3 text-right">Remboursements</th>
                  <th className="py-2 pr-3 text-right">Net</th>
                  <th className="py-2 pr-3 text-right">Versé</th>
                  <th className="py-2 pr-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-night">
                      {row.statementNumber}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {new Date(row.remoteCreatedAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-night">
                      {formatMoney(row.itemRevenueMinor, row.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {formatMoney(row.shipmentFeeMinor, row.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-danger">
                      {formatMoney(Math.abs(row.feesTotalMinor), row.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {formatMoney(row.refundsMinor, row.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium text-night">
                      {formatMoney(row.closingBalanceMinor, row.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-success">
                      {row.payoutAmountMinor !== null
                        ? formatMoney(row.payoutAmountMinor, row.currency)
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`badge ${row.paid ? "badge-neutral" : "badge-neutral"}`}>
                        {row.paid ? "Payé" : "En attente"}
                      </span>
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
