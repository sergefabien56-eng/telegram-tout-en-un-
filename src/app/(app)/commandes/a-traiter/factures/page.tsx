import { listOrdersForShops } from "@/lib/orders";
import { orderScope, parseDay, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { getSessionUser } from "@/lib/session";
import { SubNav } from "@/components/sub-nav";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Sous-vue **Factures à imprimer** de la rubrique B.
 *
 * L'API Jumia Vendor Center utilisée ne fournit pas de factures : la page ne
 * fabrique donc **aucune** facture. Elle indique où les obtenir et rappelle
 * les numéros de commandes enregistrées pour faciliter la recherche.
 *
 * Une étiquette d'expédition n'est pas une facture : rien n'est présenté
 * comme tel.
 */
export default async function FacturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await orderScope(user.id);
  const values = readSearchValues(await searchParams);

  if (scope.total === 0 || scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Factures originales</h1>
        <p className="text-sm text-muted">
          Aucune boutique autorisée : impossible de lister les commandes concernées.
        </p>
      </div>
    );
  }

  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);
  const rows = await listOrdersForShops(shopIds, {
    from: parseDay(values.du),
    to: parseDay(values.au, true),
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Factures à imprimer</h1>
        <p className="mt-1 text-sm text-muted">
          L&apos;API Jumia utilisée ne fournit pas les factures : aucune n&apos;est fabriquée ici.
        </p>
      </div>

      <SubNav
        items={[
          { href: "/commandes/a-traiter/en-attente", label: "En attente" },
          { href: "/commandes/a-traiter/pretes-a-expedier", label: "Prêtes à expédier" },
          { href: "/commandes/a-traiter/factures", label: "Factures à imprimer" },
        ]}
        parent="À traiter"
      />

      <section className="card border-l-4 border-l-warning bg-card p-5" role="note">
        <h2 className="text-sm font-semibold text-night">
          Aucune facture n&apos;est disponible ici
        </h2>
        <p className="mt-2 text-sm text-muted">
          L&apos;API Jumia utilisée par cette application (Vendor Center) ne renvoie pas les
          factures. Par conséquent, cette page n&apos;affiche aucun document fabriqué : téléchargez
          les originaux depuis le{" "}
          <a
            href="https://vendorcenter.jumia.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary-600 underline"
          >
            Vendor Center Jumia
          </a>
          . Ci-dessous, les numéros de commandes enregistrées pour vous aider à les retrouver.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Commandes enregistrées</h2>
        <p className="mt-1 text-xs text-muted">
          {rows.length} commande{rows.length > 1 ? "s" : ""} · 50 plus récentes · les filtres de la
          page « Toutes les commandes » s&apos;appliquent aussi ici via l&apos;URL.
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune commande enregistrée sur cette période.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">N°</th>
                  <th className="py-2 pr-3">Boutique</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Facture</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, shopName }) => (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-night">
                      {order.orderNumber ?? order.externalOrderId}
                    </td>
                    <td className="py-2.5 pr-3 text-night">{shopName}</td>
                    <td className="py-2.5 pr-3 text-muted">
                      {order.remoteCreatedAt
                        ? new Date(order.remoteCreatedAt).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge badge-neutral">{order.status}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">Non exposée par l&apos;API</td>
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
