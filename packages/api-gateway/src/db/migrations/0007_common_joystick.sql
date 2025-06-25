CREATE TABLE "ml_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"result_data" jsonb NOT NULL,
	"model_version" varchar(100),
	"processing_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_share_task" UNIQUE("share_id","task_type")
);
--> statement-breakpoint
CREATE TABLE "llm_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid,
	"model_name" varchar(50) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
	"input_cost_usd" numeric(10, 6) NOT NULL,
	"output_cost_usd" numeric(10, 6) NOT NULL,
	"total_cost_usd" numeric(10, 6) GENERATED ALWAYS AS (input_cost_usd + output_cost_usd) STORED,
	"backend" varchar(20) DEFAULT 'api' NOT NULL,
	"processing_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_input_tokens_positive" CHECK (input_tokens > 0),
	CONSTRAINT "chk_output_tokens_positive" CHECK (output_tokens >= 0),
	CONSTRAINT "chk_input_cost_positive" CHECK (input_cost_usd >= 0),
	CONSTRAINT "chk_output_cost_positive" CHECK (output_cost_usd >= 0),
	CONSTRAINT "chk_backend_valid" CHECK (backend IN ('api', 'local')),
	CONSTRAINT "chk_provider_valid" CHECK (provider IN ('openai', 'anthropic', 'local'))
);
--> statement-breakpoint
ALTER TABLE "ml_results" ADD CONSTRAINT "ml_results_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_costs" ADD CONSTRAINT "llm_costs_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ml_results_share_id" ON "ml_results" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_ml_results_task_type" ON "ml_results" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "idx_ml_results_created_at" ON "ml_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_costs_created_at" ON "llm_costs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_costs_model_name" ON "llm_costs" USING btree ("model_name");--> statement-breakpoint
CREATE INDEX "idx_llm_costs_provider" ON "llm_costs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_llm_costs_backend" ON "llm_costs" USING btree ("backend");--> statement-breakpoint
CREATE INDEX "idx_llm_costs_share_id" ON "llm_costs" USING btree ("share_id");