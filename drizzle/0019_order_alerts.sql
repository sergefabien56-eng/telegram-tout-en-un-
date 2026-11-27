ALTER TABLE "orders" ADD COLUMN "first_seen_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "order_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"priority" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "order_alert_reads" (
	"alert_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_alert_reads_alert_id_user_id_pk" PRIMARY KEY("alert_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "order_alerts" ADD CONSTRAINT "order_alerts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_alerts" ADD CONSTRAINT "order_alerts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_alert_reads" ADD CONSTRAINT "order_alert_reads_alert_id_order_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."order_alerts" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_alert_reads" ADD CONSTRAINT "order_alert_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_alerts_dedupe_key_idx" ON "order_alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "order_alerts_shop_status_idx" ON "order_alerts" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "order_alerts_order_idx" ON "order_alerts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_shop_first_seen_idx" ON "orders" USING btree ("shop_id","first_seen_at");
