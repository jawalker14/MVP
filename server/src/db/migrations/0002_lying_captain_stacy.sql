TRUNCATE "refresh_tokens";--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "token_id" varchar(40) NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_id_unique" UNIQUE("token_id");