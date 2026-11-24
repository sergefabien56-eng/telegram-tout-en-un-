import { getDb, schema } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";

/** Canaux et types de notification réellement gérés. */
export const NOTIFICATION_CHANNELS = ["web", "telegram"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = ["order", "stock", "finance", "shop", "system"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPref = {
  channel: NotificationChannel;
  type: NotificationType;
  enabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
};

/** Dernières notifications de l'utilisateur (tous canaux). */
export async function listUserNotifications(userId: string, limit = 20) {
  const db = getDb();
  return db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      title: schema.notifications.title,
      body: schema.notifications.body,
      status: schema.notifications.status,
      createdAt: schema.notifications.createdAt,
      shopId: schema.notifications.shopId,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

/** Préférences effectives : toutes les combinaisons existent, activées par défaut. */
export async function listUserPrefs(userId: string): Promise<NotificationPref[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.userNotificationPrefs)
    .where(eq(schema.userNotificationPrefs.userId, userId));

  const stored = new Map(rows.map((row) => [`${row.channel}:${row.type}`, row]));

  return NOTIFICATION_CHANNELS.flatMap((channel) =>
    NOTIFICATION_TYPES.map((type) => {
      const row = stored.get(`${channel}:${type}`);
      return {
        channel,
        type,
        enabled: row?.enabled ?? true,
        quietStart: row?.quietStart ?? null,
        quietEnd: row?.quietEnd ?? null,
      };
    }),
  );
}

/** Active/désactive un type de notification sur un canal. */
export async function setPref(
  userId: string,
  channel: NotificationChannel,
  type: NotificationType,
  enabled: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.userNotificationPrefs)
    .values({ userId, channel, type, enabled })
    .onConflictDoUpdate({
      target: [
        schema.userNotificationPrefs.userId,
        schema.userNotificationPrefs.channel,
        schema.userNotificationPrefs.type,
      ],
      set: { enabled, updatedAt: new Date() },
    });
}

/** Nombre de notifications jamais affichées (statut « pending »). */
export async function countUnread(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.userId, userId), eq(schema.notifications.status, "pending")),
    );
  return rows[0]?.count ?? 0;
}
