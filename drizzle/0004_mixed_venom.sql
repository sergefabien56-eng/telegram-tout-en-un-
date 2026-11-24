ALTER TABLE "shops" ADD COLUMN "remote_shop_id" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "remote_shop_name" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "remote_linked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "shops_remote_shop_idx" ON "shops" USING btree ("remote_shop_id");