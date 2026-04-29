ALTER TABLE "invoices" ADD COLUMN "public_token" varchar(40);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_public_token_unique" UNIQUE("public_token");