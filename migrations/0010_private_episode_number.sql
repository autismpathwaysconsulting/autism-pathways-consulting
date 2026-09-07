ALTER TABLE episodes ADD COLUMN display_number INTEGER
CHECK (display_number IS NULL OR (display_number BETWEEN 1 AND 9999));

CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_active_display_number
ON episodes (COALESCE(display_number, CAST(SUBSTR(id, 3) AS INTEGER)))
WHERE archived_at IS NULL;
