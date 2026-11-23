import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { countUnread, listUserNotifications } from "@/lib/notifications";

/** GET /api/notifications — historique + nombre non lus. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const [notifications, unread] = await Promise.all([
    listUserNotifications(user.id),
    countUnread(user.id),
  ]);

  return ok({ notifications, unread });
}
