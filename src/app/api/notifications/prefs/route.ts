import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listUserPrefs, setPref, type NotificationChannel, type NotificationType } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { z } from "zod";

const prefSchema = z.object({
  channel: z.enum(["web", "telegram"]),
  type: z.enum(["order", "stock", "finance", "shop", "system"]),
  enabled: z.boolean(),
});

/** GET /api/notifications/prefs — préférences effectives. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  return ok({ prefs: await listUserPrefs(user.id) });
}

/** PUT /api/notifications/prefs — modifie un réglage. */
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = prefSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Réglage invalide.");

  await setPref(
    user.id,
    parsed.data.channel as NotificationChannel,
    parsed.data.type as NotificationType,
    parsed.data.enabled,
  );

  await audit({
    action: "notifications.pref_changed",
    result: "success",
    userId: user.id,
    entityType: "notification_pref",
    entityId: `${parsed.data.channel}:${parsed.data.type}`,
    metadata: { enabled: parsed.data.enabled },
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
  });

  return ok({ prefs: await listUserPrefs(user.id) });
}
