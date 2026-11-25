CREATE TABLE "product_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" uuid,
	"seller_sku" text NOT NULL,
	"feed_id" text,
	"status" text DEFAULT 'envoyee' NOT NULL,
	"feed_status" text,
	"product_sid" text,
	"qc_status" text,
	"errors" jsonb,
	"payload" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_publications_shop_idx" ON "product_publications" USING btree ("shop_id","submitted_at");--> statement-breakpoint
CREATE INDEX "product_publications_sku_idx" ON "product_publications" USING btree ("shop_id","seller_sku");