import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptText, encryptText } from "@/lib/crypto";

/**
 * Client Jumia Vendor Center (GPM/GOP) — Self Authorization.
 *
 * Règles tirées de la documentation officielle :
 * - `POST /token` avec `grant_type=refresh_token` + `client_id` + `refresh_token` ;
 *   il n'existe PAS de `client_secret` pour ce type d'application ;
 * - chaque appel renvoie un NOUVEAU `refresh_token` qui doit remplacer l'ancien ;
 * - les durées sont à lire dans `expires_in` / `refresh_expires_in`, jamais codées en dur ;
 * - erreurs OAuth : `{ error, error_description }`.
 */

/**
 * Base de l'API Jumia Vendor Center.
 *
 * Lue **à l'appel** et non figée à l'import : la variable d'environnement
 * peut alors être redirigée (serveur de test local) sans redémarrer le
 * processus.
 */
export function jumiaApiBase(): string {
  return process.env.JUMIA_API_BASE?.replace(/\/$/, "") ?? "https://vendor-api.jumia.com";
}

const CREDENTIALS_KEY = "jumia_credentials";
const EXPIRY_SKEW_SECONDS = 60;

export type JumiaCredentials = {
  clientId: string;
  refreshToken: string;
};

export type JumiaTokenResult = {
  accessToken: string;
  /** Durée lue dans `expires_in` (secondes). */
  expiresIn: number;
  /** Nouveau refresh token à ré-écrire immédiatement. */
  nextRefreshToken: string;
  refreshExpiresIn: number | null;
};

export class JumiaError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.name = "JumiaError";
    this.code = code;
    this.status = status;
  }
}

/** Traduit les erreurs OAuth Jumia en message français exploitable. */
export function describeOAuthError(error: unknown, description?: string): string {
  const raw = String(error ?? "");
  if (raw === "invalid_grant") {
    return "Le refresh token est expiré ou a déjà été remplacé. Générez-en un nouveau dans Vendor Center.";
  }
  if (raw === "unauthorized_client") {
    return "Type d'autorisation refusé : l'application doit être en « Self Authorization ».";
  }
  if (raw === "invalid_client") {
    return "Identifiants Jumia refusés (client_id inconnu).";
  }
  if (description) return description.slice(0, 300);
  return "Refus par le serveur d'authentification Jumia.";
}

/**
 * Lit les identifiants d'un compte vendeur Jumia enregistré dans l'application.
 *
 * Le refresh token est déchiffré à la volée ; il n'existe jamais en clair en
 * dehors de cette fonction. Un compte supprimé ou illisible renvoie `null`.
 */
export async function readAccountCredentials(
  accountId: string,
): Promise<(JumiaCredentials & { status: string | null }) | null> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  try {
    const rows = await getDb()
      .select({
        clientId: schema.jumiaAccounts.clientId,
        ciphertext: schema.jumiaAccounts.refreshTokenCiphertext,
        status: schema.jumiaAccounts.status,
      })
      .from(schema.jumiaAccounts)
      .where(eq(schema.jumiaAccounts.id, accountId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    // Le payload chiffré est le JSON `{clientId, refreshToken}` (même format
    // que l'identifiant historique) : il contient le jeton à jour.
    const plain = decryptText(row.ciphertext, secret);
    if (!plain) return null;
    let refreshToken = plain;
    try {
      const parsed = JSON.parse(plain) as { refreshToken?: unknown };
      if (typeof parsed.refreshToken === "string" && parsed.refreshToken) {
        refreshToken = parsed.refreshToken;
      }
    } catch {
      // Valeur déjà en clair dans l'enveloppe : on la prend telle quelle.
    }
    return { clientId: row.clientId, refreshToken, status: row.status };
  } catch {
    return null;
  }
}

/** Écrit le refresh token chiffré d'un compte Jumia après rotation réussie. */
export async function writeAccountRefreshToken(
  accountId: string,
  refreshToken: string,
): Promise<void> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret)
    throw new JumiaError(
      "ENCRYPTION_KEY manquante : impossible de stocker les identifiants.",
      "no_encryption_key",
    );
  // Même enveloppe que l'identifiant historique : JSON chiffré, afin que le
  // refresh token qui tourne soit toujours relu dans le bon format.
  const { clientId } = await getDb()
    .select({ clientId: schema.jumiaAccounts.clientId })
    .from(schema.jumiaAccounts)
    .where(eq(schema.jumiaAccounts.id, accountId))
    .limit(1)
    .then((rows) => rows[0] ?? { clientId: "" });
  if (!clientId) throw new JumiaError("Ce compte Jumia est introuvable.", "not_configured");

  const ciphertext = encryptText(JSON.stringify({ clientId, refreshToken }), secret);
  await getDb()
    .update(schema.jumiaAccounts)
    .set({ refreshTokenCiphertext: ciphertext, lastTokenAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.jumiaAccounts.id, accountId));
}

/** Lit les identifiants : base d'abord, sinon les variables d'environnement. */
export async function readCredentials(): Promise<{
  credentials: JumiaCredentials | null;
  source: "base" | "environnement";
}> {
  try {
    const rows = await getDb()
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, CREDENTIALS_KEY))
      .limit(1);
    const stored = rows[0]?.value as string | undefined;
    if (stored) {
      const plain = decryptText(stored, process.env.ENCRYPTION_KEY ?? "");
      if (plain) {
        try {
          const parsed = JSON.parse(plain) as Partial<JumiaCredentials>;
          if (parsed.clientId && parsed.refreshToken) {
            return {
              credentials: { clientId: parsed.clientId, refreshToken: parsed.refreshToken },
              source: "base",
            };
          }
        } catch {
          // valeur illisible : on retombe sur l'environnement
        }
      }
    }
  } catch {
    // table inaccessible : on retombe sur l'environnement
  }

  const clientId = process.env.JUMIA_CLIENT_ID?.trim();
  const refreshToken = process.env.JUMIA_REFRESH_TOKEN?.trim();
  if (!clientId || !refreshToken) {
    return { credentials: null, source: "environnement" };
  }
  return { credentials: { clientId, refreshToken }, source: "environnement" };
}

/** Persiste les identifiants (chiffrés AES-256-GCM) après une rotation réussie. */
export async function writeCredentials(credentials: JumiaCredentials): Promise<void> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret)
    throw new JumiaError(
      "ENCRYPTION_KEY manquante : impossible de stocker les identifiants.",
      "no_encryption_key",
    );
  const payload = encryptText(JSON.stringify(credentials), secret);
  await getDb()
    .insert(schema.appSettings)
    .values({ key: CREDENTIALS_KEY, value: payload })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: payload, updatedAt: new Date() },
    });
}

/**
 * Cache des access tokens, **par compte** : chaque boutique utilise le jeton
 * de son propre compte vendeur.
 */
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/** Extrait l'e-mail du porteur du jeton (revendication `email` du JWT). */
export function emailFromAccessToken(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as {
      email?: unknown;
    };
    return typeof payload.email === "string" && payload.email ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * Échange un refresh token contre un access token, SANS persistance ni cache.
 * L'appelant décide où écrire le nouveau refresh token (compte ou ancien
 * emplacement unique).
 */
export async function exchangeAccessToken(
  credentials: JumiaCredentials,
): Promise<JumiaTokenResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    refresh_token: credentials.refreshToken,
  });

  let response: Response;
  try {
    response = await fetch(`${jumiaApiBase()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new JumiaError("Jumia injoignable (réseau ou DNS).", "network");
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const oauthError = typeof payload.error === "string" ? payload.error : null;
    const oauthDescription =
      typeof payload.error_description === "string" ? payload.error_description : undefined;
    throw new JumiaError(
      describeOAuthError(oauthError, oauthDescription),
      oauthError ?? "http_error",
      response.status,
    );
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const expiresIn = Number(payload.expires_in);
  const nextRefreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";

  if (!accessToken || !Number.isFinite(expiresIn)) {
    throw new JumiaError(
      "Réponse Jumia incomplète (access_token / expires_in absents).",
      "bad_response",
      response.status,
    );
  }
  if (!nextRefreshToken) {
    throw new JumiaError(
      "Jumia n'a pas renvoyé de nouveau refresh token.",
      "bad_response",
      response.status,
    );
  }

  return {
    accessToken,
    expiresIn,
    nextRefreshToken,
    refreshExpiresIn: Number.isFinite(Number(payload.refresh_expires_in))
      ? Number(payload.refresh_expires_in)
      : null,
  };
}

/**
 * Access token d'un compte Jumia (rotation du refresh token ré-écrite sur le
 * compte, cache mémoire respectant `expires_in`).
 */
async function accessTokenForAccount(accountId: string): Promise<string> {
  const cached = tokenCache.get(`account:${accountId}`);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const credentials = await readAccountCredentials(accountId);
  if (!credentials) {
    throw new JumiaError("Ce compte Jumia est introuvable.", "not_configured");
  }
  const result = await exchangeAccessToken(credentials);
  await writeAccountRefreshToken(accountId, result.nextRefreshToken);
  tokenCache.set(`account:${accountId}`, {
    accessToken: result.accessToken,
    expiresAt: Date.now() + Math.max(0, result.expiresIn - EXPIRY_SKEW_SECONDS) * 1000,
  });
  return result.accessToken;
}

/**
 * Access token du compte Jumia **explicitement lié** à une boutique locale.
 *
 * Aucun repli n'est possible : une boutique sans compte vendeur lié refuse
 * la synchronisation. C'est la garantie qu'une boutique ne lit jamais les
 * données d'un autre compte vendeur (cause racine des mélanges de données).
 */
export async function getAccessTokenForShop(shopId: string): Promise<string> {
  const rows = await getDb()
    .select({
      jumiaAccountId: schema.shops.jumiaAccountId,
      remoteShopId: schema.shops.remoteShopId,
    })
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1);
  const shop = rows[0];
  if (!shop) {
    throw new JumiaError("Boutique introuvable.", "not_configured");
  }
  if (!shop.remoteShopId) {
    throw new JumiaError(
      "Cette boutique n'est rattachée à aucune boutique Jumia.",
      "not_configured",
    );
  }
  if (!shop.jumiaAccountId) {
    throw new JumiaError(
      "Cette boutique n'est liée à aucun compte vendeur Jumia : rattachez-la à un compte (Boutiques → Comptes Jumia) avant de synchroniser.",
      "not_configured",
    );
  }
  return accessTokenForAccount(shop.jumiaAccountId);
}

/**
 * Access token historique (identifiants uniques, variables d'environnement ou
 * ancienne clé de `app_settings`). Conservé pour le test de connexion global et
 * comme repli des boutiques attachées avant le multi-compte.
 */
export async function getAccessToken(): Promise<string> {
  const cached = tokenCache.get("legacy");
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const { credentials } = await readCredentials();
  if (!credentials) {
    throw new JumiaError(
      "Aucun identifiant Jumia configuré. Ajoutez un compte vendeur dans Boutiques → Comptes Jumia.",
      "not_configured",
    );
  }
  const result = await exchangeAccessToken(credentials);
  // Le refresh token tourne à chaque appel : on le ré-écrit tout de suite.
  await writeCredentials({ clientId: credentials.clientId, refreshToken: result.nextRefreshToken });
  tokenCache.set("legacy", {
    accessToken: result.accessToken,
    expiresAt: Date.now() + Math.max(0, result.expiresIn - EXPIRY_SKEW_SECONDS) * 1000,
  });
  return result.accessToken;
}

/** Access token d'un compte Jumia donné (utilisé par les écrans et scripts). */
export async function getAccessTokenForAccount(accountId: string): Promise<string> {
  return accessTokenForAccount(accountId);
}
