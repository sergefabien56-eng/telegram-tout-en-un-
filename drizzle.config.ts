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
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
