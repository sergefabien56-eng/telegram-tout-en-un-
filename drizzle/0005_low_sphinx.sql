CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"order_number" text,
	"status" text NOT NULL,
	"country_code" text,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"total_amount_minor" integer NOT NULL,
	"total_amount_usd_minor" integer,
	"total_items" integer,
	"packed_items" integer,
	"is_prepayment" boolean,
	"has_multiple_status" boolean,
	"delivery_option" text,
	"customer_first_name" text,
	"customer_last_name" text,
	"customer_city" text,
	"remote_created_at" timestamp with time zone,
	"remote_updated_at" timestamp with time zone,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "sync_in_progress" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shop_external_idx" ON "orders" USING btree ("shop_id","external_order_id");--> statement-breakpoint
CREATE INDEX "orders_shop_created_idx" ON "orders" USING btree ("shop_id","remote_created_at");