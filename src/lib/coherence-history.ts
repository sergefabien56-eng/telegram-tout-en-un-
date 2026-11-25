import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CoherenceCheck } from "@/lib/coherence";

/**
 * HISTORIQUE DE COHÉRENCE
 *
 * Un contrôle ponctuel prouve qu'une boutique est cohérente **aujourd'hui**.
 * C'est la suite des contrôles qui prouve qu'elle ne **dérive pas**.
 *
 * On conserve donc un instantané par boutique et par jour : volumétries,
 * montants comparés, nombre d'anomalies. Le diagnostic compare le dernier
 * instantané au précédent et signale une dérive (montant qui recule, volume
 * qui chute, anomalies qui apparaissent).
 */

export type CoherenceSnapshot = {
  id: string;
  shopId: string;
  day: string;
  status: string;
  localProducts: number;
  localOrders: number;
  localStatements: number;
  remoteProducts: number | null;
  remoteOrders: number | null;
  remoteStatements: number | null;
  revenueMinor: number | null;
  remoteRevenueMinor: number | null;
  netMinor: number | null;
  remoteNetMinor: number | null;
  ordersAmountMinor: number | null;
  remoteOrdersAmountMinor: number | null;
  anomalies: number;
  anomalyCodes: string[] | null;
  checkedAt: Date;
};

/** Jour UTC (YYYY-MM-DD) — un instantané par boutique et par jour. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Enregistre (ou met à jour) l'instantané du jour pour une boutique.
 *
 * L'écriture est idempotente : un contrôle répété le même jour remplace
 * l'instantané précédent au lieu d'en créer un second.
 */
export async function recordCoherenceSnapshot(
  shopId: string,
  check: CoherenceCheck,
): Promise<void> {
  const db = getDb();
  const day = utcDay(check.remote?.readAt ?? new Date());
  const values = {
    shopId,
    day,
    status: check.status,
    localProducts: check.local.products,
    localOrders: check.local.orders,
    localStatements: check.local.statements,
    remoteProducts: check.remote?.products ?? null,
    remoteOrders: check.remote?.orders ?? null,
    remoteStatements: check.remote?.statements ?? null,
    revenueMinor: check.financials?.local.revenue ?? null,
    remoteRevenueMinor: check.financials?.remote.revenue ?? null,
    netMinor: check.financials?.local.net ?? null,
    remoteNetMinor: check.financials?.remote.net ?? null,
    ordersAmountMinor: check.ordersProof?.local.amountMinor ?? null,
    remoteOrdersAmountMinor: check.ordersProof?.remote.amountMinor ?? null,
    anomalies: check.anomalies.length,
    anomalyCodes: check.anomalies.map((anomaly) => anomaly.code),
    checkedAt: new Date(),
  };

  const existing = await db
    .select({ id: schema.coherenceSnapshots.id })
    .from(schema.coherenceSnapshots)
    .where(
      and(
        eq(schema.coherenceSnapshots.shopId, shopId),
        eq(schema.coherenceSnapshots.day, day),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.coherenceSnapshots)
      .set(values)
      .where(eq(schema.coherenceSnapshots.id, existing[0].id));
    return;
  }
  await db.insert(schema.coherenceSnapshots).values(values);
}

/** Historique des contrôles d'une boutique (du plus récent au plus ancien). */
export async function coherenceHistory(
  shopIds: string[],
  days = 30,
): Promise<Map<string, CoherenceSnapshot[]>> {
  const result = new Map<string, CoherenceSnapshot[]>();
  if (shopIds.length === 0) return result;
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select()
    .from(schema.coherenceSnapshots)
    .where(
      and(
        inArray(schema.coherenceSnapshots.shopId, shopIds),
        gte(schema.coherenceSnapshots.checkedAt, since),
      ),
    )
    .orderBy(desc(schema.coherenceSnapshots.checkedAt));

  for (const id of shopIds) result.set(id, []);
  for (const row of rows) {
    result.get(row.shopId)?.push({
      id: row.id,
      shopId: row.shopId,
      day: row.day,
      status: row.status,
      localProducts: row.localProducts,
      localOrders: row.localOrders,
      localStatements: row.localStatements,
      remoteProducts: row.remoteProducts,
      remoteOrders: row.remoteOrders,
      remoteStatements: row.remoteStatements,
      revenueMinor: row.revenueMinor,
      remoteRevenueMinor: row.remoteRevenueMinor,
      netMinor: row.netMinor,
      remoteNetMinor: row.remoteNetMinor,
      ordersAmountMinor: row.ordersAmountMinor,
      remoteOrdersAmountMinor: row.remoteOrdersAmountMinor,
      anomalies: row.anomalies,
      anomalyCodes: Array.isArray(row.anomalyCodes) ? (row.anomalyCodes as string[]) : null,
      checkedAt: row.checkedAt,
    });
  }
  return result;
}

/**
 * Dérive détectée entre deux instantanés consécutifs.
 *
 * Une dérive n'est pas forcément une faute : Jumia peut corriger un relevé.
 * Ce qui compte, c'est que **le changement soit visible et expliqué**.
 */
export type CoherenceDrift = {
  code: "montant_recule" | "volume_aplati" | "ecart_apparu" | "ecart_resolu";
  severity: "avertissement" | "information";
  title: string;
  evidence: string;
  cause: string;
  recommendation: string;
};

/** Compare le dernier instantané au précédent pour une boutique. */
export function detectDrift(history: CoherenceSnapshot[]): CoherenceDrift | null {
  if (history.length < 2) return null;
  const latest = history[0];
  const previous = history[1];
  if (!latest || !previous) return null;

  // Un écart qui apparaît entre deux contrôles.
  if (previous.anomalies === 0 && latest.anomalies > 0) {
    return {
      code: "ecart_apparu",
      severity: "avertissement",
      title: "Un écart est apparu depuis le dernier contrôle",
      evidence: `${latest.day} : ${latest.anomalies} anomalie(s) (${(latest.anomalyCodes ?? []).join(", ")}). Le contrôle précédent (${previous.day}) n'en comptait aucune.`,
      cause: "Données modifiées à la source, ou synchronisation incomplète.",
      recommendation: "Consulter le diagnostic pour le détail de l'écart.",
    };
  }
  if (previous.anomalies > 0 && latest.anomalies === 0) {
    return {
      code: "ecart_resolu",
      severity: "information",
      title: "L'écart précédent est résolu",
      evidence: `${previous.day} : ${previous.anomalies} anomalie(s). ${latest.day} : aucune.`,
      cause: "Resynchronisation ou correction à la source.",
      recommendation: "Aucune action.",
    };
  }

  // Le montant local recule : le vendeur verrait son chiffre diminuer.
  if (
    latest.revenueMinor !== null &&
    previous.revenueMinor !== null &&
    latest.revenueMinor < previous.revenueMinor
  ) {
    const delta = previous.revenueMinor - latest.revenueMinor;
    return {
      code: "montant_recule",
      severity: "avertissement",
      title: "Le CA articles a reculé depuis le dernier contrôle",
      evidence: `${previous.day} : ${previous.revenueMinor} · ${latest.day} : ${latest.revenueMinor} (recul de ${delta} unités mineures).`,
      cause:
        "Correction de la source (relevés modifiés chez Jumia) ou perte de données locales.",
      recommendation: "Vérifier la synchronisation des relevés.",
    };
  }

  // Le volume local chute sans que la source chute aussi.
  if (
    latest.localOrders < previous.localOrders &&
    latest.remoteOrders !== null &&
    previous.remoteOrders !== null &&
    latest.remoteOrders >= previous.remoteOrders
  ) {
    return {
      code: "volume_aplati",
      severity: "avertissement",
      title: "Le nombre de commandes enregistrées a diminué",
      evidence: `${previous.day} : ${previous.localOrders} commandes locales · ${latest.day} : ${latest.localOrders}, alors que Jumia en renvoie ${latest.remoteOrders}.`,
      cause: "Commandes supprimées localement, ou synchronisation partielle.",
      recommendation: "Resynchroniser les commandes de la boutique.",
    };
  }

  return null;
}
