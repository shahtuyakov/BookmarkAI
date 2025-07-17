CREATE TABLE "instagram_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"reel_id" varchar(100) NOT NULL,
	"author_username" varchar(100),
	"caption" text,
	"hashtags" text[],
	"content_type" varchar(50) DEFAULT 'instagram_reel_standard' NOT NULL,
	"classification_confidence" numeric(3, 2),
	"storage_url" text,
	"storage_type" varchar(20),
	"file_size_bytes" bigint,
	"duration_seconds" integer,
	"transcript_text" text,
	"transcript_language" varchar(10) DEFAULT 'en',
	"whisper_confidence" numeric(3, 2),
	"download_time_ms" integer,
	"processing_completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_content_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
ALTER TABLE "instagram_content" ADD CONSTRAINT "instagram_content_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_instagram_content_share_id" ON "instagram_content" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_content_reel_id" ON "instagram_content" USING btree ("reel_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_content_type" ON "instagram_content" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "idx_instagram_content_created_at" ON "instagram_content" USING btree ("created_at");