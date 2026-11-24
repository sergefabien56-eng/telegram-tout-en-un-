CREATE TABLE "jumia_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"email" text,
	"client_id" text NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_token_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "jumia_account_id" uuid;--> statement-breakpoint
ALTER TABLE "jumia_accounts" ADD CONSTRAINT "jumia_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jumia_accounts_owner_idx" ON "jumia_accounts" USING btree ("owner_user_id","created_at");--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_jumia_account_id_jumia_accounts_id_fk" FOREIGN KEY ("jumia_account_id") REFERENCES "public"."jumia_accounts"("id") ON DELETE set null ON UPDATE no action;