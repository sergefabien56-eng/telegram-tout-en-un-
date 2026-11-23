import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getTwoFactorStatus } from "@/lib/two-factor";

/** GET /api/auth/2fa/status — la 2FA est-elle activée ? */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  return ok(await getTwoFactorStatus(user.id));
}
