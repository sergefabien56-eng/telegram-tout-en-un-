import { ExportButton } from "@/components/export-button";
import { ScopeNotice } from "@/components/scope-notice";
import Link from "next/link";
import { scopedShops } from "@/lib/shop-scope";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Téléchargements : tous les exports réellement disponibles, bornés aux droits.
 * Chaque fichier est un CSV généré à la demande depuis la base.
 */
export default async function TelechargementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const orders = await scopedShops(user.id, "orders:read");
  const products = await scopedShops(user.id, "products:read");
  const inventory = await scopedShops(user.id, "inventory:read");
  const finance = await scopedShops(user.id, "finance:read");
  const total = Math.max(orders.total, products.total, inventory.total, finance.total);
  const notice = ScopeNotice({ total, allowed: 1 });
  if (notice)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Téléchargements</h1>
        {notice}
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Téléchargements</h1>
        <p className="mt-1 text-sm text-muted">
          Fichiers CSV générés depuis les données enregistrées, pour le périmètre autorisé. Aucun
          fichier n&apos;est conservé sur un serveur tiers.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-2 p-5">
          <h2 className="text-sm font-semibold text-night">Commandes</h2>
          <p className="text-xs text-muted">Numéro, statut, date, montant, articles, ville.</p>
          {orders.allowed.length > 0 ? (
            <ExportButton
              href={
                orders.allowed.length === 1
                  ? `/api/shops/${orders.allowed[0]?.id}/commandes/export`
                  : "/api/commandes/export"
              }
              label="Exporter les commandes (CSV)"
              always
            />
          ) : (
            <p className="text-xs text-danger">Permission « commandes » absente.</p>
          )}
        </div>

        <div className="card space-y-2 p-5">
          <h2 className="text-sm font-semibold text-night">Catalogue</h2>
          <p className="text-xs text-muted">Produit, SKU, déclinaison, prix, devise, stock.</p>
          {products.allowed.length > 0 ? (
            <ExportButton
              href={`/api/shops/${products.allowed[0]?.id}/produits/export`}
              label="Exporter le catalogue (CSV)"
              always
            />
          ) : (
            <p className="text-xs text-danger">Permission « produits » absente.</p>
          )}
        </div>

        <div className="card space-y-2 p-5">
          <h2 className="text-sm font-semibold text-night">Stocks</h2>
          <p className="text-xs text-muted">SKU, stock, date de dernière mise à jour.</p>
          {inventory.allowed.length > 0 ? (
            <ExportButton
              href={`/api/shops/${inventory.allowed[0]?.id}/stocks/export`}
              label="Exporter les stocks (CSV)"
              always
            />
          ) : (
            <p className="text-xs text-danger">Permission « stocks » absente.</p>
          )}
        </div>

        <div className="card space-y-2 p-5">
          <h2 className="text-sm font-semibold text-night">Finances</h2>
          <p className="text-xs text-muted">
            Relevé, CA, livraison, commissions, remboursements, net.
          </p>
          {finance.allowed.length > 0 ? (
            <ExportButton
              href={`/api/shops/${finance.allowed[0]?.id}/finances/export`}
              label="Exporter les finances (CSV)"
              always
            />
          ) : (
            <p className="text-xs text-danger">Permission « finances » absente.</p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Sauvegarde complète</h2>
        <p className="mt-1 text-xs text-muted">
          Copie JSON compressée de toute la base (propriétaire uniquement), depuis la page Santé.
        </p>
        <p className="mt-3">
          <Link href="/sante" className="focusable text-sm text-primary-600 hover:underline">
            Ouvrir la page Santé →
          </Link>
        </p>
      </section>
    </div>
  );
}
