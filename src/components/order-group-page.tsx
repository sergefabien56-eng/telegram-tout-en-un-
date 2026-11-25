import { OrderFilters } from "@/components/order-filters";
import { OrderTable, type OrderTableRow } from "@/components/order-table";
import { listOrdersForShops, orderStatusGroup, ORDER_STATUS_GROUPS } from "@/lib/orders";
import type { OrderGroup } from "@/lib/orders";
import {
  isRefusedScope,
  orderScope,
  parseDay,
  readSearchValues,
  resolveShopIds,
} from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

type Props = {
  group: OrderGroup;
  title: string;
  description: string;
  empty: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Rubrique « Ventes et commandes » basée sur un groupe de statuts Jumia.
 * N'affiche que des commandes réellement enregistrées dans notre base.
 */
export async function OrderGroupPage({ group, title, description, empty, searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await orderScope(user.id);
  const values = readSearchValues(await searchParams);

  if (scope.total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
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
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
        <p className="text-sm text-danger">
          Votre rôle ne permet pas de consulter les commandes de vos boutiques.
        </p>
      </div>
    );
  }

  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);

  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
        <p className="text-sm text-danger" role="alert">
          Cette boutique n&apos;est pas dans votre périmètre : aucune donnée ne peut être affichée.
        </p>
      </div>
    );
  }

  const fetched = await listOrdersForShops(shopIds, {
    status: values.statut,
    from: parseDay(values.du),
    to: parseDay(values.au, true),
    limit: 200,
  });
  const rows = fetched.filter(({ order }) => orderStatusGroup(order.status) === group);

  const tableRows: OrderTableRow[] = rows.map(({ order, shopName }) => ({ ...order, shopName }));
  const currencies = new Set(rows.map((row) => row.order.currency));
  const total =
    currencies.size === 1 ? rows.reduce((sum, row) => sum + row.order.totalAmountMinor, 0) : null;
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const statuts = (ORDER_STATUS_GROUPS[group] as readonly string[]).join(" · ").toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <p className="mt-1 text-xs text-muted">Statuts pris en compte : {statuts}.</p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Période affichée</h2>
        <OrderFilters
          shops={scope.allowed}
          values={values}
          currentShopId={scope.currentShopId}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
          <p className="mt-3 text-3xl font-semibold text-night">{rows.length}</p>
          <p className="mt-1 text-xs text-muted">Boutiques autorisées · 200 plus récentes.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total affiché</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {total !== null && currency ? formatMoney(total, currency) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">Montants enregistrés dans notre base.</p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Commandes</h2>
        <OrderTable rows={tableRows} showShop empty={empty} />
      </section>
    </div>
  );
}
