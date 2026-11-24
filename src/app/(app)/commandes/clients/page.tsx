import { OrderFilters } from "@/components/order-filters";
import { listOrderCustomers } from "@/lib/orders";
import { orderScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Clients : informations strictement nécessaires issues des commandes
 * (identité + ville). Notre base ne stocke ni téléphone ni adresse, donc rien
 * de plus n'est exposé.
 */
export default async function ClientsPage({
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
        <h1 className="text-2xl font-semibold text-night">Clients</h1>
        <p className="text-sm text-muted">Aucune boutique accessible.</p>
      </div>
    );
  }
  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Clients</h1>
        <p className="text-sm text-danger">
          Votre rôle ne permet pas de consulter les commandes de vos boutiques.
        </p>
      </div>
    );
  }

  const shopIds = resolveShopIds(values.boutique, scope.allowed);
  const customers = await listOrderCustomers(shopIds);
  const singleShop = shopIds.length === 1 ? (scope.allowed.find((s) => s.id === shopIds[0]) ?? null) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Clients</h1>
        <p className="mt-1 text-sm text-muted">
          Informations issues des commandes enregistrées : identité et ville uniquement.
        </p>
        <p className="mt-1 text-xs text-muted">
          Aucun téléphone ni adresse n&apos;est conservé dans notre base ; ces colonnes n&apos;existent
          donc pas ici.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Boutique</h2>
        <OrderFilters shops={scope.allowed} values={{ ...values, du: undefined, au: undefined, statut: undefined }} />
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Clients recensés</h2>
        {customers.length === 0 ? (
          <p className="mt-3 text-sm text-muted" role="status">
            Aucune commande enregistrée : aucun client à lister. Les données proviennent des
            commandes synchronisées, aucune n&apos;est inventée.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Ville</th>
                  <th className="py-2 pr-3">Commandes</th>
                  <th className="py-2 pr-3">Dernier achat</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row, index) => (
                    <tr
                      key={`${row.firstName ?? ""}-${row.lastName ?? ""}-${row.city ?? ""}-${index}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2.5 pr-3 text-night">
                        {[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{row.city ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-muted">{row.commands}</td>
                      <td className="py-2.5 pr-3 text-muted">
                        {row.lastAt ? new Date(row.lastAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="py-2.5 text-right font-medium text-night">
                        {singleShop ? formatMoney(row.totalMinor, singleShop.currency) : "—"}
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
