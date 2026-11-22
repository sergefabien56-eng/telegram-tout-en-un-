import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser, revokeSession } from "@/lib/session";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/cookies";

export async function POST(request: Request) {
  const user = await getSessionUser();
  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);

  if (!user) return fail(401, "Non authentifié.");

  await revokeSession(user.sessionId);
  const store = await cookies();
  store.delete(SESSION_COOKIE);

  await audit({ action: "auth.logout", result: "success", userId: user.id, ip, userAgent });
  return ok({ message: "Déconnecté." });
}
