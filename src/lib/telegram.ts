import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Télégram — vérifications de sécurité et client Bot API.
 *
 * Règles (docs/telegram-integration.md §5, §8) :
 * - `initData` est vérifié côté serveur, `initDataUnsafe` n'est jamais une preuve.
 * - Comparaison d'empreinte à temps constant.
 * - `auth_date` borné dans le temps.
 * - Le secret de webhook est vérifié sur chaque appel.
 */

const TELEGRAM_API = "https://api.telegram.org";
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number; raw: URLSearchParams }
  | { ok: false; reason: string };

/** Vérifie le `initData` d'une Mini App (HMAC-SHA256, temps constant). */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 3600,
): InitDataResult {
  if (!initData || initData.length > 4096) {
    return { ok: false, reason: "initData manquant ou trop long." };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !HASH_PATTERN.test(hash)) {
    return { ok: false, reason: "hash absent ou malformé." };
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const givenBuffer = Buffer.from(hash, "hex");
  if (expectedBuffer.length !== givenBuffer.length || !timingSafeEqual(expectedBuffer, givenBuffer)) {
    return { ok: false, reason: "signature invalide." };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: "auth_date manquant." };
  }
  if (Math.abs(Date.now() / 1000 - authDate) > maxAgeSeconds) {
    return { ok: false, reason: "initData expiré." };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "user manquant." };

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return { ok: false, reason: "user illisible." };
  }
  if (!Number.isInteger(user.id) || user.id <= 0) {
    return { ok: false, reason: "identifiant utilisateur invalide." };
  }

  return { ok: true, user, authDate, raw: params };
}

/** Vérifie l'en-tête secret du webhook Telegram (temps constant). */
export function verifyWebhookSecret(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TelegramApiResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/** Appel à la Bot API (jamais de token dans les erreurs ou logs). */
export async function callTelegramApi(
  method: string,
  botToken: string,
  payload: Record<string, unknown> = {},
): Promise<TelegramApiResult> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json()) as {
      ok: boolean;
      result?: unknown;
      description?: string;
    };
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${response.status}` };
    }
    return { ok: true, result: data.result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "erreur réseau" };
  }
}

/** Envoie un message (HTML minimal, désactivé en cas de préférences). */
export function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
): Promise<TelegramApiResult> {
  return callTelegramApi("sendMessage", botToken, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

/** Configure le webhook (appel manuel, nécessite une URL HTTPS publique). */
export function setTelegramWebhook(
  botToken: string,
  url: string,
  secret: string,
): Promise<TelegramApiResult> {
  return callTelegramApi("setWebhook", botToken, {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    max_connections: 20,
    drop_pending_updates: false,
  });
}

/** Supprime le webhook. */
export function deleteTelegramWebhook(botToken: string): Promise<TelegramApiResult> {
  return callTelegramApi("deleteWebhook", botToken, { drop_pending_updates: false });
}
