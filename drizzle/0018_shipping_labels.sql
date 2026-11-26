CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"external_item_id" text NOT NULL,
	"status" text NOT NULL,
	"tracking_number" text,
	"tracking_url" text,
	"shipment_type" text,
	"delivery_option" text,
	"is_fulfilled_by_jumia" boolean DEFAULT false NOT NULL,
	"product_name" text,
	"seller_sku" text,
	"product_image_url" text,
	"country_code" text,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"item_price_minor" integer,
	"paid_price_minor" integer,
	"shipping_amount_minor" integer,
	"shipped_date" timestamp with time zone,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"package_key" text NOT NULL,
	"order_item_ids" jsonb NOT NULL,
	"tracking_number" text,
	"country_code" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"error_message" text,
	"pdf" "bytea",
	"pdf_sha256" text,
	"pdf_size" integer,
	"item_count" integer DEFAULT 1 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_labels" ADD CONSTRAINT "shipment_labels_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_labels" ADD CONSTRAINT "shipment_labels_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_external_idx" ON "order_items" USING btree ("order_id","external_item_id");--> statement-breakpoint
CREATE INDEX "order_items_shop_status_idx" ON "order_items" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_labels_package_key_idx" ON "shipment_labels" USING btree ("shop_id","package_key");--> statement-breakpoint
CREATE INDEX "shipment_labels_order_idx" ON "shipment_labels" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_labels_shop_status_idx" ON "shipment_labels" USING btree ("shop_id","status");