DROP INDEX "notifications_dedupe_key_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "channel" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key_idx" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" IS NOT NULL;