CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"dimensions" integer DEFAULT 1536 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"platform" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shares_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "idx_shares_url_user_id" UNIQUE("url","user_id")
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"author" varchar(255),
	"title" text,
	"description" text,
	"thumbnail_url" text,
	"platform_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"full_text" text NOT NULL,
	"segments" jsonb,
	"language" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_embeddings_share_id" ON "embeddings" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_shares_user_id" ON "shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_shares_status" ON "shares" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_metadata_share_id" ON "metadata" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_metadata_platform" ON "metadata" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "idx_transcripts_share_id" ON "transcripts" USING btree ("share_id");