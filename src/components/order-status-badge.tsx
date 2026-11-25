import { orderStatusLabel } from "@/lib/order-status";

/**
 * Pastille de statut.
 *
 * Le libellé est **humain** (« Prête à expédier ») et le statut Jumia brut
 * reste visible entre parenthèses : rien n'est masqué, rien n'est inventé.
 */
export function OrderStatusBadge({
  status,
  tone,
  partial,
}: {
  status: string;
  tone?: "default" | "warning" | "success" | "danger";
  /** Préparation partielle : la commande n'est pas prête. */
  partial?: boolean;
}) {
  const classes =
    tone === "warning"
      ? "badge badge-warning"
      : tone === "danger"
        ? "badge badge-danger"
        : tone === "success"
          ? "badge badge-success"
          : "badge badge-neutral";
  const brut = status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return (
    <span className={`${classes} gap-1`}>
      {orderStatusLabel(status)}
      <span className="font-normal opacity-80">{brut}</span>
      {partial ? <span className="font-normal opacity-80">(préparation partielle)</span> : null}
    </span>
  );
}
