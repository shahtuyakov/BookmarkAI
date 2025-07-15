CREATE TABLE "youtube_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_content_id" uuid NOT NULL,
	"share_id" uuid NOT NULL,
	"start_seconds" integer NOT NULL,
	"end_seconds" integer,
	"title" varchar(500),
	"summary" text,
	"transcript_segment" text,
	"key_points" text[],
	"embedding" vector(1536),
	"search_keywords" text[],
	"chapter_order" integer,
	"duration_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_valid_chapter_timing" CHECK ("youtube_chapters"."end_seconds" > "youtube_chapters"."start_seconds" OR "youtube_chapters"."end_seconds" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "youtube_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"youtube_id" varchar(20) NOT NULL,
	"channel_id" varchar(50),
	"channel_title" varchar(255),
	"duration_seconds" integer,
	"view_count" bigint,
	"like_count" bigint,
	"comment_count" bigint,
	"content_type" varchar(50) NOT NULL,
	"processing_priority" integer DEFAULT 5,
	"has_captions" boolean DEFAULT false,
	"is_short" boolean DEFAULT false,
	"is_live" boolean DEFAULT false,
	"is_music" boolean DEFAULT false,
	"content_rating" varchar(20),
	"privacy_status" varchar(20),
	"published_at" timestamp,
	"tags" text[],
	"download_strategy" varchar(20),
	"transcription_strategy" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_content_youtube_id_unique" UNIQUE("youtube_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_enhancements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"youtube_content_id" uuid NOT NULL,
	"phase1_completed_at" timestamp,
	"phase2_started_at" timestamp,
	"phase2_completed_at" timestamp,
	"download_status" varchar(50) DEFAULT 'pending',
	"download_file_path" text,
	"download_file_size" integer,
	"transcription_status" varchar(50) DEFAULT 'pending',
	"transcription_source" varchar(20),
	"transcription_language" varchar(10),
	"transcription_confidence" numeric(4, 3),
	"summary_status" varchar(50) DEFAULT 'pending',
	"summary_length" integer,
	"summary_complexity" varchar(20),
	"embedding_status" varchar(50) DEFAULT 'pending',
	"embeddings_count" integer DEFAULT 0,
	"chapters_count" integer DEFAULT 0,
	"error_details" jsonb,
	"retry_count" integer DEFAULT 0,
	"last_retry_at" timestamp,
	"total_processing_time_seconds" integer,
	"download_time_seconds" integer,
	"transcription_time_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"videos_list_calls" integer DEFAULT 0,
	"captions_list_calls" integer DEFAULT 0,
	"captions_download_calls" integer DEFAULT 0,
	"channels_list_calls" integer DEFAULT 0,
	"search_list_calls" integer DEFAULT 0,
	"total_quota_used" integer DEFAULT 0,
	"quota_limit" integer DEFAULT 10000,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_youtube_quota_date" UNIQUE("date")
);
--> statement-breakpoint
DROP INDEX "idx_shares_download_queue";--> statement-breakpoint
DROP INDEX "idx_shares_download_status";--> statement-breakpoint
ALTER TABLE "youtube_chapters" ADD CONSTRAINT "youtube_chapters_youtube_content_id_youtube_content_id_fk" FOREIGN KEY ("youtube_content_id") REFERENCES "public"."youtube_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_chapters" ADD CONSTRAINT "youtube_chapters_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_content" ADD CONSTRAINT "youtube_content_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_enhancements" ADD CONSTRAINT "youtube_enhancements_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_enhancements" ADD CONSTRAINT "youtube_enhancements_youtube_content_id_youtube_content_id_fk" FOREIGN KEY ("youtube_content_id") REFERENCES "public"."youtube_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_youtube_chapters_share" ON "youtube_chapters" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_chapters_content" ON "youtube_chapters" USING btree ("youtube_content_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_chapters_timing" ON "youtube_chapters" USING btree ("start_seconds","end_seconds");--> statement-breakpoint
CREATE INDEX "idx_youtube_chapters_timing_order" ON "youtube_chapters" USING btree ("youtube_content_id","start_seconds","chapter_order");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_share_id" ON "youtube_content" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_youtube_id" ON "youtube_content" USING btree ("youtube_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_channel" ON "youtube_content" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_type" ON "youtube_content" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_priority" ON "youtube_content" USING btree ("processing_priority");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_published" ON "youtube_content" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_youtube_content_type_priority" ON "youtube_content" USING btree ("content_type","processing_priority");--> statement-breakpoint
CREATE INDEX "idx_youtube_enhancements_share" ON "youtube_enhancements" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_enhancements_pending" ON "youtube_enhancements" USING btree ("phase2_started_at") WHERE phase2_completed_at IS NULL AND phase2_started_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_youtube_enhancements_failed" ON "youtube_enhancements" USING btree ("download_status","transcription_status","summary_status") WHERE download_status = 'failed' OR transcription_status = 'failed' OR summary_status = 'failed';--> statement-breakpoint
CREATE INDEX "idx_youtube_quota_date" ON "youtube_quota_usage" USING btree ("date");--> statement-breakpoint
ALTER TABLE "shares" DROP COLUMN "download_status";--> statement-breakpoint
ALTER TABLE "shares" DROP COLUMN "download_attempts";--> statement-breakpoint
ALTER TABLE "shares" DROP COLUMN "download_error";--> statement-breakpoint
ALTER TABLE "shares" DROP COLUMN "download_started_at";--> statement-breakpoint
ALTER TABLE "shares" DROP COLUMN "download_completed_at";