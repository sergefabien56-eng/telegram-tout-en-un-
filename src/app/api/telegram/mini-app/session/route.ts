import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { verifyInitData } from "@/lib/telegram";
import { findLinkedUser } from "@/lib/telegram-service";
import { createSession, sessionCookieOptions } from "@/lib/session";
import { audit } from "@/lib/audit";
import { UI_COOKIE } from "@/lib/cookies";
import { cookies } from "next/headers";

/**
 * Échange le `initData` Telegram contre une session locale.
 * `initData` n'est jamais refait : après vérification, un cookie de session est posé.
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return fail(500, "TELEGRAM_BOT_TOKEN n'est pas configuré.");

  let body: { initData?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  if (typeof body.initData !== "string" || body.initData.length === 0) {
    return fail(422, "initData manquant.");
  }

  const verified = verifyInitData(body.initData, botToken);
  if (!verified.ok) {
    await audit({
      action: "auth.login_failed",
      result: "failure",
      entityType: "telegram",
      metadata: { reason: verified.reason },
    });
    return fail(401, "initData invalide ou expiré.");
  }

  const linked = await findLinkedUser(verified.user.id);
  if (!linked) {
    return fail(403, "Compte non lié.", [
      "Générez un code sur le site (section Telegram), puis tapez /lier CODE dans le bot.",
    ]);
  }

  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);
  const { token } = await createSession(linked.userId, ip, userAgent);
  const store = await cookies();
  store.set(sessionCookieOptions.name, token, sessionCookieOptions);
  // Mémorise l'interface Mini App : la coquille basse est servie ensuite.
  store.set(UI_COOKIE, "mini", { httpOnly: false, sameSite: "lax", path: "/" });

  await audit({
    action: "auth.login",
    result: "success",
    userId: linked.userId,
    entityType: "telegram",
    entityId: String(verified.user.id),
    ip,
    userAgent,
  });

  return ok({ telegramId: verified.user.id, email: linked.email, fullName: linked.fullName });
}
