import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/session";
import { memberScope } from "@/lib/shop-scope";
import { isRefusedScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { ScopeBar } from "@/components/ui/scope-bar";
import { ShopScopeSelect } from "@/components/shop-scope-select";

export const dynamic = "force-dynamic";

/**
 * ACTIVITÉS — l'historique des opérations.
 *
 * Chaque action Leaves a trace : synchronisation, réparation, changement de
 * rôle, export. Cette page la rend consultable et filtrable, au lieu d'être
 * dispersée entre le tableau de bord et l'administration.
 */
export default async function ActivitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const values = readSearchValues(await searchParams);
  const scope = await memberScope(user.id);
  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);

  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activités" />
        <EmptyState
          title="Aucune boutique accessible"
          description="Le journal est alimenté par les actions sur vos boutiques."
        />
      </div>
    );
  }

  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activités" />
        <EmptyState
          tone="danger"
          title="Cette boutique n’est pas dans votre périmètre"
          description="Aucune activité n’est affichée pour une boutique à laquelle vous n’avez pas accès."
        />
      </div>
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      result: schema.auditLogs.result,
      entityType: schema.auditLogs.entityType,
      entityId: schema.auditLogs.entityId,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .where(
      or(inArray(schema.auditLogs.shopId, shopIds), inArray(schema.auditLogs.userId, [user.id])),
    )
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(100);

  const aggregate = shopIds.length > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activités"
        description="Les 100 dernières actions enregistrées sur cet espace."
        actions={
          <ShopScopeSelect
            shops={scope.allowed.map((shop) => ({ id: shop.id, name: shop.name }))}
            value={aggregate ? "toutes" : (shopIds[0] ?? "")}
          />
        }
      >
        <ScopeBar
          label={
            aggregate
              ? `${shopIds.length} boutiques`
              : (scope.allowed.find((s) => s.id === shopIds[0])?.name ?? "Boutique")
          }
          detail={`${rows.length} entrée(s) affichée(s)`}
        />
      </PageHeader>

      <Section
        title="Journal"
        description="Source : les journaux d’audit écrits par l’application. Rien n’est ajouté, rien n’est interprété."
        action={
          <Link
            href="/admin#journal"
            className="focusable font-medium text-primary-600 hover:underline"
          >
            Administration →
          </Link>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Aucune activité enregistrée"
            description="Le journal se remplit dès qu’une synchronisation, une réparation ou un changement de rôle intervient."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Résultat</th>
                  <th className="py-2 pr-3">Objet</th>
                  <th className="py-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-night">{row.action}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`badge ${
                          row.result === "success"
                            ? "badge-success"
                            : row.result === "blocked"
                              ? "badge-neutral"
                              : "badge-warning"
                        }`}
                      >
                        {row.result}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted">
                      {row.entityType ?? "—"}
                      {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td className="py-2.5 text-right text-xs text-muted">
                      {new Date(row.createdAt).toLocaleString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
