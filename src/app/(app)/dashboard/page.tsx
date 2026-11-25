import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  FileText,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { dashboardOverview } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { isRefusedScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { memberScope } from "@/lib/shop-scope";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Kpi } from "@/components/ui/kpi";
import { EmptyState } from "@/components/ui/empty-state";
import { ScopeBar } from "@/components/ui/scope-bar";
import { ShopScopeSelect } from "@/components/shop-scope-select";

export const dynamic = "force-dynamic";

/**
 * TABLEAU DE BORD — centre de pilotage.
 *
 * Cet écran ne montre que l'essentiel, et **toujours pour le périmètre
 * affiché** : la boutique choisie dans l'en-tête par défaut, ou celle
 * demandée dans l'URL (`?boutique=`). Les autres rubriques ont leur propre
 * page — ici, on ne fait que pointer vers elles.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const values = readSearchValues(await searchParams);
  const daysRaw = Number(values.days ?? "30");
  const period = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 90 ? daysRaw : 30;

  const scope = await memberScope(user.id);
  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);
  const refused = isRefusedScope(values, shopIds);
  const aggregate = shopIds.length > 1;

  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tableau de bord" description="Aucun espace de travail pour l’instant." />
        <EmptyState
          icon={<Store className="h-6 w-6" aria-hidden="true" />}
          title="Aucune boutique accessible"
          description="Créez une boutique, puis rattachez-la à un compte vendeur Jumia : les indicateurs resteront vides tant que rien n’est réellement synchronisé."
          action={
            <Link
              href="/boutiques"
              className="focusable rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Gérer mes boutiques
            </Link>
          }
        />
      </div>
    );
  }

  if (refused) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tableau de bord" />
        <EmptyState
          tone="danger"
          icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
          title="Cette boutique n’est pas dans votre périmètre"
          description="Vous n’avez pas accès à cette boutique, ou elle n’existe plus. Aucun chiffre n’est affiché : un tableau vide laisserait croire à une absence de données."
        />
      </div>
    );
  }

  const overview = await dashboardOverview(user.id, period, shopIds);
  const kpis = overview.kpis;

  // Permissions : chaque bloc vérifie la sienne, sur le périmètre affiché.
  const access = shopIds.length === 1 ? await getShopAccess(user.id, shopIds[0]!) : null;
  const canSeeFinance =
    shopIds.length > 1 ? true : Boolean(access?.permissions.has("finance:read"));
  const canSeeReports =
    shopIds.length > 1 ? true : Boolean(access?.permissions.has("reports:read"));
  const canSeeInventory =
    shopIds.length > 1 ? true : Boolean(access?.permissions.has("inventory:read"));

  const shopNames = overview.scope.names;
  const scopeLabel = aggregate ? `${shopIds.length} boutiques` : (shopNames[0] ?? "Boutique");
  const scopeDetail = `${overview.period.from} → ${overview.period.to} · ${overview.period.days} jours`;

  const allHref = aggregate ? "/performances" : "/performances?boutique=toutes";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        description="L’état de votre espace : ce qui est vendu, ce qui doit être surveillé, ce qui a changé."
        actions={
          <ShopScopeSelect
            shops={scope.allowed.map((shop) => ({ id: shop.id, name: shop.name }))}
            value={aggregate ? "toutes" : (shopIds[0] ?? "")}
          />
        }
      >
        <ScopeBar
          label={scopeLabel}
          detail={scopeDetail}
          allHref={allHref}
          allLabel="Comparer toutes mes boutiques"
          actions={
            <form method="GET" className="flex items-center gap-2">
              {values.boutique ? (
                <input type="hidden" name="boutique" value={values.boutique} />
              ) : null}
              <label htmlFor="periode" className="text-xs text-muted">
                Période
              </label>
              <select
                id="periode"
                name="days"
                defaultValue={String(period)}
                className="focusable rounded-lg border border-border bg-surface px-2 py-1 text-sm text-night"
              >
                <option value="7">7 jours</option>
                <option value="30">30 jours</option>
                <option value="90">90 jours</option>
              </select>
              <button
                type="submit"
                className="focusable rounded-lg border border-border bg-surface px-3 py-1 text-sm font-medium text-night hover:bg-border"
              >
                Actualiser
              </button>
            </form>
          }
        />
      </PageHeader>

      {/* Chiffres clés — toujours sur le périmètre affiché. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="CA commandes"
          value={formatMoney(kpis.revenueMinor, kpis.currency)}
          hint={`Commandes livrées ou expédiées sur ${overview.period.days} j · ${kpis.orders} commandes${kpis.canceledOrders ? ` · ${kpis.canceledOrders} annulée(s)` : ""}`}
          icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label="Articles vendus"
          value={kpis.units.toLocaleString("fr-FR")}
          hint={`Unités commandées · ${kpis.products} produits${canSeeInventory ? ` · ${kpis.variants} déclinaisons` : ""}`}
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label="Stocks faibles"
          value={canSeeInventory ? kpis.lowStock.toLocaleString("fr-FR") : "—"}
          tone={canSeeInventory && kpis.lowStock > 0 ? "warning" : "default"}
          hint={
            canSeeInventory
              ? kpis.lowStock > 0
                ? "Déclinaisons à 5 unités ou moins : à réapprovisionner."
                : "Aucune déclinaison sous le seuil de 5 unités."
              : "Votre rôle ne permet pas de lire les stocks sur cette boutique."
          }
          icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label="Net à verser (Jumia)"
          value={canSeeFinance ? formatMoney(overview.finances.netMinor, kpis.currency) : "—"}
          tone={canSeeFinance && overview.finances.unpaid ? "warning" : "default"}
          hint={
            !canSeeFinance
              ? "Votre rôle ne permet pas de lire les finances sur cette boutique."
              : overview.finances.statements === 0
                ? "Aucun relevé synchronisé : rien à verser d'après nos données."
                : `${overview.finances.statements} relevé(s) · ${overview.finances.unpaid ? "au moins un non payé" : "tous payés"}`
          }
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alertes prioritaires */}
        <Section
          title="Alertes prioritaires"
          description="Ce qui demande une action — pas ce qui est simplement inhabituel."
          action={
            <Link
              href="/alertes"
              className="focusable font-medium text-primary-600 hover:underline"
            >
              Tout voir →
            </Link>
          }
          className="lg:col-span-2"
        >
          {overview.alerts.length === 0 ? (
            <EmptyState
              title="Rien à traiter"
              description="Aucune alerte sur les données enregistrées pour cette période. Les stocks, les versements et les synchronisations sont au vert."
            />
          ) : (
            <ul className="space-y-2">
              {overview.alerts.slice(0, 5).map((alert, index) => (
                <li
                  key={`${alert.kind}-${index}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span className="font-medium text-night">{alert.label}</span>
                  <span className="text-muted">{alert.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Accès rapides */}
        <Section title="Accès rapides" description="Les actions du quotidien.">
          <ul className="space-y-1">
            <Shortcut
              href="/commandes/a-traiter"
              icon={<ShoppingCart className="h-4 w-4" />}
              label="Commandes à traiter"
            />
            <Shortcut
              href="/commandes/expediees"
              icon={<Truck className="h-4 w-4" />}
              label="Commandes expédiées"
            />
            <Shortcut
              href="/stocks"
              icon={<Boxes className="h-4 w-4" />}
              label="Stocks à surveiller"
            />
            <Shortcut
              href="/finances"
              icon={<Wallet className="h-4 w-4" />}
              label="Relevés et versements"
            />
            <Shortcut
              href="/rapports"
              icon={<BarChart3 className="h-4 w-4" />}
              label="Rapports détaillés"
            />
            <Shortcut
              href="/boutiques/synchronisations"
              icon={<RefreshCw className="h-4 w-4" />}
              label="Synchronisations"
            />
          </ul>
        </Section>
      </div>

      {/* Santé des boutiques : l'écran multi-boutique. */}
      {overview.shops.length > 0 ? (
        <Section
          title="État de mes boutiques"
          description="État calculé à partir des faits : lien distant, compte vendeur, données reçues, dernière synchronisation."
          action={
            canSeeReports ? (
              <Link
                href="/performances"
                className="focusable font-medium text-primary-600 hover:underline"
              >
                Comparer les performances →
              </Link>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Boutique</th>
                  <th className="py-2 pr-3">État</th>
                  <th className="py-2 pr-3 text-right">CA période</th>
                  <th className="py-2 pr-3 text-right">Commandes</th>
                  <th className="py-2 text-right">Dernière synchro.</th>
                </tr>
              </thead>
              <tbody>
                {overview.shops.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-night">{row.name}</span>
                      {!row.connection.operational ? (
                        <span className="mt-0.5 block text-xs text-warning">
                          {row.connection.detail}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`badge ${
                          row.connection.operational ? "badge-success" : "badge-warning"
                        }`}
                      >
                        {row.connection.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-night">
                      {formatMoney(row.revenueMinor, kpis.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{row.orders}</td>
                    <td className="py-2.5 text-right text-xs text-muted">
                      {row.lastSyncAt
                        ? new Date(row.lastSyncAt).toLocaleString("fr-FR")
                        : "Jamais synchronisée"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {/* Dernières activités : résumé, la page complète est ailleurs. */}
      <Section
        title="Dernières activités"
        description="Les actions enregistrées sur cet espace."
        action={
          <Link
            href="/activites"
            className="focusable font-medium text-primary-600 hover:underline"
          >
            Journal complet →
          </Link>
        }
      >
        {overview.activity.length === 0 ? (
          <EmptyState
            title="Aucune action enregistrée"
            description="Le journal se remplit dès qu'une synchronisation, une réparation ou un changement de rôle intervient."
          />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {overview.activity.slice(0, 6).map((row, index) => (
              <li
                key={`${row.createdAt.getTime()}-${index}`}
                className="flex flex-wrap items-center gap-3 border-b border-border/60 py-1.5 last:border-0"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="font-mono text-xs text-night">{row.action}</span>
                <span
                  className={`text-xs ${
                    row.result === "success"
                      ? "text-success"
                      : row.result === "blocked"
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {row.result}
                </span>
                <span className="ml-auto text-xs text-muted">
                  {new Date(row.createdAt).toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="pb-2 text-xs leading-relaxed text-muted">
        Deux mesures distinctes, jamais mélangées : le <strong>CA commandes</strong> vient des
        commandes livrées ou expédiées sur la période choisie ; le <strong>CA articles</strong>{" "}
        (rubrique Finances) vient des relevés de versement publiés par Jumia et couvre sa propre
        période. Tous les montants proviennent des données enregistrées ; aucun n&apos;est estimé.
      </p>
    </div>
  );
}

function Shortcut({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="focusable flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-night hover:bg-surface"
      >
        <span className="text-primary-ink">{icon}</span>
        <span className="flex-1">{label}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}
