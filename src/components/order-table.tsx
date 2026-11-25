import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { hasMultipleStatuses } from "@/lib/order-status";

export type OrderTableRow = {
  id: string;
  orderNumber: string | null;
  externalOrderId: string;
  status: string;
  currency: string;
  totalAmountMinor: number;
  totalItems: number | null;
  packedItems: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerCity: string | null;
  remoteCreatedAt: Date | null;
  shopName?: string;
};

type Props = {
  rows: OrderTableRow[];
  /** Affiche la colonne boutique (mode multi-boutiques). */
  showShop: boolean;
  empty: string;
};

/** Tableau des commandes enregistrées — aucune donnée n'est fabriquée. */
export function OrderTable({ rows, showShop, empty }: Props) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted" role="status">
        {empty}
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3">N°</th>
            {showShop ? <th className="py-2 pr-3">Boutique</th> : null}
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Statut</th>
            <th className="py-2 pr-3">Articles</th>
            <th className="py-2 pr-3">Client</th>
            <th className="py-2 pr-3">Ville</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="py-2.5 pr-3 font-mono text-xs">
                <Link
                  href={`/commandes/${row.id}`}
                  className="focusable text-night underline decoration-border underline-offset-2 hover:decoration-primary"
                >
                  {row.orderNumber ?? row.externalOrderId}
                </Link>
              </td>
              {showShop ? <td className="py-2.5 pr-3 text-night">{row.shopName ?? "—"}</td> : null}
              <td className="py-2.5 pr-3 text-muted">
                {row.remoteCreatedAt
                  ? new Date(row.remoteCreatedAt).toLocaleDateString("fr-FR")
                  : "—"}
              </td>
              <td className="py-2.5 pr-3">
                <OrderStatusBadge
                  status={row.status}
                  partial={hasMultipleStatuses({
                    status: row.status,
                    packedItems: row.packedItems,
                    totalItems: row.totalItems,
                  })}
                />
              </td>
              <td className="py-2.5 pr-3 text-muted">
                {row.packedItems ?? 0}/{row.totalItems ?? 0}
              </td>
              <td className="py-2.5 pr-3 text-muted">
                {[row.customerFirstName, row.customerLastName].filter(Boolean).join(" ") || "—"}
              </td>
              <td className="py-2.5 pr-3 text-muted">{row.customerCity ?? "—"}</td>
              <td className="py-2.5 text-right font-medium text-night">
                {formatMoney(row.totalAmountMinor, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
