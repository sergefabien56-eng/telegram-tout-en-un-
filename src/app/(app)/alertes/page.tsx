import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CheckCircle2, RefreshCw, Wallet } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getDb, schema } from "@/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { listUserShops } from "@/lib/shops";
import { memberScope } from "@/lib/shop-scope";
import { isRefusedScope, readSearchValues, resolveShopIds } from "@/lib/order-access";
import { reportCatalog } from "@/lib/reports";
import { listPayoutStatements, sumStatements } from "@/lib/payments";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { ScopeBar } from "@/components/ui/scope-bar";
import { ShopScopeSelect } from "@/components/shop-scope-select";

export const dynamic = "force-dynamic";

type AlertLevel = "critique" | "avertissement" | "information";

type UnifiedAlert = {
  id: string;
  level: AlertLevel;
  source: "coherence" | "stock" | "paiement" | "tache";
  title: string;
  detail: string;
  shopId: string | null;
  shopName: string;
  createdAt: Date | null;
  href: string | null;
};

const LEVEL_STYLE: Record<AlertLevel, string> = {
  critique: "border-danger/40 bg-danger/5 text-danger",
  avertissement: "border-warning/40 bg-warning/5 text-warning",
  information: "border-border bg-surface text-muted",
};

/**
 * ALERTES — un seul endroit pour tout ce qui demande une action.
 *
 * Avant, les alertes vivaient dans trois endroits différents (cloche, carte
 * « Alertes importantes » du tableau de bord, diagnostic). Elles sont ici
 * réunies, **triées par gravité**, et on sait pour chaque alerte :
 * - ce qu'elle dit ;
 * - de quelle boutique elle vient ;
 * - ce qu'il faut faire.
 */
export default async function AlertesPage({
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
        <PageHeader title="Alertes" />
        <EmptyState
          title="Aucune boutique accessible"
          description="Les alertes sont calculées à partir de vos boutiques."
        />
      </div>
    );
  }

  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alertes" />
        <EmptyState
          tone="danger"
          title="Cette boutique n’est pas dans votre périmètre"
          description="Aucune alerte n’est affichée pour une boutique à laquelle vous n’avez pas accès."
        />
      </div>
    );
  }

  const db = getDb();
  const shops = await listUserShops(user.id);
  const shopNames = new Map(shops.map((shop) => [shop.id, shop.name]));
  const alerts: UnifiedAlert[] = [];

  // 1. Alertes de cohérence (envoyées au vendeur par le contrôle planifié).
  const coherenceRows = await db
    .select({
      id: schema.notifications.id,
      title: schema.notifications.title,
      body: schema.notifications.body,
      shopId: schema.notifications.shopId,
      createdAt: schema.notifications.createdAt,
      channel: schema.notifications.channel,
    })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.type, "shop"), inArray(schema.notifications.shopId, shopIds)),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(30);
  for (const row of coherenceRows) {
    alerts.push({
      id: `coherence-${row.id}`,
      level: row.title.includes("Évolution") ? "avertissement" : "critique",
      source: "coherence",
      title: row.title,
      detail: row.body,
      shopId: row.shopId,
      shopName: row.shopId ? (shopNames.get(row.shopId) ?? "Boutique") : "Boutique",
      createdAt: row.createdAt,
      href: "/admin/diagnostics",
    });
  }

  // 2. Stocks faibles.
  for (const shopId of shopIds) {
    const catalog = await reportCatalog(shopId);
    if (catalog.lowStock > 0) {
      alerts.push({
        id: `stock-${shopId}`,
        level: "avertissement",
        source: "stock",
        title: "Stocks faibles",
        detail: `${catalog.lowStock} déclinaison(s) à 5 unités ou moins.`,
        shopId,
        shopName: shopNames.get(shopId) ?? "Boutique",
        createdAt: null,
        href: "/stocks",
      });
    }
  }

  // 3. Versements en attente.
  for (const shopId of shopIds) {
    const statements = await listPayoutStatements(shopId, 50);
    const totals = sumStatements(statements);
    if (totals.unpaid) {
      alerts.push({
        id: `paiement-${shopId}`,
        level: "avertissement",
        source: "paiement",
        title: "Relevé à verser",
        detail: `${Math.max(totals.net, 0).toLocaleString("fr-FR")} FCFA de net cumulé sur ${statements.length} relevé(s), au moins un non payé.`,
        shopId,
        shopName: shopNames.get(shopId) ?? "Boutique",
        createdAt: null,
        href: "/finances",
      });
    }
  }

  // 4. Synchronisations en échec.
  const failedJobs = await db
    .select({
      id: schema.jobs.id,
      shopId: schema.jobs.shopId,
      type: schema.jobs.type,
      createdAt: schema.jobs.createdAt,
      lastError: schema.jobs.lastError,
    })
    .from(schema.jobs)
    .where(and(inArray(schema.jobs.shopId, shopIds), eq(schema.jobs.status, "failed")))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(20);
  for (const job of failedJobs) {
    alerts.push({
      id: `job-${job.id}`,
      level: "critique",
      source: "tache",
      title: `Synchronisation en échec (${job.type})`,
      detail: job.lastError ?? "La tâche n'a pas abouti : relancez la synchronisation.",
      shopId: job.shopId,
      shopName: job.shopId ? (shopNames.get(job.shopId) ?? "Boutique") : "Boutique",
      createdAt: job.createdAt,
      href: "/boutiques/synchronisations",
    });
  }

  const order: Record<AlertLevel, number> = { critique: 0, avertissement: 1, information: 2 };
  alerts.sort((a, b) => {
    const byLevel = order[a.level] - order[b.level];
    if (byLevel !== 0) return byLevel;
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    return tb - ta;
  });

  const aggregate = shopIds.length > 1;
  const critical = alerts.filter((alert) => alert.level === "critique").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertes"
        description="Tout ce qui demande une action, classé par gravité."
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
              : (shopNames.get(shopIds[0] ?? "") ?? "Boutique")
          }
          detail={
            critical > 0
              ? `${critical} alerte(s) critique(s)`
              : alerts.length > 0
                ? "aucune alerte critique"
                : "rien à traiter"
          }
        />
      </PageHeader>

      {alerts.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />}
          title="Aucune alerte"
          description="Cohérence, stocks, versements et synchronisations : rien ne demande d'action sur ce périmètre. Les alertes de cohérence sont produites par le contrôle quotidien — elles apparaîtront ici dès qu'une dérive sera détectée."
        />
      ) : (
        <Section
          title={`${alerts.length} alerte(s)`}
          description="Une alerte = une action à mener. Les alertes de cohérence renvoient au diagnostic, qui en donne la preuve chiffrée."
        >
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`rounded-xl border px-4 py-3 ${LEVEL_STYLE[alert.level]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-night">{alert.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{alert.detail}</p>
                  </div>
                  <span className="badge badge-neutral shrink-0">{alert.shopName}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="uppercase tracking-wide text-muted">{alert.source}</span>
                  {alert.createdAt ? (
                    <span className="text-muted">
                      {new Date(alert.createdAt).toLocaleString("fr-FR")}
                    </span>
                  ) : null}
                  {alert.href ? (
                    <Link
                      href={alert.href}
                      className="focusable ml-auto font-medium text-primary-600 hover:underline"
                    >
                      Traiter →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <AlertKindCard
          icon={<Bell className="h-4 w-4" aria-hidden="true" />}
          title="Alertes de cohérence"
          detail="Envoyées automatiquement quand une anomalie critique ou une dérive apparaît."
          href="/admin/diagnostics"
        />
        <AlertKindCard
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          title="Relevés et versements"
          detail="Ce que Jumia doit encore verser, d’après les relevés publiés."
          href="/finances"
        />
        <AlertKindCard
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          title="Synchronisations"
          detail="Les tâches en échec : la donnée peut être incomplète tant qu'elles ne sont pas relancées."
          href="/boutiques/synchronisations"
        />
      </div>
    </div>
  );
}

function AlertKindCard({
  icon,
  title,
  detail,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link href={href} className="focusable card block p-4 hover:border-primary/40">
      <p className="flex items-center gap-2 text-sm font-semibold text-night">
        <span className="text-primary-ink">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
    </Link>
  );
}
