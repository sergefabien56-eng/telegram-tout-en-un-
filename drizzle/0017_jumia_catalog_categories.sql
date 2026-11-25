CREATE TABLE "jumia_catalog_categories" (
	"shop_id" uuid NOT NULL,
	"code" integer NOT NULL,
	"name" text NOT NULL,
	"complete_path" text NOT NULL,
	"has_children" boolean DEFAULT false NOT NULL,
	"attribute_set_sid" text,
	"attribute_set_name" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jumia_catalog_categories_shop_id_code_pk" PRIMARY KEY("shop_id","code")
);
--> statement-breakpoint
ALTER TABLE "jumia_catalog_categories" ADD CONSTRAINT "jumia_catalog_categories_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jumia_catalog_categories_path_idx" ON "jumia_catalog_categories" USING btree ("shop_id","complete_path");