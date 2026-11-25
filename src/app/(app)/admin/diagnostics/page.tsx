import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import { DiagnosticActions } from "@/components/diagnostic-actions";
import { diagnosticReport } from "@/lib/diagnostics";
import { getSessionUser } from "@/lib/session";
import { hasAdminAccess } from "@/lib/admin";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Diagnostic multiboutique : l'état **réel** de chaque boutique, la preuve de
 * cohérence entre Jumia et l'application, et les anomalies classées avec leur
 * origine et la consequence pour le vendeur.
 */
export default async function DiagnosticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!(await hasAdminAccess(user.id))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Diagnostic des boutiques</h1>
        <p className="text-sm text-muted">
          Seuls les propriétaires et gestionnaires disposent de cette vue.
        </p>
      </div>
    );
  }

  // Contrôle profond : on interroge réellement Jumia (preuve de cohérence et
  // test du compte vendeur). C'est plus lent, mais c'est la preuve.
  const report = await diagnosticReport({ userId: user.id, deep: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Diagnostic des boutiques</h1>
        <p className="mt-1 text-sm text-muted">
          Contrôle réel effectué le {new Date(report.generatedAt).toLocaleString("fr-FR")} : chaque
          boutique est comparée à son Seller Center (Jumia). Rien n&apos;est simulé.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Boutiques</p>
          <p className="mt-3 text-2xl font-semibold text-night">{report.summary.shops}</p>
          <p className="mt-1 text-xs text-muted">
            {report.summary.operationnelles} opérationnelle(s) · {report.summary.partielles}{" "}
            partielle(s) · {report.summary.horsService} hors service
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Anomalies</p>
          <p className="mt-3 text-2xl font-semibold text-night">{report.summary.anomalies}</p>
          <p className="mt-1 text-xs text-muted">
            {report.summary.critiques} critique(s) · {report.summary.avertissements} avertissement(s)
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Opérationnelles</p>
          <p className="mt-3 text-2xl font-semibold text-success">
            {report.summary.operationnelles}
          </p>
          <p className="mt-1 text-xs text-muted">
            Données reçues, synchronisées et cohérentes avec le Seller Center.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Écarts de données</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {report.shops.filter((row) => row.coherence?.status === "ecart").length}
          </p>
          <p className="mt-1 text-xs text-muted">Boutiques dont les données diffèrent de Jumia.</p>
        </div>
      </section>

      {report.shops.length === 0 ? (
        <section className="card p-5">
          <p className="text-sm text-muted">
            Aucune boutique accessible : rien à diagnostiquer. Créez une boutique depuis{" "}
            <Link href="/boutiques" className="focusable text-primary-600 hover:underline">
              Boutiques
            </Link>
            .
          </p>
        </section>
      ) : (
        report.shops.map((shop) => (
          <section key={shop.shopId} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-night">
                  {shop.verdict === "operationnelle" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : shop.verdict === "partielle" ? (
                    <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />
                  )}
                  {shop.name}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {shop.remoteShopName ?? "Non rattachée"} ·{" "}
                  {shop.remoteShopId ? `ID ${shop.remoteShopId}` : "aucun identifiant distant"} ·
                  compte vendeur {shop.accountId ? "lié" : "non lié"}
                  {shop.accountTest ? ` · test du compte : ${shop.accountTest.ok ? "valide" : "refusé"}` : ""}
                </p>
              </div>
              <DiagnosticActions shopId={shop.shopId} shopName={shop.name} />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                État de la connexion
              </p>
              <p className="mt-1 text-sm text-night">{shop.connection.label}</p>
              <p className="mt-1 text-xs text-muted">{shop.connection.detail}</p>
            </div>

            {shop.coherence ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3">Donnée</th>
                      <th className="py-2 pr-3 text-right">Dans Tout en Un</th>
                      <th className="py-2 pr-3 text-right">Chez Jumia</th>
                      <th className="py-2 text-right">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="py-2.5 pr-3 text-night">Produits</td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {shop.coherence.local.products}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {shop.coherence.remote?.products ?? "—"}
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {shop.coherence.deltas.products ?? "—"}
                      </td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2.5 pr-3 text-night">
                        Commandes ({shop.coherence.window.days} j)
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {shop.coherence.local.ordersInWindow}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {shop.coherence.remote?.orders ?? "—"}
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {shop.coherence.deltas.orders ?? "—"}
                      </td>
                    </tr>
                    <tr className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 text-night">Relevés de versement</td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {shop.coherence.local.statements}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted">
                        {shop.coherence.remote?.statements ?? "—"}
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {shop.coherence.deltas.statements ?? "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}

            {shop.anomalies.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Anomalies détectées
                </p>
                {shop.anomalies.map((anomaly, index) => (
                  <div
                    key={`${anomaly.code}-${index}`}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-night">
                      {anomaly.severity === "critique" ? (
                        <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />
                      ) : anomaly.severity === "avertissement" ? (
                        <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
                      ) : (
                        <Info className="h-4 w-4 text-muted" aria-hidden="true" />
                      )}
                      {anomaly.title}
                      <span className="text-xs font-normal text-muted">({anomaly.code})</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">Preuve : {anomaly.evidence}</p>
                    <p className="mt-1 text-xs text-muted">Origine : {anomaly.cause}</p>
                    <p className="mt-1 text-xs text-muted">
                      Conséquence / action : {anomaly.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Aucune anomalie : les données de cette boutique correspondent à son Seller Center.
              </p>
            )}

            {shop.coherence && shop.coherence.notes.length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-xs text-muted">
                {shop.coherence.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}
