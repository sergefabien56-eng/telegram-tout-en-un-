import Link from "next/link";
import { orderScope, readSearchValues } from "@/lib/order-access";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Statuts réellement observés — cf. `src/lib/order-status.ts`. */
const STATUTS = [
  { value: "PENDING", label: "En attente" },
  { value: "READY_TO_SHIP", label: "Prête à expédier" },
  { value: "SHIPPED", label: "Expédiée" },
  { value: "DELIVERED", label: "Livrée" },
  { value: "CANCELED", label: "Annulée" },
  { value: "FAILED", label: "Échec de livraison" },
  { value: "RETURNED", label: "Retournée" },
  { value: "REFUNDED", label: "Remboursée" },
  { value: "Multiple Status", label: "Statuts multiples" },
];

/**
 * Exports : télécharger les commandes autorisées selon un périmètre (boutiques,
 * période, statut). Le fichier est généré par l'API, qui vérifie les droits sur
 * chaque boutique cochée.
 */
export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await orderScope(user.id);
  const values = readSearchValues(await searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Exports</h1>
        <p className="mt-1 text-sm text-muted">
          Téléchargez les commandes autorisées, pour le périmètre choisi. Les boutiques sans droit «
          commandes:lecture » ne sont pas proposées et l&apos;API les écarterait de toute façon.
        </p>
        <p className="mt-2 text-sm text-muted">
          L&apos;export est aussi disponible directement depuis{" "}
          <Link
            href="/commandes"
            className="font-medium text-primary-600 underline underline-offset-2"
          >
            Toutes les commandes
          </Link>
          , où il reprend exactement les filtres affichés (boutique, période, statut).
        </p>
      </div>

      {scope.total === 0 ? (
        <section className="card p-5">
          <p className="text-sm text-muted">Aucune boutique accessible.</p>
        </section>
      ) : scope.allowed.length === 0 ? (
        <section className="card p-5">
          <p className="text-sm text-danger">
            Votre rôle ne permet pas d&apos;exporter les commandes de vos boutiques.
          </p>
        </section>
      ) : (
        <form action="/api/commandes/export" method="get" className="card space-y-4 p-5">
          <fieldset>
            <legend className="text-sm font-semibold text-night">Boutiques</legend>
            <p className="mt-1 text-xs text-muted">
              Décochez une boutique pour l&apos;exclure ; sans aucune case cochée, toutes sont
              incluses.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {scope.allowed.map((shop) => (
                <label key={shop.id} className="flex items-center gap-2 text-sm text-night">
                  <input
                    type="checkbox"
                    name="shopIds"
                    value={shop.id}
                    defaultChecked={values.boutique ? values.boutique === shop.id : true}
                    className="h-4 w-4 rounded border-border"
                  />
                  {shop.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Du
              <input
                type="date"
                name="from"
                defaultValue={values.du}
                className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Au
              <input
                type="date"
                name="to"
                defaultValue={values.au}
                className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Statut
              <select
                name="status"
                defaultValue={values.statut ?? ""}
                className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
              >
                <option value="">Tous</option>
                {STATUTS.map((statut) => (
                  <option key={statut.value} value={statut.value}>
                    {statut.label} ({statut.value})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Télécharger le CSV
          </button>
          <p className="text-xs text-muted">
            Séparateur « ; », BOM UTF-8 (Excel), montants en unités mineures. Chaque export est
            inscrit au journal d&apos;audit.
          </p>
        </form>
      )}
    </div>
  );
}
