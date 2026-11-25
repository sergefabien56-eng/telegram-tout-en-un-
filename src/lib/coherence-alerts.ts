import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CoherenceAnomaly } from "@/lib/coherence";
import type { CoherenceDrift } from "@/lib/coherence-history";
import { listUserPrefs } from "@/lib/notifications";

/**
 * ALERTES DE COHÉRENCE
 *
 * L'historique **détecte** une dérive ; le vendeur doit être **prévenu**.
 * Ce module transforme un contrôle de cohérence en notifications :
 * - canal **web** : la cloche et la page « Notifications » ;
 * - canal **Telegram** : message direct au compte lié.
 *
 * Quatre règles :
 * 1. on ne alerte que sur ce qui est **actionnable** : une anomalie critique
 *    ou une dérive — pas sur un simple statut périmé ;
 * 2. on respecte les **préférences** de l'utilisateur (canal et type) ;
 * 3. on ne **spamme** pas : une clé de déduplication par boutique, jour et
 *    problème — **par destinataire**, pour que deux gestionnaires d'une même
 *    boutique soient tous les deux prévenu ;
 * 4. chaque envoi est **tracé** dans `notifications` : on doit pouvoir
 *    prouver ce qui a été envoyé, et sur quel canal.
 */

export type AlertChannel = "web" | "telegram";

export type AlertResult = {
  shopId: string;
  code: string;
  title: string;
  /** Destinataire concerné (un résultat par destinataire et par canal). */
  userId?: string;
  /** Canaux qui ont effectivement reçu l'alerte. */
  delivered: AlertChannel[];
  /** Raison d'un éventuel non-envoi. */
  skipped?: string;
};

const CRITICAL_TYPES = ["critique", "avertissement"] as const;

/** Problèmes à signaler : anomalies actionnables + dérive. */
export function alertableIssues(
  anomalies: CoherenceAnomaly[],
  drift: CoherenceDrift | null,
): { code: string; title: string; body: string }[] {
  // Un même problème ne doit produire qu'une seule alerte : la dérive est
  // déjà présente dans les anomalies du diagnostic, avec le même code.
  const issues = new Map<string, { code: string; title: string; body: string }>();

  for (const anomaly of anomalies) {
    if (!(CRITICAL_TYPES as readonly string[]).includes(anomaly.severity)) continue;
    issues.set(anomaly.code, {
      code: anomaly.code,
      title: `Cohérence — ${anomaly.title}`,
      body: `${anomaly.evidence} ${anomaly.recommendation}`,
    });
  }

  // Une dérive « résolue » est une bonne nouvelle : elle ne mérite pas
  // d'alerte, seulement une trace. Seules les dérives actionnables sont
  // signalées.
  if (drift && drift.severity !== "information") {
    const code = `derive_${drift.code}`;
    issues.set(code, {
      code,
      title: `Évolution — ${drift.title}`,
      body: `${drift.evidence} ${drift.recommendation}`,
    });
  }

  return [...issues.values()];
}

/** Destinataires : propriétaires et gestionnaires de la boutique. */
export async function alertRecipients(shopId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: schema.shopMembers.userId })
    .from(schema.shopMembers)
    .where(
      and(
        eq(schema.shopMembers.shopId, shopId),
        inArray(schema.shopMembers.role, ["owner", "manager"]),
      ),
    );
  return [...new Set(rows.map((row) => row.userId))];
}

/**
 * Signale les problèmes de cohérence d'une boutique.
 *
 * @param day Jour UTC de référence pour la déduplication (un problème ne
 *            est signalé qu'une fois par jour et par boutique).
 */
export async function alertCoherenceIssues(params: {
  shopId: string;
  shopName: string;
  anomalies: CoherenceAnomaly[];
  drift: CoherenceDrift | null;
  day?: string;
  /** Envoi Telegram (désactivé dans les tests). */
  sendTelegram?: boolean;
}): Promise<AlertResult[]> {
  const issues = alertableIssues(params.anomalies, params.drift);
  if (issues.length === 0) return [];

  const day = params.day ?? new Date().toISOString().slice(0, 10);
  const recipients = await alertRecipients(params.shopId);
  if (recipients.length === 0) return [];

  const results: AlertResult[] = [];
  for (const issue of issues) {
    for (const userId of recipients) {
      const prefs = await listUserPrefs(userId);
      const webEnabled = prefs.some(
        (pref) => pref.channel === "web" && pref.type === "shop" && pref.enabled,
      );
      const telegramEnabled = prefs.some(
        (pref) => pref.channel === "telegram" && pref.type === "shop" && pref.enabled,
      );

      const delivered: AlertChannel[] = [];

      // ── Canal web ────────────────────────────────────────────────────────
      // La clé de déduplication décrit le *problème* ; c'est l'index unique
      // (user_id, dedupe_key) qui la rend unique **par destinataire**. Deux
      // gestionnaires de la même boutique reçoivent donc chacun leur alerte.
      if (webEnabled) {
        const inserted = await insertTraced({
          userId,
          shopId: params.shopId,
          channel: "web",
          dedupeKey: dedupeKey(params.shopId, day, issue.code),
          title: issue.title,
          body: `${params.shopName} — ${issue.body}`,
          status: "pending",
        });
        if (inserted) delivered.push("web");
      }

      // ── Canal Telegram ──────────────────────────────────────────────────
      if (telegramEnabled && params.sendTelegram !== false) {
        const sent = await sendTelegramAlert({
          userId,
          shopId: params.shopId,
          shopName: params.shopName,
          issue,
          dedupeKey: dedupeKey(params.shopId, day, issue.code, "telegram"),
        });
        if (sent.ok) delivered.push("telegram");
      }

      results.push({
        shopId: params.shopId,
        code: issue.code,
        title: issue.title,
        userId,
        delivered,
        skipped:
          delivered.length === 0
            ? "déjà signalé ou préférences désactivées"
            : undefined,
      });
    }
  }

  return results;
}

/**
 * Clé de déduplication d'un problème.
 *
 * Elle décrit le problème (boutique, jour, code) et **le canal** : un même
 * problème peut être signalé une fois sur le web et une fois sur Telegram,
 * sans que l'un n'écrase la trace de l'autre.
 */
export function dedupeKey(
  shopId: string,
  day: string,
  code: string,
  channel: AlertChannel = "web",
): string {
  return `coherence:${shopId}:${day}:${code}:${channel}`;
}

/**
 * Écrit la trace d'une notification. Renvoie `true` si la trace est
 * nouvelle (c'est-à-dire si l'alerte n'avait pas déjà été émise).
 */
async function insertTraced(params: {
  userId: string;
  shopId: string;
  channel: AlertChannel;
  dedupeKey: string;
  title: string;
  body: string;
  status: "pending" | "sent" | "failed";
  error?: string;
}): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(schema.notifications)
    .values({
      userId: params.userId,
      shopId: params.shopId,
      type: "shop",
      channel: params.channel,
      title: params.title,
      body: params.body,
      status: params.status,
      sentAt: params.status === "sent" ? new Date() : null,
      error: params.error ?? null,
      dedupeKey: params.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id });
  return Boolean(inserted[0]);
}

/**
 * Envoie l'alerte sur Telegram (si un compte est lié) et **trace** l'envoi.
 *
 * La trace est écrite avant l'envoi : si l'envoi échoue, la trace le dit
 * (`status: failed`, `error`), et l'unicité empêche de renvoyer le même
 * message en boucle au même destinataire le même jour.
 */
async function sendTelegramAlert(params: {
  userId: string;
  shopId: string;
  shopName: string;
  issue: { title: string; body: string };
  dedupeKey: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  const accounts = await db
    .select({ telegramId: schema.telegramAccounts.telegramId })
    .from(schema.telegramAccounts)
    .where(eq(schema.telegramAccounts.linkedUserId, params.userId))
    .limit(1);
  const account = accounts[0];
  if (!account) return { ok: false, reason: "aucun compte Telegram lié" };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, reason: "TELEGRAM_BOT_TOKEN absent" };

  // Trace d'envoi : elle joue aussi le rôle de garde anti-doublon.
  const traced = await insertTraced({
    userId: params.userId,
    shopId: params.shopId,
    channel: "telegram",
    dedupeKey: params.dedupeKey,
    title: params.issue.title,
    body: `${params.shopName} — ${params.issue.body}`,
    status: "pending",
  });
  if (!traced) return { ok: false, reason: "déjà envoyé" };

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const text = `<b>${escapeHtml(params.issue.title)}</b>\n${escapeHtml(params.shopName)} — ${escapeHtml(params.issue.body)}`;
  const result = await sendTelegramMessage(botToken, account.telegramId, text);

  await db
    .update(schema.notifications)
    .set({
      status: result.ok ? "sent" : "failed",
      sentAt: result.ok ? new Date() : null,
      error: result.ok ? null : (result.error ?? "envoi Telegram impossible"),
    })
    .where(
      and(
        eq(schema.notifications.userId, params.userId),
        eq(schema.notifications.dedupeKey, params.dedupeKey),
      ),
    );

  return result.ok ? { ok: true } : { ok: false, reason: result.error ?? "envoi impossible" };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
