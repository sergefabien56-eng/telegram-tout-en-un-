import Link from "next/link";
import { listActiveOrderAlerts, type OrderAlertView } from "@/lib/order-alerts";
import { MarkAlertReadButton } from "@/components/mark-alert-read-button";

/**
 * LISTE DES ALERTES DE COMMANDES — page « Alertes ».
 *
 * Rendue **côté serveur** : la liste ne dépend pas du JavaScript, et le
 * périmètre de l'utilisateur est appliqué par la requête elle-même.
 *
 * Chaque alerte propose l'action adaptée à l'état courant de la commande :
 * « Voir et préparer » tant qu'elle attend sa préparation, une autre action
 * une fois qu'elle est prête — jamais une seconde préparation.
 */

const NIVEAU_STYLE: Record<OrderAlertView["priority"], string> = {
  critical: "border-danger/40 bg-danger/5",
  warning: "border-warning/40 bg-warning/5",
  info: "border-border bg-surface",
};

const NIVEAU_TEXTE: Record<OrderAlertView["priority"], string> = {
  critical: "text-danger",
  warning: "text-warning",
  info: "text-muted",
};

const NIVEAU_LABEL: Record<OrderAlertView["priority"], string> = {
  critical: "Critique",
  warning: "À traiter",
  info: "Information",
};

const KIND_LABEL: Record<OrderAlertView["kind"], string> = {
  nouvelle_commande: "Commande",
  delai_24h: "Délai de préparation",
  synchronisation: "Synchronisation",
};

export async function OrderAlertsList({
  userId,
  shopIds,
}: {
  userId: string;
  shopIds: string[];
}) {
  const alerts = await listActiveOrderAlerts({ userId, shopIds });

  if (alerts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucune commande n&apos;attend d&apos;action sur ce périmètre. Les nouvelles commandes
        apparaissent ici dès qu&apos;elles sont récupérées, et les commandes qui dépassent le
        seuil préventif de préparation remontent d&apos;elles-mêmes.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="alertes-commandes">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`rounded-xl border px-4 py-3 ${NIVEAU_STYLE[alert.priority]} ${
            alert.read ? "" : "ring-1 ring-primary/30"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${NIVEAU_TEXTE[alert.priority]}`}>
                {alert.title}
              </p>
              <p className="mt-0.5 text-sm text-muted">{alert.body}</p>
            </div>
            <span className="badge badge-neutral shrink-0">{alert.shopName}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="uppercase tracking-wide text-muted">{KIND_LABEL[alert.kind]}</span>
            <span className="text-muted">{NIVEAU_LABEL[alert.priority]}</span>
            <span className="text-muted">
              {new Date(alert.updatedAt).toLocaleString("fr-FR")}
            </span>
            {!alert.read ? (
              <span className="badge badge-warning">Non vue</span>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!alert.read ? <MarkAlertReadButton alertId={alert.id} /> : null}
              <Link
                href={alert.action.href}
                className="focusable rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
              >
                {alert.action.label}
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
