ALTER TABLE "users" ADD COLUMN "role" varchar(50) NOT NULL DEFAULT 'user';
ALTER TABLE "users" ADD COLUMN "refresh_hash" text;
ALTER TABLE "users" ADD COLUMN "refresh_family_id" uuid;
ALTER TABLE "users" ADD COLUMN "last_login" timestamp;
ALTER TABLE "users" ADD COLUMN "failed_attempts" integer DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "failed_attempts_reset_at" timestamp;
ALTER TABLE "users" ADD COLUMN "active" boolean NOT NULL DEFAULT true;