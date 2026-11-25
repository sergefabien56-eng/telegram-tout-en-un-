import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrderForUser } from "@/lib/orders";
import { orderScope } from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import { hasMultipleStatuses, isPartiallyPacked, orderFamily } from "@/lib/order-status";

export const metadata: Metadata = {
  title: "Détail de la commande",
};

export const dynamic = "force-dynamic";

/** Libellés des familles, utilisés dans le bandeau de situation. */
const FAMILLES: Record<string, string> = {
  "en-attente": "En attente de préparation",
  "pretes-a-expedier": "Prête à expédier",
  expediees: "Expédiée",
  livrees: "Livrée",
  annulees: "Annulée",
  "echec-livraison": "Échec de livraison",
  retours: "Retour",
};

/**
 * Détail d'une commande.
 *
 * Le périmètre est résolu **côté serveur** : une commande appartenant à une
 * boutique non autorisée ne renvoie rien — ni contenu, ni code d'erreur
 * permettant de deviner son existence.
 */
export default async function CommandeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const scope = await orderScope(user.id);
  if (scope.allowed.length === 0) {
    return (
      <EmptyState
        tone="danger"
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les commandes de vos boutiques."
      />
    );
  }

  const order = await getOrderForUser(
    id,
    scope.allowed.map((shop) => shop.id),
  );
  if (!order) notFound();

  const famille = orderFamily({
    status: order.status,
    packedItems: order.packedItems,
    totalItems: order.totalItems,
  });
  const multi = hasMultipleStatuses({
    status: order.status,
    packedItems: order.packedItems,
    totalItems: order.totalItems,
  });
  const partiel = isPartiallyPacked({
    status: order.status,
    packedItems: order.packedItems,
    totalItems: order.totalItems,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/commandes"
          className="focusable text-sm text-muted underline underline-offset-2 hover:text-night"
        >
          ← Retour à l&apos;historique
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-night">
          Commande {order.orderNumber ?? order.externalOrderId}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Boutique : <span className="text-night">{order.shopName}</span>
        </p>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-night">Situation</h2>
          <OrderStatusBadge status={order.status} partial={multi} />
          <span className="badge badge-neutral">{FAMILLES[famille] ?? famille}</span>
        </div>
        {partiel ? (
          <p role="note" className="mt-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-night">
            Préparation partielle : {order.packedItems ?? 0} article(s) emballé(s) sur{" "}
            {order.totalItems ?? 0}. Cette commande n&apos;est donc pas comptée parmi les commandes
            prêtes à expédier.
          </p>
        ) : null}
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Montant</dt>
            <dd className="mt-1 text-sm text-night">
              {formatMoney(order.totalAmountMinor, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Articles</dt>
            <dd className="mt-1 text-sm text-night">
              {order.totalItems ?? 0} article(s), {order.packedItems ?? 0} emballé(s)
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Créée le</dt>
            <dd className="mt-1 text-sm text-night">
              {order.remoteCreatedAt ? new Date(order.remoteCreatedAt).toLocaleString("fr-FR") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Dernière mise à jour</dt>
            <dd className="mt-1 text-sm text-night">
              {order.remoteUpdatedAt ? new Date(order.remoteUpdatedAt).toLocaleString("fr-FR") : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Livraison</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Localité</dt>
            <dd className="mt-1 text-sm text-night">{order.customerCity ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Identifiant Jumia</dt>
            <dd className="mt-1 font-mono text-xs text-night">{order.externalOrderId}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Le détail d&apos;une commande n&apos;affiche ni nom, ni téléphone, ni adresse : ces
          informations ne sont pas enregistrées par l&apos;application.
        </p>
      </section>
    </div>
  );
}
