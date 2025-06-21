ALTER TABLE "shares" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "author" varchar(255);--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "media_type" varchar(50);--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "platform_data" jsonb;