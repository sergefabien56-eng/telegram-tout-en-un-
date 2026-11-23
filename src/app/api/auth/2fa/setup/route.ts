import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { startTwoFactorSetup } from "@/lib/two-factor";

/** POST /api/auth/2fa/setup — démarre le paramétrage (secret + QR). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  try {
    const setup = await startTwoFactorSetup(user.id);
    await audit({
      action: "auth.two_factor_setup_started",
      result: "success",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok(setup);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return fail(400, message);
  }
}
