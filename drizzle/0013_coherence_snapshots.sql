CREATE TABLE "coherence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"day" text NOT NULL,
	"status" text NOT NULL,
	"local_products" integer DEFAULT 0 NOT NULL,
	"local_orders" integer DEFAULT 0 NOT NULL,
	"local_statements" integer DEFAULT 0 NOT NULL,
	"remote_products" integer,
	"remote_orders" integer,
	"remote_statements" integer,
	"revenue_minor" integer,
	"remote_revenue_minor" integer,
	"net_minor" integer,
	"remote_net_minor" integer,
	"orders_amount_minor" integer,
	"remote_orders_amount_minor" integer,
	"anomalies" integer DEFAULT 0 NOT NULL,
	"anomaly_codes" jsonb,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coherence_snapshots" ADD CONSTRAINT "coherence_snapshots_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coherence_snapshots_shop_day_idx" ON "coherence_snapshots" USING btree ("shop_id","day");--> statement-breakpoint
CREATE INDEX "coherence_snapshots_shop_checked_idx" ON "coherence_snapshots" USING btree ("shop_id","checked_at");