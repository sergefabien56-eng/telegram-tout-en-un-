import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listUserShops } from "@/lib/shops";
import {
  describeOAuthError,
  JUMIA_TOKEN_URL,
  JumiaError,
  readCredentials,
  requestAccessToken,
} from "@/lib/jumia/client";

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
    return fail(503, "Aucun identifiant Jumia configuré (JUMIA_CLIENT_ID et JUMIA_REFRESH_TOKEN).");
  }

  try {
    const result = await requestAccessToken(credentials);
    // Preuve d'accès aux données : on lit la liste des boutiques avec le jeton
    // obtenu. Un échec ici ne fait pas échouer le test d'authentification.
    let shopsStatus: number | null = null;
    let shopCount: number | null = null;
    try {
      const shopsResponse = await fetch(`${JUMIA_TOKEN_URL}/shops`, {
        headers: { Authorization: `Bearer ${result.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      shopsStatus = shopsResponse.status;
      if (shopsResponse.ok) {
        const body = (await shopsResponse.json()) as { shops?: unknown[] } | undefined;
        if (Array.isArray(body?.shops)) shopCount = body.shops.length;
      }
    } catch {
      shopsStatus = null;
    }

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
        shopsStatus,
        shopCount,
      },
    });

    return ok({
      authenticated: true,
      source,
      expiresIn: result.expiresIn,
      refreshExpiresIn: result.refreshExpiresIn,
      /** Le nouveau refresh token a été ré-écrit en base, chiffré. */
      rotated: true,
      /** 200 attendu ; null si l'appel de lecture n'a pas abouti. */
      shopsStatus,
      shopCount,
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
