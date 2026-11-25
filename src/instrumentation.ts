/**
 * Point d'entrée du serveur (Next.js) : exécuté une fois au démarrage.
 *
 * On applique les migrations Drizzle en attente ici : un déploiement ne peut
 * jamais laisser la base en retard sur le code. En cas d'échec, l'application
 * démarre quand même et `/api/health` remonte l'erreur (rien n'est caché).
 *
 * L'import du code Node est conditionnel : le bundle « edge » ne doit jamais
 * charger `pg` ni le système de fichiers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupMigrations } = await import("./instrumentation-node");
    await runStartupMigrations();
  }
}
