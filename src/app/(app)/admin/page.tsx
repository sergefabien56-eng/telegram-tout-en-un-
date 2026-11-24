import { getCurrentShop } from "@/lib/current-shop";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { adminOverview, hasAdminAccess } from "@/lib/admin";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Administration — vue réelle : boutiques, rôles, file de tâches,
 * consommation IA et journal d'audit. Aucun compteur simulé.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { shop } = await getCurrentShop(user.id);
  const access = shop ? await getShopAccess(user.id, shop.id) : null;

  if (shop && !access?.permissions.has("admin:read")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Administration</h1>
        <p className="text-sm text-danger">
          Votre rôle sur cette boutique ne permet pas d&apos;accéder à l&apos;administration.
        </p>
      </div>
    );
  }

  if (!(await hasAdminAccess(user.id))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Administration</h1>
        <p className="text-sm text-muted">
          Seuls les propriétaires et gestionnaires disposent de cette vue.
        </p>
      </div>
    );
  }

  const overview = await adminOverview(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Administration</h1>
        <p className="mt-1 text-sm text-muted">
          Données réelles de vos boutiques : {overview.shops.total} boutique(s),{" "}
          {overview.members.reduce((total, row) => total + row.count, 0)} membre(s).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Boutiques</p>
          <p className="mt-3 text-2xl font-semibold text-night">{overview.shops.total}</p>
          <p className="mt-1 text-xs text-muted">
            dont {overview.shops.connected} rattachée(s) à Jumia.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Tâches en attente
          </p>
          <p className="mt-3 text-2xl font-semibold text-night">{overview.jobs.pending}</p>
          <p className="mt-1 text-xs text-muted">
            {overview.jobs.running} en cours · {overview.jobs.failed} en échec.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Appels MIMI</p>
          <p className="mt-3 text-2xl font-semibold text-night">{overview.ai.calls}</p>
          <p className="mt-1 text-xs text-muted">
            {overview.ai.promptTokens.toLocaleString("fr-FR")} jetons d&apos;invite ·{" "}
            {overview.ai.completionTokens.toLocaleString("fr-FR")} en réponse.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Fournisseur IA</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {overview.ai.providers.length === 0
              ? "—"
              : overview.ai.providers.map((row) => row.provider).join(", ")}
          </p>
          <p className="mt-1 text-xs text-muted">Configuré sur le serveur.</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Boutiques et connecteurs</h2>
        {overview.shops.rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune boutique accessible.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Boutique</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Connecteur Jumia</th>
                </tr>
              </thead>
              <tbody>
                {overview.shops.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 text-night">{row.name}</td>
                    <td className="py-2.5 pr-3">
                      <span className="badge badge-neutral">{row.status ?? "—"}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {row.remoteShopName ?? "Non rattachée"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="membres" className="card p-5">
        <h2 className="text-sm font-semibold text-night">Membres par rôle</h2>
        {overview.members.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucun membre enregistré.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {overview.members.map((row) => (
              <li key={row.role} className="badge badge-neutral">
                {row.role} : {row.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Dernières tâches</h2>
        {overview.jobs.last.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucune synchronisation lancée pour l&apos;instant.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {overview.jobs.last.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-mono text-xs text-night">{job.type}</span>
                <span
                  className={`badge ${job.status === "failed" ? "badge-neutral" : "badge-neutral"}`}
                >
                  {job.status}
                </span>
                <span className="text-xs text-muted">
                  {new Date(job.createdAt).toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="journal" className="card p-5">
        <h2 className="text-sm font-semibold text-night">Journal d&apos;audit récent</h2>
        {overview.audit.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune action enregistrée.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {overview.audit.map((row, index) => (
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
    </div>
  );
}
