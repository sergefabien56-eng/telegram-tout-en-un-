import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listUserShops } from "@/lib/shops";
import { hasAdminAccess } from "@/lib/admin";
import { connectionStates, type ConnectionLabel } from "@/lib/connection-state";
import { checkShopCoherence, type CoherenceAnomaly, type CoherenceCheck } from "@/lib/coherence";
import {
  coherenceHistory,
  detectDrift,
  recordCoherenceSnapshot,
  type CoherenceDrift,
  type CoherenceSnapshot,
} from "@/lib/coherence-history";
import { testJumiaAccount } from "@/lib/jumia/accounts";

/**
 * DIAGNOSTIC MULTIBOUTIQUE
 *
 * Outil interne d'audit : il ne « répare » rien tout seul, il **prouve** l'état
 * réel de chaque boutique et signale précisément les anomalies, leur origine
 * et leur conséquence.
 *
 * Pilotes :
 * - `shop.connected` : l'état factuel de la boutique (lien + compte + données) ;
 * - `shop.coherence` : la preuve de cohérence entre Jumia et l'application ;
 * - `shop.account` : le test réel du compte vendeur (réseau) ;
 * - `shop.anomalies` : la liste classée par gravité.
 */

export type DiagnosticSeverity = "critique" | "avertissement" | "information";

export type ShopDiagnostic = {
  shopId: string;
  name: string;
  remoteShopId: string | null;
  remoteShopName: string | null;
  accountId: string | null;
  accountLabel: string | null;
  connection: ConnectionLabel;
  coherence: CoherenceCheck | null;
  /** Test réel du compte vendeur (réseau Jumia). */
  accountTest: { ok: boolean; shops: number; error?: string } | null;
  anomalies: CoherenceAnomaly[];
  /** Dérive détectée entre le dernier contrôle et le précédent. */
  drift: CoherenceDrift | null;
  /** Historique quotidien des contrôles (le plus récent en premier). */
  history: CoherenceSnapshot[];
  /** Verdict global de la boutique. */
  verdict: "operationnelle" | "partielle" | "hors_service";
};

export type DiagnosticReport = {
  generatedAt: string;
  userId: string;
  shops: ShopDiagnostic[];
  summary: {
    shops: number;
    operationnelles: number;
    partielles: number;
    horsService: number;
    anomalies: number;
    critiques: number;
    avertissements: number;
  };
};

/**
 * Diagnostic complet des boutiques de l'utilisateur.
 *
 * @param deep Avec `deep`, on interroge Jumia (preuve de cohérence et test du
 *             compte). Sans, seuls les contrôles locaux sont faits — utile
 *             pour un affichage rapide.
 */
export async function diagnosticReport(params: {
  userId: string;
  deep?: boolean;
  shopId?: string;
}): Promise<DiagnosticReport> {
  const shops = await listUserShops(params.userId);
  const shopIds = shops.map((shop) => shop.id);
  const states = await connectionStates(shopIds);

  const selected = params.shopId
    ? shops.filter((shop) => shop.id === params.shopId)
    : shops;

  const diagnostics: ShopDiagnostic[] = [];
  for (const shop of selected) {
    const connection = states.get(shop.id) ?? {
      state: "non_rattachee" as const,
      label: "Non rattachée",
      detail: "Boutique inconnue.",
      operational: false,
    };

    let coherence: CoherenceCheck | null = null;
    let accountTest: ShopDiagnostic["accountTest"] = null;

    if (params.deep) {
      coherence = await checkShopCoherence({ shopId: shop.id });

      // Historisation : chaque contrôle laisse une trace quotidienne, ce qui
      // permet de voir une boutique dériver dans le temps (et pas seulement
      // d'être correcte ou non à l'instant présent).
      if (coherence.status !== "indisponible") {
        try {
          await recordCoherenceSnapshot(shop.id, coherence);
        } catch (error) {
          console.error("[diagnostic] instantané de cohérence non enregistré", error);
        }
      }

      if (shop.jumiaAccountId) {
        const test = await testJumiaAccount(params.userId, shop.jumiaAccountId);
        accountTest = { ok: test.ok, shops: test.shops, error: test.error };
      }
    }

    const anomalies: CoherenceAnomaly[] = [...(coherence?.anomalies ?? [])];
    if (accountTest && !accountTest.ok) {
      anomalies.push({
        code: "lecture_impossible",
        severity: "critique",
        title: "Compte vendeur inutilisable",
        evidence: accountTest.error ?? "Le test du compte a échoué.",
        cause: "Refresh token expiré, remplacé ou identifiant client refusé par Jumia.",
        recommendation: "Générer un nouveau refresh token dans Vendor Center, puis le saisir dans Comptes Jumia.",
      });
    }
    if (!connection.operational && anomalies.length === 0) {
      anomalies.push({
        code: "synchronisation_echouee",
        severity: connection.state === "non_rattachee" ? "information" : "critique",
        title: connection.label,
        evidence: connection.detail,
        cause:
          connection.state === "non_rattachee"
            ? "Boutique créée localement, sans rattachement."
            : "Rattachement incomplet ou compte vendeur non valide.",
        recommendation:
          connection.state === "non_rattachee"
            ? "Rattacher la boutique depuis Boutiques → Comptes Jumia."
            : "Lier la boutique à un compte vendeur valide puis synchroniser.",
      });
    }

    const critiques = anomalies.filter((anomaly) => anomaly.severity === "critique").length;
    const verdict: ShopDiagnostic["verdict"] =
      connection.operational && critiques === 0
        ? "operationnelle"
        : connection.operational || anomalies.length > 0
          ? "partielle"
          : "hors_service";

    diagnostics.push({
      shopId: shop.id,
      name: shop.name,
      remoteShopId: shop.remoteShopId ?? null,
      remoteShopName: shop.remoteShopName ?? null,
      accountId: shop.jumiaAccountId ?? null,
      accountLabel: null,
      connection,
      coherence,
      accountTest,
      anomalies,
      drift: null,
      history: [],
      verdict,
    });
  }

  // Historique : rechargé **après** les contrôles, pour que l'instantané du
  // jour soit déjà en base quand on compare le dernier contrôle au
  // précédent.
  const history = await coherenceHistory(
    selected.map((shop) => shop.id),
    30,
  );
  for (const diagnostic of diagnostics) {
    const shopHistory = history.get(diagnostic.shopId) ?? [];
    const drift = detectDrift(shopHistory);
    if (drift) {
      diagnostic.anomalies.push({
        code: "synchronisation_echouee",
        severity: drift.severity,
        title: drift.title,
        evidence: drift.evidence,
        cause: drift.cause,
        recommendation: drift.recommendation,
      });
      diagnostic.drift = drift;
      if (drift.severity === "avertissement") {
        diagnostic.verdict = "partielle";
      }
    }
    diagnostic.history = shopHistory;
  }

  const summary = {
    shops: diagnostics.length,
    operationnelles: diagnostics.filter((row) => row.verdict === "operationnelle").length,
    partielles: diagnostics.filter((row) => row.verdict === "partielle").length,
    horsService: diagnostics.filter((row) => row.verdict === "hors_service").length,
    anomalies: diagnostics.reduce((total, row) => total + row.anomalies.length, 0),
    critiques: diagnostics.reduce(
      (total, row) => total + row.anomalies.filter((a) => a.severity === "critique").length,
      0,
    ),
    avertissements: diagnostics.reduce(
      (total, row) => total + row.anomalies.filter((a) => a.severity === "avertissement").length,
      0,
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    userId: params.userId,
    shops: diagnostics,
    summary,
  };
}

/**
 * Réparation sûre : relance la synchronisation complète d'une boutique.
 *
 * Avant toute écriture sur des données existantes, une **sauvegarde** est
 * produite (export compressé) et l'opération est journalisée dans l'audit.
 * Aucune suppression n'est automatique : l'upsert écrase les lignes de la
 * boutique concernée et écarte les données qui appartiennent à une autre.
 */
export async function repairShop(params: {
  userId: string;
  shopId: string;
}): Promise<{ ok: boolean; error?: string; backup?: string | null; result?: unknown }> {
  if (!(await hasAdminAccess(params.userId))) {
    return { ok: false, error: "Accès réservé aux propriétaires et gestionnaires." };
  }
  const db = getDb();
  const rows = await db
    .select({ id: schema.shops.id, name: schema.shops.name })
    .from(schema.shops)
    .where(eq(schema.shops.id, params.shopId))
    .limit(1);
  const shop = rows[0];
  if (!shop) return { ok: false, error: "Boutique introuvable." };

  // 1. Sauvegarde AVANT toute écriture sur des données existantes.
  const backup = await createBackup();

  // 2. Synchronisation complète (écrase les lignes de la boutique, écarte les
  //    données qui appartiennent à une autre boutique).
  const { syncShopFully } = await import("@/lib/full-sync");
  const result = await syncShopFully({ userId: params.userId, shopId: params.shopId, days: 90 });

  // 3. Trace de l'opération.
  const { audit } = await import("@/lib/audit");
  await audit({
    action: "admin.shop_repaired",
    result: result.ok ? "success" : "failure",
    userId: params.userId,
    entityType: "shop",
    entityId: params.shopId,
    metadata: { backup: backup?.filename ?? null, result },
  });

  return { ok: result.ok, backup: backup?.filename ?? null, result };
}

/**
 * Produit une sauvegarde compressée de la base avant une opération qui
 * modifie des données existantes. Retourne le nom du fichier écrit.
 */
async function createBackup(): Promise<{ filename: string; bytes: number } | null> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const [{ Client }, { gzipSync }, { createHash }, { mkdir, writeFile }, { join }, { buildSqlDump }] =
      await Promise.all([
        import("pg"),
        import("node:zlib"),
        import("node:crypto"),
        import("node:fs/promises"),
        import("node:path"),
        import("../../scripts/lib/dump-sql.mjs"),
      ]);
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      const dump = await buildSqlDump(client, { schema: "public" });
      const payload = gzipSync(Buffer.from(dump.sql, "utf8"));
      createHash("sha256").update(payload).digest("hex");
      const dir = process.env.BACKUP_DIR ?? join(process.cwd(), "backups");
      await mkdir(dir, { recursive: true });
      const filename = `backup-reparation-${dump.stamp}.sql.gz`;
      await writeFile(join(dir, filename), payload);
      return { filename, bytes: payload.length };
    } finally {
      await client.end().catch(() => undefined);
    }
  } catch (error) {
    console.error("[diagnostic] sauvegarde impossible", error);
    return null;
  }
}
