import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { dashboardOverview } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { DashboardSearch } from "@/components/dashboard-search";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Tableau de bord — rubriques demandées : vue d'ensemble, recherche,
 * apparence, indicateurs financiers, performances globales, activités
 * récentes et alertes importantes. Tout chiffre est un agrégat réel.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const days = Number(query.days ?? "30");
  const period = Number.isInteger(days) && days >= 1 && days <= 90 ? days : 30;

  const { shop } = await getCurrentShop(user.id);
  const access = shop ? await getShopAccess(user.id, shop.id) : null;

  // Le tableau de bord lui-même est ouvert ; chaque rubrique reste soumise à
  // ses propres permissions, faute de quoi elle affiche un état explicite.
  if (shop && !access) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Tableau de bord</h1>
        <p className="text-sm text-danger">Aucune boutique accessible.</p>
      </div>
    );
  }

  const canSeeFinance = Boolean(access?.permissions.has("finance:read"));
  const canSeeReports = Boolean(access?.permissions.has("reports:read"));
  const canSeeInventory = Boolean(access?.permissions.has("inventory:read"));

  const overview = await dashboardOverview(user.id, period);

  if (overview.shops.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-night">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted">
            Aucune boutique accessible : les indicateurs s&apos;afficheront dès qu&apos;une boutique
            sera créée.
          </p>
        </div>
        <section id="vue-ensemble" className="card p-5">
          <h2 className="text-sm font-semibold text-night">Vue d&apos;ensemble</h2>
          <p className="mt-3 text-sm text-muted">
            Rien à montrer pour l&apos;instant — aucune donnée n&apos;est inventée.
          </p>
          <Link href="/boutiques" className="focusable mt-4 inline-block text-sm text-primary-600">
            Créer une boutique →
          </Link>
        </section>
      </div>
    );
  }

  const kpis = overview.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-night">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted">
            Période : {overview.period.from} → {overview.period.to} ({overview.period.days} j).
          </p>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <label htmlFor="periode" className="text-xs text-muted">
            Période
          </label>
          <select
            id="periode"
            name="days"
            defaultValue={String(overview.period.days)}
            className="focusable rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
          >
            <option value="7">7 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
          </select>
          <button
            type="submit"
            className="focusable rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Actualiser
          </button>
        </form>
      </div>

      {/* 1. Vue d'ensemble */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Vue d&apos;ensemble</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="CA commandes"
            value={formatMoney(kpis.revenueMinor, kpis.currency)}
            hint={`Commandes livrées ou expédiées sur ${overview.period.days} j (${kpis.orders} au total, dont ${kpis.canceledOrders} annulée(s)).`}
          />
          <Kpi
            label="Articles vendus"
            value={kpis.units.toLocaleString("fr-FR")}
            hint="Unités commandées sur la période."
          />
          <Kpi
            label="Déclinaisons en stock"
            value={kpis.variants.toLocaleString("fr-FR")}
            hint={`${kpis.lowStock} à 5 unités ou moins.`}
          />
          <Kpi
            label="Net à verser (Jumia)"
            value={formatMoney(overview.finances.netMinor, kpis.currency)}
            hint={
              overview.finances.statements === 0
                ? "Aucun relevé synchronisé."
                : `${overview.finances.statements} relevé(s), ${overview.finances.unpaid ? "au moins un non payé." : "tous payés."}`
            }
          />
        </div>
        <p className="mt-4 text-xs text-muted">
          Deux mesures distinctes, jamais mélangées : le <strong>CA commandes</strong> vient des
          commandes livrées ou expédiées sur la période choisie ; le <strong>CA articles</strong>{" "}
          (rubrique « Indicateurs financiers ») vient des relevés de versement publiés par Jumia et
          couvre sa propre période. Les montants proviennent des données enregistrées ; aucun
          n&apos;est estimé.
        </p>
      </section>

      {/* 2. Recherche dans mon espace */}
      <section id="recherche" className="card p-5">
        <h2 className="text-sm font-semibold text-night">Recherche dans mon espace</h2>
        <p className="mt-1 text-sm text-muted">
          Boutiques et produits autorisés uniquement — les droits d&apos;accès sont appliqués côté
          serveur.
        </p>
        <div className="mt-4 max-w-md">
          <DashboardSearch />
        </div>
      </section>

      {/* 3. Apparence */}
      <section id="apparence" className="card p-5">
        <h2 className="text-sm font-semibold text-night">Apparence</h2>
        <p className="mt-1 text-sm text-muted">
          Le réglage est propre à cet appareil, il ne change pas celui des autres utilisateurs.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <ThemeToggle />
          <span className="text-sm text-muted">Clair / sombre</span>
        </div>
      </section>

      {/* 4. Indicateurs financiers */}
      <section id="indicateurs-financiers" className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-night">Indicateurs financiers</h2>
          <Link href="/finances" className="focusable text-sm text-primary-600">
            Voir les finances →
          </Link>
        </div>
        {!canSeeFinance ? (
          <p className="mt-3 text-sm text-muted">
            Votre rôle n&apos;autorise pas la lecture des finances sur cette boutique.
          </p>
        ) : overview.finances.statements === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucun relevé Jumia synchronisé : pas de chiffre financier affiché. Lancez la
            synchronisation des paiements.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="CA articles"
              value={formatMoney(overview.finances.revenueMinor, kpis.currency)}
              hint={
                overview.finances.statementFrom && overview.finances.statementTo
                  ? `Montant des articles sur ${overview.finances.statements} relevé(s) du ${new Date(overview.finances.statementFrom).toLocaleDateString("fr-FR")} au ${new Date(overview.finances.statementTo).toLocaleDateString("fr-FR")}.`
                  : `sur ${overview.finances.statements} relevé(s).`
              }
            />
            <Kpi
              label="Commissions"
              value={formatMoney(Math.abs(overview.finances.feesMinor), kpis.currency)}
              hint="Frais totaux Jumia."
            />
            <Kpi
              label="Remboursements"
              value={formatMoney(overview.finances.refundsMinor, kpis.currency)}
              hint="Sur les relevés affichés."
            />
            <Kpi
              label="Net à verser"
              value={formatMoney(overview.finances.netMinor, kpis.currency)}
              hint={`dont ${formatMoney(overview.finances.paidMinor, kpis.currency)} déjà payé.`}
            />
          </div>
        )}
      </section>

      {/* 5. Performances globales */}
      <section id="performances" className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-night">Performances globales</h2>
          <Link href="/rapports" className="focusable text-sm text-primary-600">
            Voir les rapports →
          </Link>
        </div>
        {!canSeeReports ? (
          <p className="mt-3 text-sm text-muted">
            Votre rôle n&apos;autorise pas la lecture des rapports sur cette boutique.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Boutique</th>
                  <th className="py-2 pr-3 text-right">CA période</th>
                  <th className="py-2 pr-3 text-right">Commandes</th>
                  <th className="py-2 pr-3 text-right">Unités en stock</th>
                  <th className="py-2 text-right">Stocks faibles</th>
                </tr>
              </thead>
              <tbody>
                {overview.shops.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 text-night">{row.name}</td>
                    <td className="py-2.5 pr-3 text-right text-night">
                      {formatMoney(row.revenueMinor, kpis.currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">{row.orders}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {canSeeInventory ? row.stockUnits.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td
                      className={`py-2.5 text-right ${
                        row.lowStock > 0 ? "font-medium text-danger" : "text-muted"
                      }`}
                    >
                      {canSeeInventory ? row.lowStock : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. Activités récentes */}
      <section id="activites" className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-night">Activités récentes</h2>
          <Link href="/admin" className="focusable text-sm text-primary-600">
            Journal complet →
          </Link>
        </div>
        {overview.activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune action enregistrée sur vos boutiques.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {overview.activity.map((row, index) => (
              <li
                key={`${row.createdAt.getTime()}-${index}`}
                className="flex flex-wrap items-center gap-3"
              >
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
                <span className="text-xs text-muted">
                  {new Date(row.createdAt).toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 7. Alertes importantes */}
      <section id="alertes" className="card p-5">
        <h2 className="text-sm font-semibold text-night">Alertes importantes</h2>
        {overview.alerts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucune alerte prioritaire sur les données enregistrées.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {overview.alerts.map((alert, index) => (
              <li
                key={`${alert.kind}-${index}`}
                className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger"
              >
                <span className="font-medium">{alert.label}</span> — {alert.detail}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-night">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
