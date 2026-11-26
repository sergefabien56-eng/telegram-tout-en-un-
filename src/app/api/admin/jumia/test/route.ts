import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listUserShops } from "@/lib/shops";
import { resolveDefaultAccount } from "@/lib/jumia/accounts";
import {
  describeOAuthError,
  exchangeAccessToken,
  jumiaApiBase,
  JumiaError,
  readAccountCredentials,
  readCredentials,
  writeAccountRefreshToken,
  writeCredentials,
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

  // Priorité au compte enregistré dans l'application ; l'identifiant historique
  // ne sert que de repli (et n'est plus utilisé dès qu'un compte existe).
  const accountId = await resolveDefaultAccount(user.id);
  let credentials;
  let source;
  if (accountId) {
    const row = await readAccountCredentials(accountId);
    if (!row) {
      return fail(503, "Ce compte Jumia est illisible (ENCRYPTION_KEY différente ?).");
    }
    credentials = { clientId: row.clientId, refreshToken: row.refreshToken };
    source = "compte";
  } else {
    const legacy = await readCredentials();
    credentials = legacy.credentials;
    source = legacy.source;
  }
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
      "Aucun compte Jumia configuré. Ajoutez un compte vendeur dans Boutiques → Comptes Jumia.",
    );
  }

  try {
    const result = await exchangeAccessToken(credentials);
    if (accountId) {
      await writeAccountRefreshToken(accountId, result.nextRefreshToken);
    } else {
      await writeCredentials({
        clientId: credentials.clientId,
        refreshToken: result.nextRefreshToken,
      });
    }
    // Preuve d'accès aux données : on lit la liste des boutiques avec le jeton
    // obtenu. Un échec ici ne fait pas échouer le test d'authentification.
    let shopsStatus: number | null = null;
    let shopCount: number | null = null;
    let shopSample: string[] = [];
    try {
      const shopsResponse = await fetch(`${jumiaApiBase()}/shops`, {
        headers: { Authorization: `Bearer ${result.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      shopsStatus = shopsResponse.status;
      if (shopsResponse.ok) {
        // La doc GPM : GET /shops renvoie un tableau de boutiques.
        const body = (await shopsResponse.json()) as unknown;
        const list: unknown[] = Array.isArray(body)
          ? body
          : Array.isArray((body as { shops?: unknown[] })?.shops)
            ? ((body as { shops: unknown[] }).shops ?? [])
            : [];
        shopCount = list.length;
        shopSample = list.slice(0, 5).flatMap((entry) => {
          const shop = entry as { name?: unknown; businessClients?: { countryCode?: unknown }[] };
          if (typeof shop.name !== "string") return [];
          const countries = (shop.businessClients ?? [])
            .map((client) => (typeof client.countryCode === "string" ? client.countryCode : null))
            .filter((code): code is string => Boolean(code));
          return [`${shop.name}${countries.length ? ` (${countries.join(",")})` : ""}`];
        });
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
      shops: shopSample,
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
