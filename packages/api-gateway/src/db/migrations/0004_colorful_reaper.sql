CREATE TABLE "idempotency_records" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"endpoint" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_user_endpoint" ON "idempotency_records" USING btree ("user_id","endpoint");--> statement-breakpoint
CREATE INDEX "idx_request_hash" ON "idempotency_records" USING btree ("request_hash");--> statement-breakpoint
CREATE INDEX "idx_expires_at" ON "idempotency_records" USING btree ("expires_at");