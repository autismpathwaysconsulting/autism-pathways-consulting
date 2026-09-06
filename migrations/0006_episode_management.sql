ALTER TABLE episodes ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_episodes_active_status
ON episodes (archived_at, status, updated_at DESC);
