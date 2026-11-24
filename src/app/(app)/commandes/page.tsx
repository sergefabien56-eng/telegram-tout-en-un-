import { listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listOrders } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import { ExportButton } from "@/components/export-button";
import { OrderSyncButton } from "@/components/order-sync-button";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SHOP_COOKIE = "teu_shop";

export const dynamic = "force-dynamic";

/**
 * Commandes enregistrées dans NOTRE base — jamais affichées si elles n'y sont
 * pas. En l'absence de synchronisation, la page l'indique clairement.
 */
export default async function CommandesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const shops = await listUserShops(user.id);
  const cookieShopId = (await cookies()).get(SHOP_COOKIE)?.value;
  const shop = shops.find((row) => row.id === cookieShopId) ?? shops[0] ?? null;

  if (!shop) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Commandes</h1>
        <p className="text-sm text-muted">
          Aucune boutique accessible. Créez d&apos;abord une boutique, puis rattachez-la à une
          boutique Jumia.
        </p>
      </div>
    );
  }

  const access = await getShopAccess(user.id, shop.id);
  if (!access?.permissions.has("orders:read")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Commandes</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas de consulter les commandes.
        </p>
      </div>
    );
  }

  const orders = await listOrders(shop.id, 100);
  const currencies = new Set(orders.map((order) => order.currency));
  const total =
    currencies.size === 1 ? orders.reduce((sum, order) => sum + order.totalAmountMinor, 0) : null;
  const currency = currencies.size === 1 ? ([...currencies][0] as string) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Commandes</h1>
        <p className="mt-1 text-sm text-muted">
          Boutique : <span className="font-medium text-night">{shop.name}</span> ·{" "}
          {shop.remoteShopName ? `Jumia : ${shop.remoteShopName}` : "non rattachée"}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
          <p className="mt-3 text-3xl font-semibold text-night">{orders.length}</p>
          <p className="mt-1 text-xs text-muted">100 plus récentes affichées.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total affiché</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {total !== null && currency ? formatMoney(total, currency) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {currencies.size > 1
              ? "Devises multiples : total non additionné."
              : "Montants de notre base."}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Dernière synchro</p>
          <p className="mt-3 text-lg font-semibold text-night">
            {shop.lastSyncAt ? new Date(shop.lastSyncAt).toLocaleString("fr-FR") : "Jamais"}
          </p>
          <p className="mt-1 text-xs text-muted">Statut : {shop.lastSyncStatus ?? "aucun"}</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Synchronisation Jumia</h2>
        <p className="mt-2 text-sm text-muted">
          Récupère les commandes des 30 derniers jours (5 pages de 200 maximum, limites Jumia
          respectées) et les enregistre dans la base.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ExportButton href={`/api/shops/${shop.id}/commandes/export`} count={orders.length} />
          <OrderSyncButton shopId={shop.id} linked={Boolean(shop.remoteShopId)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Commandes enregistrées</h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucune commande enregistrée pour cette boutique. Lancez une synchronisation ci-dessus :
            les données proviennent de Jumia, aucune n&apos;est inventée.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">N°</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Articles</th>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-night">
                      {order.orderNumber ?? order.externalOrderId}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {order.remoteCreatedAt
                        ? new Date(order.remoteCreatedAt).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge badge-neutral">{order.status}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {order.packedItems ?? 0}/{order.totalItems ?? 0}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {[order.customerFirstName, order.customerLastName]
                        .filter(Boolean)
                        .join(" ") || "—"}
                      {order.customerCity ? ` (${order.customerCity})` : ""}
                    </td>
                    <td className="py-2.5 text-right font-medium text-night">
                      {formatMoney(order.totalAmountMinor, order.currency)}
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
