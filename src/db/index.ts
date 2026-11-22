import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Connexion PostgreSQL (paresseuse). La variable DATABASE_URL est requise au
 * premier usage ; jamais de secret en dur.
 */
let pool: Pool | null = null;
let dbInstance: NodePgDatabase<typeof schema> | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL est requis pour accéder à la base de données.");
    }
    pool = new Pool({ connectionString });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export { schema };
