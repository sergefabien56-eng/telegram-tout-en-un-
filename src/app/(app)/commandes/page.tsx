import { OrderFilters } from "@/components/order-filters";
import { OrderTable, type OrderTableRow } from "@/components/order-table";
import { ExportButton } from "@/components/export-button";
import { OrderSyncButton } from "@/components/order-sync-button";
import { listOrdersForShops } from "@/lib/orders";
import { orderScope, parseDay, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * « Toutes les commandes » : point de consultation unique des boutiques
 * autorisées, sans les mélanger (colonne boutique + filtre). Les données
 * proviennent de notre base, jamais inventées.
 */
export default async function CommandesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await orderScope(user.id);
  const values = readSearchValues(await searchParams);

  if (scope.total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Toutes les commandes</h1>
        <p className="text-sm text-muted">
          Aucune boutique accessible. Créez d&apos;abord une boutique, puis rattachez-la à une
          boutique Jumia.
        </p>
      </div>
    );
  }

  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Toutes les commandes</h1>
        <p className="text-sm text-danger">
          Votre rôle ne permet pas de consulter les commandes de vos boutiques.
        </p>
      </div>
    );
  }

  const shopIds = resolveShopIds(values.boutique, scope.allowed);
  const rows = await listOrdersForShops(shopIds, {
    status: values.statut,
    from: parseDay(values.du),
    to: parseDay(values.au, true),
    limit: 200,
  });

  const tableRows: OrderTableRow[] = rows.map(({ order, shopName }) => ({ ...order, shopName }));
  const currencies = new Set(rows.map((row) => row.order.currency));
  const total =
    currencies.size === 1 ? rows.reduce((sum, row) => sum + row.order.totalAmountMinor, 0) : null;
  const currency = currencies.size === 1 ? ([...currencies][0] as string) : null;
  const shopId = shopIds.length === 1 ? shopIds[0] : undefined;
  const firstShop = scope.allowed[0];
  const linked = Boolean(firstShop?.remoteShopId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Toutes les commandes</h1>
        <p className="mt-1 text-sm text-muted">
          Boutiques autorisées · {rows.length} commande{rows.length > 1 ? "s" : ""} affichée
          {rows.length > 1 ? "s" : ""}
          {rows.length >= 200 ? " (200 plus récentes)" : ""}.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Période affichée</h2>
        <OrderFilters shops={scope.allowed} values={values} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
          <p className="mt-3 text-3xl font-semibold text-night">{rows.length}</p>
          <p className="mt-1 text-xs text-muted">Toutes boutiques autorisées confondues.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total affiché</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {total !== null && currency ? formatMoney(total, currency) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {currencies.size > 1
              ? "Devises multiples : total non additionné."
              : "Montants enregistrés dans notre base."}
          </p>
        </div>
        <div className="card p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Données</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {shopId ? (
              <ExportButton href={`/api/shops/${shopId}/commandes/export`} count={rows.length} />
            ) : (
              <ExportButton
                href="/api/commandes/export"
                count={rows.length}
                label="Exporter la sélection (CSV)"
              />
            )}
            <OrderSyncButton shopId={firstShop?.id ?? ""} linked={linked} />
          </div>
          <p className="mt-2 text-xs text-muted">
            La synchronisation porte sur la première boutique autorisée ; l&apos;export reprend le
            filtre en cours.
          </p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Commandes enregistrées</h2>
        <OrderTable
          rows={tableRows}
          showShop
          empty="Aucune commande enregistrée sur cette période. Lancez une synchronisation : les données proviennent de Jumia, aucune n'est inventée."
        />
      </section>
    </div>
  );
}
