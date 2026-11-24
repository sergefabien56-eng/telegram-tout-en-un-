CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"external_variant_id" text NOT NULL,
	"seller_sku" text,
	"barcode_ean" text,
	"variation_name" text,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"price_minor" integer,
	"sale_price_minor" integer,
	"status" text,
	"visible" boolean,
	"qc_status" text,
	"stock_global" integer,
	"stock_updated_at" timestamp with time zone,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"parent_sku" text,
	"name" text NOT NULL,
	"brand_name" text,
	"category_code" text,
	"category_name" text,
	"primary_image" text,
	"status" text,
	"qc_status" text,
	"remote_created_at" timestamp with time zone,
	"remote_updated_at" timestamp with time zone,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "variants_product_external_idx" ON "product_variants" USING btree ("product_id","external_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_shop_sku_idx" ON "product_variants" USING btree ("product_id","seller_sku");--> statement-breakpoint
CREATE INDEX "variants_stock_idx" ON "product_variants" USING btree ("stock_global");--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_external_idx" ON "products" USING btree ("shop_id","external_product_id");--> statement-breakpoint
CREATE INDEX "products_shop_status_idx" ON "products" USING btree ("shop_id","status");