import { getDb } from "@/db";
import { listUserNotifications } from "@/lib/notifications";
import { listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { sql } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Database, Download } from "lucide-react";
import { redirect } from "next/navigation";

type CountRow = { name: string; n: number };
type AuditRow = { action: string; result: string; createdAt: string; entityType: string };
type SyncRow = {
  name: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

async function collect(userId: string) {
  const db = getDb();

  const tables = (await db.execute(
    sql`select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'`,
  )) as unknown as { rows: { n: number }[] };

  const counts = (await db.execute(
    sql`select relname as name, n_live_tup as n
         from pg_stat_user_tables
         where schemaname = 'public'
         order by n_live_tup desc, relname
         limit 8`,
  )) as unknown as { rows: CountRow[] };

  const audits = (await db.execute(
    sql`select action, result, created_at as "createdAt", entity_type as "entityType"
         from audit_logs order by created_at desc limit 5`,
  )) as unknown as { rows: AuditRow[] };

  const syncs = (await db.execute(
    sql`select name, status, last_sync_at as "lastSyncAt", last_sync_status as "lastSyncStatus"
         from shops order by created_at desc limit 5`,
  )) as unknown as { rows: SyncRow[] };

  const shops = await listUserShops(userId);
  const notifications = await listUserNotifications(userId, 5);

  return {
    tableCount: tables.rows[0]?.n ?? 0,
    counts: counts.rows,
    audits: audits.rows,
    syncs: syncs.rows,
    shops,
    notifications,
  };
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-night">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function SantePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let data: Awaited<ReturnType<typeof collect>> | null = null;
  let error: string | null = null;
  try {
    data = await collect(user.id);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Erreur inconnue";
  }

  const isOwner = data?.shops.some((shop) => shop.role === "owner") ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Santé</h1>
        <p className="mt-1 text-sm text-muted">
          État réel de la base et de l&apos;application. Aucune donnée simulée.
        </p>
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Base inaccessible : {error}
        </p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card label="Base de données" value="Connectée" hint={`${data.tableCount} tables`} />
            <Card label="Boutiques" value={String(data.shops.length)} hint="Comptes réels" />
            <Card
              label="Notifications"
              value={String(data.notifications.length)}
              hint="Dernières 5"
            />
          </div>

          {isOwner ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
                <Download className="h-4 w-4" aria-hidden="true" />
                Sauvegarde de la base
              </h2>
              <p className="mt-2 text-sm text-muted">
                Export complet de la base au format SQL compressé, sans outil externe. Le fichier
                contient les données réelles et ne doit pas être partagé.
              </p>
              <a
                href="/api/admin/backup"
                download
                className="focusable mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Télécharger le dump (.sql.gz)
              </a>
              <p className="mt-2 text-xs text-muted">
                Réservé aux propriétaires · l&apos;export est inscrit au journal d&apos;audit.
              </p>
            </section>
          ) : null}

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
              <Database className="h-4 w-4" aria-hidden="true" />
              Volumétrie (estimée)
            </h2>
            {data.counts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Aucune table.</p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.counts.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-muted">{row.name}</span>
                    <span className="font-medium text-night">{row.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              Dernières synchronisations
            </h2>
            {data.syncs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Aucune boutique enregistrée.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.syncs.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-night">{row.name}</span>
                    <span className="text-xs text-muted">
                      {row.lastSyncAt
                        ? `Dernière sync : ${new Date(row.lastSyncAt).toLocaleString("fr-FR")}`
                        : "Jamais synchronisée"}
                      {" · "}
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              La synchronisation Jumia est prévue en Phase 2 — tant qu&apos;elle n&apos;est pas
              branchée, « jamais synchronisée » est la vérité, pas un bug.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-night">
              Journal d&apos;audit (5 dernières actions)
            </h2>
            {data.audits.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Aucune action enregistrée.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.audits.map((row, index) => (
                  <li
                    key={`${row.action}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-night">{row.action}</span>
                    <span className="text-xs text-muted">
                      {row.result} · {new Date(row.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
