import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { audit } from "@/lib/audit";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listUserShops } from "@/lib/shops";
// Module partagé avec `scripts/backup.mjs` : un seul format de dump.
import { buildSqlDump } from "../../../../../scripts/lib/dump-sql.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/backup — export de la base au format .sql.gz.
 *
 * Réservé aux propriétaires (une boutique en `owner`), tracé dans le journal
 * d'audit. Le dump est construit par le même module que la sauvegarde planifiée.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const shops = await listUserShops(user.id);
  if (!shops.some((shop) => shop.role === "owner")) {
    return fail(403, "Seul un propriétaire peut exporter la base.");
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) return fail(503, "Base de données non configurée sur ce serveur.");

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const dump = await buildSqlDump(client, { schema: "public" });
    const payload = gzipSync(Buffer.from(dump.sql, "utf8"));
    const checksum = createHash("sha256").update(payload).digest("hex");

    await audit({
      action: "admin.database_export",
      result: "success",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { tables: dump.tableCount, bytes: payload.length, checksum },
    });

    const filename = `backup-${dump.stamp}.sql.gz`;
    return new Response(payload, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(payload.length),
        "X-Backup-Checksum": checksum,
      },
    });
  } catch (error) {
    await audit({
      action: "admin.database_export",
      result: "failure",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
    return fail(500, "Échec de l'export de la base.");
  } finally {
    await client.end().catch(() => undefined);
  }
}
