-- Create index for provider lookups (if not exists)
CREATE INDEX IF NOT EXISTS "idx_users_provider_id" ON "users" USING btree ("provider", "provider_id");--> statement-breakpoint
-- Create social auth profiles table for storing additional provider data
CREATE TABLE IF NOT EXISTS "social_auth_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"email" varchar(255),
	"name" varchar(255),
	"avatar_url" text,
	"raw_data" jsonb,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_auth_profiles_provider_user_unique" UNIQUE("provider", "provider_user_id")
);--> statement-breakpoint
-- Add foreign key constraint
ALTER TABLE "social_auth_profiles" ADD CONSTRAINT "social_auth_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Create index for user lookups
CREATE INDEX IF NOT EXISTS "idx_social_auth_profiles_user_id" ON "social_auth_profiles" USING btree ("user_id");