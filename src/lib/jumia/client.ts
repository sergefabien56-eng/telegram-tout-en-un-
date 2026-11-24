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

export const JUMIA_TOKEN_URL =
  process.env.JUMIA_API_BASE?.replace(/\/$/, "") ?? "https://vendor-api.jumia.com";

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
            return { credentials: { clientId: parsed.clientId, refreshToken: parsed.refreshToken }, source: "base" };
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
  if (!secret) throw new JumiaError("ENCRYPTION_KEY manquante : impossible de stocker les identifiants.", "no_encryption_key");
  const payload = encryptText(JSON.stringify(credentials), secret);
  await getDb()
    .insert(schema.appSettings)
    .values({ key: CREDENTIALS_KEY, value: payload })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: payload, updatedAt: new Date() },
    });
}

let cached: { accessToken: string; expiresAt: number } | null = null;

/** Échange un refresh token contre un access token et ré-écrit le refresh token. */
export async function requestAccessToken(credentials: JumiaCredentials): Promise<JumiaTokenResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    refresh_token: credentials.refreshToken,
  });

  let response: Response;
  try {
    response = await fetch(`${JUMIA_TOKEN_URL}/token`, {
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
    const oauthDescription = typeof payload.error_description === "string" ? payload.error_description : undefined;
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
    throw new JumiaError("Réponse Jumia incomplète (access_token / expires_in absents).", "bad_response", response.status);
  }
  if (!nextRefreshToken) {
    throw new JumiaError("Jumia n'a pas renvoyé de nouveau refresh token.", "bad_response", response.status);
  }

  const result: JumiaTokenResult = {
    accessToken,
    expiresIn,
    nextRefreshToken,
    refreshExpiresIn: Number.isFinite(Number(payload.refresh_expires_in))
      ? Number(payload.refresh_expires_in)
      : null,
  };

  // Le refresh token tourne à chaque appel : on le ré-écrit tout de suite.
  await writeCredentials({ clientId: credentials.clientId, refreshToken: nextRefreshToken });

  cached = { accessToken, expiresAt: Date.now() + Math.max(0, expiresIn - EXPIRY_SKEW_SECONDS) * 1000 };
  return result;
}

/** Access token courant (cache mémoire respectant `expires_in`). */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const { credentials } = await readCredentials();
  if (!credentials) {
    throw new JumiaError(
      "Aucun identifiant Jumia configuré. Renseignez JUMIA_CLIENT_ID et JUMIA_REFRESH_TOKEN, ou lancez le test de connexion.",
      "not_configured",
    );
  }
  const result = await requestAccessToken(credentials);
  return result.accessToken;
}
