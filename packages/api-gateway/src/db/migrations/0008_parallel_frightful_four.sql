CREATE TABLE "vector_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid,
	"model" varchar(50) NOT NULL,
	"input_tokens" integer NOT NULL,
	"chunks_generated" integer DEFAULT 1 NOT NULL,
	"total_cost" numeric(10, 6) NOT NULL,
	"cost_per_token" numeric(12, 10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_input_tokens_positive" CHECK ("vector_costs"."input_tokens" > 0),
	CONSTRAINT "chk_chunks_positive" CHECK ("vector_costs"."chunks_generated" > 0),
	CONSTRAINT "chk_cost_positive" CHECK ("vector_costs"."total_cost" >= 0),
	CONSTRAINT "chk_cost_per_token_positive" CHECK ("vector_costs"."cost_per_token" >= 0),
	CONSTRAINT "chk_model_valid" CHECK ("vector_costs"."model" IN ('text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'))
);
--> statement-breakpoint
ALTER TABLE "vector_costs" ADD CONSTRAINT "vector_costs_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vector_costs_created_at" ON "vector_costs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_vector_costs_model" ON "vector_costs" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_vector_costs_share_id" ON "vector_costs" USING btree ("share_id");