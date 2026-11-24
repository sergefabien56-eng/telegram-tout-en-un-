CREATE TABLE "payout_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"statement_number" text NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"opening_balance_minor" integer NOT NULL,
	"item_revenue_minor" integer NOT NULL,
	"shipment_fee_minor" integer NOT NULL,
	"fees_total_minor" integer NOT NULL,
	"other_revenue_minor" integer DEFAULT 0 NOT NULL,
	"refunds_minor" integer DEFAULT 0 NOT NULL,
	"closing_balance_minor" integer NOT NULL,
	"payout_amount_minor" integer,
	"paid" boolean DEFAULT false NOT NULL,
	"payment_reference" text,
	"remote_created_at" timestamp with time zone NOT NULL,
	"remote_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_statements" ADD CONSTRAINT "payout_statements_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_statements_shop_number_idx" ON "payout_statements" USING btree ("shop_id","statement_number");--> statement-breakpoint
CREATE INDEX "payout_statements_shop_created_idx" ON "payout_statements" USING btree ("shop_id","remote_created_at");