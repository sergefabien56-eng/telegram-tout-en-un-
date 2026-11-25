import {
  getAccessToken,
  getAccessTokenForAccount,
  getAccessTokenForShop,
  JUMIA_TOKEN_URL,
  JumiaError,
} from "./client";

/**
 * Appels authentifiés aux API Jumia GPM/GOP.
 *
 * Deux règles des limitations officielles sont appliquées ici :
 * - 4 requêtes/seconde et 200 requêtes/minute par mastershop ;
 * - respect de `Retry-After` et backoff exponentiel sur 429/5xx.
 */
export const MIN_REQUEST_INTERVAL_MS = 350;
const MAX_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 30_000;

let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Espace les requêtes pour rester sous les deux plafonds (4/s et 200/min). */
export async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
  }
  return Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

/**
 * Effectue un appel GET authentifié, avec retries.
 * Retourne la réponse (y compris 4xx non réessayables) ou lève `JumiaError`.
 */
export type JumiaAccountScope =
  /** Compte vendeur enregistré dans l'application (multi-comptes). */
  | { accountId: string }
  /** Boutique locale : le compte est déduit du rattachement. */
  | { shopId: string }
  /** Identifiant historique unique (repli). */
  | { legacy?: true };

export async function jumiaGet(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  scope?: JumiaAccountScope,
): Promise<Response> {
  const accessToken = !scope
    ? await getAccessToken()
    : "accountId" in scope
      ? await getAccessTokenForAccount(scope.accountId)
      : "shopId" in scope
        ? await getAccessTokenForShop(scope.shopId)
        : await getAccessToken();

  const url = new URL(`${JUMIA_TOKEN_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      lastError = "Réseau indisponible.";
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(null, attempt));
        continue;
      }
      throw new JumiaError("Jumia injoignable après plusieurs tentatives.", "network");
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = `HTTP ${response.status}`;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
        continue;
      }
    }

    if (response.status === 401) {
      throw new JumiaError(
        "Jumia refuse le jeton (401). Le refresh token a peut-être été remplacé.",
        "unauthorized",
        401,
      );
    }

    return response;
  }

  throw new JumiaError(`Jumia n'a pas répondu correctement (${lastError}).`, "http_error");
}

/**
 * Effectue un appel POST authentifié (avec la même limitation de débit et les
 * mêmes reprises que `jumiaGet`).
 */
export async function jumiaPost(
  path: string,
  body: unknown,
  scope?: JumiaAccountScope,
): Promise<Response> {
  const accessToken = !scope
    ? await getAccessToken()
    : "accountId" in scope
      ? await getAccessTokenForAccount(scope.accountId)
      : "shopId" in scope
        ? await getAccessTokenForShop(scope.shopId)
        : await getAccessToken();

  const url = new URL(`${JUMIA_TOKEN_URL}${path}`);

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      lastError = "Réseau indisponible.";
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(null, attempt));
        continue;
      }
      throw new JumiaError("Jumia injoignable après plusieurs tentatives.", "network");
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = `HTTP ${response.status}`;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
        continue;
      }
    }

    if (response.status === 401) {
      throw new JumiaError(
        "Jumia refuse le jeton (401). Le refresh token a peut-être été remplacé.",
        "unauthorized",
        401,
      );
    }

    return response;
  }

  throw new JumiaError(`Jumia n'a pas répondu correctement (${lastError}).`, "http_error");
}
