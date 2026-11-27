import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderFilters } from "@/components/order-filters";
import { LabelPrintPanel } from "@/components/label-print-panel";
import { SubNav } from "@/components/sub-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi } from "@/components/ui/kpi";
import { Section } from "@/components/ui/section";
import { countPrintableItems } from "@/lib/order-items";
import {
  isRefusedScope,
  orderScope,
  parseDay,
  readSearchValues,
  resolveShopIds,
} from "@/lib/order-access";
import { getSessionUser } from "@/lib/session";
import {
  countShipmentLabelsByStatus,
  listShipmentLabels,
  LABEL_STATUS_AVAILABLE,
  LABEL_STATUS_ERROR,
  LABEL_STATUS_PENDING,
  type ShipmentLabelListRow,
} from "@/lib/shipment-labels";
import { Printer } from "lucide-react";

export const metadata: Metadata = {
  title: "Étiquettes à imprimer",
};

export const dynamic = "force-dynamic";

const SOUS_VUES = [
  { href: "/commandes/a-traiter/en-attente", label: "En attente" },
  { href: "/commandes/a-traiter/pretes-a-expedier", label: "Prêtes à expédier" },
  { href: "/commandes/a-traiter/etiquettes", label: "Étiquettes à imprimer" },
];

/**
 * Sous-vue **Étiquettes à imprimer** de la rubrique B.
 *
 * Une étiquette d'expédition n'est **pas** une facture : ce sont deux
 * documents différents, fournis par deux endpoints différents. Jumia expose
 * les étiquettes via `POST /orders/print-labels`, qui renvoie le PDF du
 * colis, son numéro de suivi et les articles qu'il couvre.
 *
 * Deux sections, jamais fusionnées :
 * - **Prêtes à expédier** : les étiquettes disponibles, téléchargeables ;
 * - **En attente** : les étiquettes demandées dont le document n'est pas
 *   encore arrivé, et celles que Jumia a refusées (le motif est affiché).
 *
 * Une réponse partielle reste visible comme telle : un refus ne masque pas
 * les colis produits, et un succès ne masque pas un refus.
 */
export default async function EtiquettesPage({
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
        <h1 className="text-2xl font-semibold text-night">Étiquettes à imprimer</h1>
        <EmptyState
          title="Aucune boutique accessible"
          description="Créez une boutique et rattachez-la à une boutique Jumia : les étiquettes apparaîtront après la première synchronisation."
        />
      </div>
    );
  }
  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Étiquettes à imprimer</h1>
        <EmptyState
          tone="danger"
          title="Accès refusé"
          description="Votre rôle ne permet pas de consulter les commandes de vos boutiques."
        />
      </div>
    );
  }

  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);
  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Étiquettes à imprimer</h1>
        <EmptyState
          tone="danger"
          title="Cette boutique n’est pas dans votre périmètre"
          description="Aucune donnée ne peut être affichée pour une boutique à laquelle vous n’avez pas accès."
        />
      </div>
    );
  }

  const filtres = { from: parseDay(values.du), to: parseDay(values.au, true) };

  const [compteurs, disponibles, enAttente, eligibles] = await Promise.all([
    countShipmentLabelsByStatus(shopIds),
    listShipmentLabels(shopIds, { ...filtres, status: [LABEL_STATUS_AVAILABLE], limit: 200 }),
    listShipmentLabels(shopIds, {
      ...filtres,
      status: [LABEL_STATUS_PENDING, LABEL_STATUS_ERROR],
      limit: 200,
    }),
    countPrintableItems(shopIds, filtres),
  ]);

  const boutiqueFiltree =
    shopIds.length === 1 ? scope.allowed.find((row) => row.id === shopIds[0]) : undefined;
  const multi = shopIds.length > 1;

  const syncOptions = scope.allowed.map((shop) => ({
    id: shop.id,
    name: shop.name,
    linked: Boolean(shop.remoteShopId),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Étiquettes à imprimer</h1>
        <p className="mt-1 text-sm text-muted">
          Les étiquettes d&apos;expédition fournies par Jumia, telles qu&apos;elles sont reçues :
          le PDF est téléchargé sans aucune modification. Une étiquette n&apos;est pas une
          facture — ce sont deux documents différents.
        </p>
      </div>

      <SubNav items={SOUS_VUES} parent="À traiter" />

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Période affichée</h2>
        <OrderFilters shops={scope.allowed} values={values} currentShopId={scope.currentShopId} />
        <p className="mt-3 text-xs text-muted" role="status">
          {boutiqueFiltree ? (
            <>
              Filtre actif : <span className="font-medium text-night">{boutiqueFiltree.name}</span>{" "}
              — seules ses étiquettes sont affichées.
            </>
          ) : multi ? (
            <>
              Filtre actif :{" "}
              <span className="font-medium text-night">toutes les boutiques</span> — chaque ligne
              indique sa boutique.
            </>
          ) : null}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Étiquettes disponibles"
          value={compteurs.available}
          hint="Étiquettes dont le PDF est disponible et téléchargeable."
          icon={<Printer className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label="En attente"
          value={compteurs.pending + compteurs.error}
          tone={compteurs.error > 0 ? "warning" : "default"}
          hint={`${compteurs.pending} document(s) pas encore disponible(s) · ${compteurs.error} refus(s) par Jumia.`}
        />
        <Kpi
          label="Articles à imprimer"
          value={eligibles}
          hint="Articles en attente d'expédition ou prêts à expédier, dont l'étiquette n'a pas encore été demandée. Jumia refuse un article annulé, expédié ou livré."
        />
      </section>

      <Section
        title="Imprimer les étiquettes"
        description="L'opération demande les étiquettes à Jumia (POST /orders/print-labels), enregistre les PDF reçus et reporte les numéros de suivi sur les articles concernés."
      >
        <LabelPrintPanel
          shopId={boutiqueFiltree?.id ?? scope.currentShopId ?? ""}
          options={syncOptions}
          eligibleCount={eligibles}
          from={values.du}
          to={values.au}
        />
      </Section>

      <Section
        title="Prêtes à expédier"
        description="Étiquettes disponibles : le document PDF est prêt à être imprimé et collé sur le colis."
      >
        {disponibles.length === 0 ? (
          <EmptyState
            title="Aucune étiquette disponible"
            description="Aucune étiquette n'a encore été obtenue pour cette période et ce périmètre. Utilisez « Imprimer les étiquettes » ci-dessus : les PDF arrivent dans cette section dès que Jumia les renvoie."
          />
        ) : (
          <LabelTable rows={disponibles} showShop={multi} />
        )}
      </Section>

      <Section
        title="En attente"
        description="Étiquettes demandées dont le document n'est pas encore arrivé, et étiquettes refusées par Jumia. Les deux états sont distingués : un refus n'est jamais présenté comme une attente."
      >
        {enAttente.length === 0 ? (
          <EmptyState
            title="Aucune étiquette en attente"
            description="Toutes les étiquettes de cette période sont disponibles, ou aucune impression n'a été demandée."
          />
        ) : (
          <LabelTable rows={enAttente} showShop={multi} />
        )}
      </Section>
    </div>
  );
}

/**
 * Liste des étiquettes.
 *
 * Les colonnes ne montrent que ce qui est connu : le numéro de suivi quand
 * Jumia l'a fourni, le motif exact quand il a refusé.
 */
function LabelTable({
  rows,
  showShop,
}: {
  rows: ShipmentLabelListRow[];
  showShop: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3">N° commande</th>
            {showShop ? <th className="py-2 pr-3">Boutique</th> : null}
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Suivi</th>
            <th className="py-2 pr-3">Articles</th>
            <th className="py-2 pr-3">État</th>
            <th className="py-2 pr-3">Document</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="py-2.5 pr-3 font-mono text-xs text-night">
                <Link
                  href={`/commandes/${row.orderId}`}
                  className="focusable underline underline-offset-2 hover:text-primary-600"
                >
                  {row.orderNumber ?? row.externalOrderId}
                </Link>
              </td>
              {showShop ? <td className="py-2.5 pr-3 text-night">{row.shopName}</td> : null}
              <td className="py-2.5 pr-3 text-muted">
                {row.remoteCreatedAt
                  ? new Date(row.remoteCreatedAt).toLocaleDateString("fr-FR")
                  : "—"}
              </td>
              <td className="py-2.5 pr-3 font-mono text-xs text-night">
                {row.trackingNumber ?? "—"}
              </td>
              <td className="py-2.5 pr-3 text-muted">
                {row.itemCount} article{row.itemCount > 1 ? "s" : ""}
              </td>
              <td className="py-2.5 pr-3">
                {row.status === LABEL_STATUS_AVAILABLE ? (
                  <span className="badge badge-success">Disponible</span>
                ) : row.status === LABEL_STATUS_PENDING ? (
                  <span className="badge badge-neutral">Pas encore disponible</span>
                ) : (
                  <span className="badge badge-danger">Erreur Jumia</span>
                )}
                {row.status === LABEL_STATUS_ERROR && row.errorMessage ? (
                  <span className="mt-1 block text-xs text-muted">
                    {row.errorCode ? `${row.errorCode} — ` : ""}
                    {row.errorMessage}
                  </span>
                ) : null}
                {row.status === LABEL_STATUS_PENDING && row.errorMessage ? (
                  <span className="mt-1 block text-xs text-muted">{row.errorMessage}</span>
                ) : null}
              </td>
              <td className="py-2.5 pr-3">
                {row.status === LABEL_STATUS_AVAILABLE && row.pdf ? (
                  <a
                    href={`/api/etiquettes/${row.id}/pdf`}
                    className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                    download
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    Télécharger le PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted">Aucun document</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
