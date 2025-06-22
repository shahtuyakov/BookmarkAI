CREATE TABLE IF NOT EXISTS "ml_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"result_data" jsonb,
	"model_version" varchar(100),
	"processing_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ml_results_share_task_unique" UNIQUE("share_id","task_type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ml_results" ADD CONSTRAINT "ml_results_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ml_results_share_id_idx" ON "ml_results" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ml_results_task_type_idx" ON "ml_results" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ml_results_created_at_idx" ON "ml_results" USING btree ("created_at");