/**
 * Code exécuté au démarrage du serveur Node : application des migrations
 * Drizzle en attente. Volontairement séparé de `instrumentation.ts` pour que
 * le bundle « edge » n'importe jamais `pg`.
 */
export async function runStartupMigrations(): Promise<void> {
  const { applyPendingMigrations, setMigrationStatus } = await import("@/lib/db-migrate");
  setMigrationStatus(await applyPendingMigrations());
}
