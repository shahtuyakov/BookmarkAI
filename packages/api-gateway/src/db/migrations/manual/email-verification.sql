-- Migration: Add email verification and password reset fields
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "verification_token" text;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "verification_token_expiry" timestamp;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "reset_password_token" text;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "reset_password_token_expiry" timestamp;