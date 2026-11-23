ALTER TABLE "users" ADD COLUMN "two_factor_recovery_codes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_confirmed_at" timestamp with time zone;