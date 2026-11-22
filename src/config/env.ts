import { z } from "zod";

/**
 * Schéma d'environnement — validation Zod côté serveur (R4).
 * Aucune valeur n'est jamais renvoyée au client ; seules des présences booléennes
 * sont exposées (ex. route /api/health).
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1).optional(),

  ENCRYPTION_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),

  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_MINI_APP_URL: z.string().url().optional(),

  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),

  AI_PROVIDER: z.enum(["gemini", "groq", "openrouter", "local"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),

  CRON_SECRET: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export type ParseEnvResult =
  | { ok: true; data: AppEnv }
  | { ok: false; errors: string[] };

/** Valide l'environnement sans lever d'exception (sûr au build). */
export function parseEnv(source: Record<string, string | undefined>): ParseEnvResult {
  const result = envSchema.safeParse(source);
  if (result.success) return { ok: true, data: result.data };
  const errors = result.error.issues.map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`);
  return { ok: false, errors };
}

/** Présence des configurations (jamais les valeurs). */
export function configPresence(source: Record<string, string | undefined>) {
  return {
    database: Boolean(source.DATABASE_URL),
    encryptionKey: Boolean(source.ENCRYPTION_KEY),
    sessionSecret: Boolean(source.SESSION_SECRET),
    telegramBotToken: Boolean(source.TELEGRAM_BOT_TOKEN),
    telegramWebhookSecret: Boolean(source.TELEGRAM_WEBHOOK_SECRET),
    storage: Boolean(source.R2_BUCKET && source.R2_ACCESS_KEY_ID && source.R2_SECRET_ACCESS_KEY),
    aiKey: Boolean(source.GEMINI_API_KEY || source.GROQ_API_KEY || source.OPENROUTER_API_KEY),
  };
}
