import { NotificationPrefs, type PrefRow } from "@/components/notification-prefs";
import { listUserNotifications, listUserPrefs } from "@/lib/notifications";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [prefs, notifications] = await Promise.all([
    listUserPrefs(user.id),
    listUserNotifications(user.id),
  ]);

  const rows: PrefRow[] = prefs.map((pref) => ({
    channel: pref.channel as PrefRow["channel"],
    type: pref.type as PrefRow["type"],
    enabled: pref.enabled,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Notifications</h1>
        <p className="mt-1 text-sm text-muted">
          Historique et préférences. Seules les notifications réellement émises apparaissent.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Historique</h2>
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune notification pour le moment.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {notifications.map((row) => (
              <li key={row.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-night">{row.title}</p>
                  <span className="badge badge-neutral">{row.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{row.body}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {new Date(row.createdAt).toLocaleString("fr-FR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotificationPrefs initial={rows} />
    </div>
  );
}
