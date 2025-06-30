-- Rollback migration to remove download queue columns
-- Run this manually if you already applied the 0011 migration

ALTER TABLE shares DROP COLUMN IF EXISTS download_status;
ALTER TABLE shares DROP COLUMN IF EXISTS download_attempts;
ALTER TABLE shares DROP COLUMN IF EXISTS download_error;
ALTER TABLE shares DROP COLUMN IF EXISTS download_started_at;
ALTER TABLE shares DROP COLUMN IF EXISTS download_completed_at;

DROP INDEX IF EXISTS idx_shares_download_queue;
DROP INDEX IF EXISTS idx_shares_download_status;