import { defineConfig } from "drizzle-kit";

/**
 * Configuration Drizzle Kit — voir docs/database.md.
 * La base est PostgreSQL (Neon en préproduction, PG autonome ensuite).
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Les migrations utilisent la connexion directe (non poolée) ;
    // l'application utilise DATABASE_URL (poolée, adaptée au serverless).
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
