import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listUserShops } from "@/lib/shops";
import { describeOAuthError, JumiaError, readCredentials, requestAccessToken } from "@/lib/jumia/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/jumia/test — vérifie les identifiants Vendor Center.
 *
 * Réservé aux propriétaires, tracé au journal d'audit. N'affiche jamais le
 * refresh token : seuls la source, l'expiration et le code d'erreur ressortent.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const shops = await listUserShops(user.id);
  if (!shops.some((shop) => shop.role === "owner")) {
    return fail(403, "Seul un propriétaire peut tester la connexion Jumia.");
  }

  const { credentials, source } = await readCredentials();
  if (!credentials) {
    await audit({
      action: "admin.jumia_test",
      result: "blocked",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: "not_configured" },
    });
    return fail(
      503,
      "Aucun identifiant Jumia configuré (JUMIA_CLIENT_ID et JUMIA_REFRESH_TOKEN).",
    );
  }

  try {
    const result = await requestAccessToken(credentials);
    await audit({
      action: "admin.jumia_test",
      result: "success",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        source,
        expiresIn: result.expiresIn,
        refreshExpiresIn: result.refreshExpiresIn,
        rotated: true,
      },
    });
    return ok({
      ok: true,
      data: {
        authenticated: true,
        source,
        expiresIn: result.expiresIn,
        refreshExpiresIn: result.refreshExpiresIn,
        /** Le nouveau refresh token a été ré-écrit en base, chiffré. */
        rotated: true,
      },
    });
  } catch (error) {
    const message =
      error instanceof JumiaError ? error.message : describeOAuthError(null, "Échec inattendu.");
    await audit({
      action: "admin.jumia_test",
      result: "failure",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { source, error: error instanceof JumiaError ? error.code : "unknown" },
    });
    return fail(502, `Connexion Jumia impossible : ${message}`);
  }
}
