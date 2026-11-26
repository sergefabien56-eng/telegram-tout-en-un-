import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrderForUser } from "@/lib/orders";
import { listOrderItems } from "@/lib/order-items";
import { orderScope } from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import {
  hasMultipleStatuses,
  isPartiallyPacked,
  orderFamily,
  orderStatusLabel,
} from "@/lib/order-status";
import { listShipmentLabels, LABEL_STATUS_AVAILABLE, LABEL_STATUS_PENDING } from "@/lib/shipment-labels";

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

  // Un identifiant qui n'est pas un UUID ne peut pas désigner une commande :
  // on répond « introuvable » au lieu de laisser la base renvoyer une erreur.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

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

  // Les articles et les étiquettes de la commande. Le périmètre reste celui
  // de l'utilisateur : la commande a déjà été validée côté serveur.
  const [articles, etiquettes] = await Promise.all([
    listOrderItems(order.id),
    listShipmentLabels(
      scope.allowed.map((shop) => shop.id),
      { orderIds: [order.id], limit: 50 },
    ),
  ]);

  const famille = orderFamily({
    status: order.status,
    packedItems: order.packedItems,
    totalItems: order.totalItems,
    // Les statuts d'articles décident de la famille quand le statut agrégé
    // n'est pas connu (« Multiple Status ») : sans eux, une commande dont
    // tous les articles sont clos semblerait encore « à traiter ».
    itemStatuses: articles.map((article) => article.status),
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

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Articles</h2>
        <p className="mt-1 text-xs text-muted">
          L&apos;expédition se joue article par article : chaque ligne porte son propre statut et
          son propre numéro de suivi.
        </p>
        {articles.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucun article enregistré pour cette commande. Les articles sont lus depuis Jumia lors
            de la synchronisation des commandes.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Produit</th>
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Suivi</th>
                  <th className="py-2 pr-3">Expédition</th>
                  <th className="py-2 pr-3">Prix</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 text-night">
                      {article.productName ?? "—"}
                      {article.productImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={article.productImageUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="ml-2 inline-block h-8 w-8 rounded object-cover"
                        />
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">
                      {article.sellerSku ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge badge-neutral">
                        {orderStatusLabel(article.status)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-night">
                      {article.trackingNumber ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {article.shipmentType ?? "—"}
                      {article.isFulfilledByJumia ? " (assurée par Jumia)" : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-night">
                      {article.itemPriceMinor === null
                        ? "—"
                        : formatMoney(article.itemPriceMinor, article.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Étiquettes d&apos;expédition</h2>
        <p className="mt-1 text-xs text-muted">
          Documents fournis par Jumia. Une étiquette n&apos;est pas une facture : c&apos;est le
          document à coller sur le colis.
        </p>
        {etiquettes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucune étiquette pour cette commande. Demandez-en l&apos;impression depuis{" "}
            <Link
              href="/commandes/a-traiter/etiquettes"
              className="focusable underline underline-offset-2 hover:text-night"
            >
              Étiquettes à imprimer
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {etiquettes.map((etiquette) => (
              <li
                key={etiquette.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-night">
                    {etiquette.trackingNumber ?? "Colis sans numéro de suivi"}
                    {etiquette.countryCode ? ` · ${etiquette.countryCode}` : ""}
                  </p>
                  <p className="text-xs text-muted">
                    {etiquette.itemCount} article{etiquette.itemCount > 1 ? "s" : ""}
                    {etiquette.status === LABEL_STATUS_AVAILABLE
                      ? ""
                      : etiquette.status === LABEL_STATUS_PENDING
                        ? " · document pas encore disponible"
                        : ` · refusé par Jumia${etiquette.errorMessage ? ` : ${etiquette.errorMessage}` : ""}`}
                  </p>
                </div>
                {etiquette.status === LABEL_STATUS_AVAILABLE && etiquette.pdf ? (
                  <a
                    href={`/api/etiquettes/${etiquette.id}/pdf`}
                    className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                    download
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    Télécharger le PDF
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
