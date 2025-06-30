ALTER TABLE "shares" ADD COLUMN "workflow_state" varchar(50);--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "enhancement_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "enhancement_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "enhancement_version" integer DEFAULT 1;--> statement-breakpoint
CREATE INDEX "idx_shares_workflow_state" ON "shares" USING btree ("workflow_state");