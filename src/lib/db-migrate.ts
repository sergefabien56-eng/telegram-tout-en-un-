import { existsSync } from "node:fs";
import { join } from "node:path";

export type MigrationStatus = {
  ok: boolean;
  /** Nombre de migrations appliquées pendant ce démarrage. */
  applied: number;
  error?: string;
};

/**
 * Le résultat est stocké dans `globalThis` : l'instrumentation et les routes
 * API sont compilés dans des bundles séparés, seule une variable globale est
 * partagée entre les deux à l'intérieur du même processus.
 */
type MigrationStore = { __teuMigrationStatus?: MigrationStatus };

export function setMigrationStatus(status: MigrationStatus): void {
  (globalThis as MigrationStore).__teuMigrationStatus = status;
}

export function getMigrationStatus(): MigrationStatus | null {
  return (globalThis as MigrationStore).__teuMigrationStatus ?? null;
}

/**
 * Applique les migrations Drizzle en attente, au démarrage du serveur.
 *
 * Objectif : un déploiement ne peut jamais laisser la base en retard sur le
 * code (colonne absente → page en erreur). La migration est idempotente :
 * Drizzle ne réapplique que ce qui n'a pas encore été appliqué.
 *
 * L'échec n'arrête pas l'application : il est journalisé et remonté par
 * `/api/health`, pour être vu immédiatement plutôt que caché.
 */
export async function applyPendingMigrations(): Promise<MigrationStatus> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) return { ok: false, applied: 0, error: "DATABASE_URL absent." };

  const folder = join(process.cwd(), "drizzle");
  if (!existsSync(folder)) {
    return { ok: false, applied: 0, error: "Dossier de migrations introuvable." };
  }

  try {
    const [{ drizzle }, { Pool }, { migrate }] = await Promise.all([
      import("drizzle-orm/node-postgres"),
      import("pg"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const pool = new Pool({ connectionString: url });
    try {
      const before = await pool.query(
        `select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const after = await pool.query(
        `select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      const applied = Number(after.rows[0]?.n ?? 0) - Number(before.rows[0]?.n ?? 0);
      if (applied > 0) {
        console.log(`[migrations] ${applied} migration(s) appliquée(s) au démarrage.`);
      }
      return { ok: true, applied };
    } finally {
      await pool.end();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[migrations] échec de l'application des migrations", error);
    return { ok: false, applied: 0, error: message };
  }
}
