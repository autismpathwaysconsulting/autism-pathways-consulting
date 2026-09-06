-- Legacy generic sessions cannot be classified as pre-session, paid-session or
-- post-session records without a human decision. Fail closed instead of
-- silently relabelling them. The approved production rollout verified this
-- table was empty before applying the migration.
CREATE TABLE practice_journey_migration_guard (
  marker INTEGER NOT NULL CHECK (marker = 0)
);

INSERT INTO practice_journey_migration_guard (marker)
SELECT 1 FROM practice_sessions LIMIT 1;

DROP TABLE practice_journey_migration_guard;

ALTER TABLE practice_sessions
ADD COLUMN journey_stage TEXT CHECK (
  journey_stage IS NULL OR journey_stage IN (
    'PRE_SESSION_1', 'SESSION_1', 'POST_SESSION_1', 'SESSION_2', 'SESSION_3', 'SESSION_4', 'POST_SESSION_4'
  )
);

ALTER TABLE practice_sessions
ADD COLUMN template_answers TEXT NOT NULL DEFAULT '' CHECK (length(template_answers) <= 30000);

ALTER TABLE practice_sessions
ADD COLUMN parent_materials TEXT NOT NULL DEFAULT '' CHECK (length(parent_materials) <= 10000);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_sessions_journey_stage
ON practice_sessions (case_id, journey_stage)
WHERE journey_stage IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_practice_session_journey_order_insert
BEFORE INSERT ON practice_sessions
WHEN NEW.journey_stage IS NULL OR NEW.session_number != CASE NEW.journey_stage
  WHEN 'PRE_SESSION_1' THEN 1
  WHEN 'SESSION_1' THEN 2
  WHEN 'POST_SESSION_1' THEN 3
  WHEN 'SESSION_2' THEN 3
  WHEN 'SESSION_3' THEN 4
  WHEN 'SESSION_4' THEN 5
  WHEN 'POST_SESSION_4' THEN 6
END
BEGIN
  SELECT RAISE(ABORT, 'practice journey stage order mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_practice_session_journey_order_update
BEFORE UPDATE OF journey_stage, session_number ON practice_sessions
WHEN NEW.journey_stage IS NULL OR NEW.session_number != CASE NEW.journey_stage
  WHEN 'PRE_SESSION_1' THEN 1
  WHEN 'SESSION_1' THEN 2
  WHEN 'POST_SESSION_1' THEN 3
  WHEN 'SESSION_2' THEN 3
  WHEN 'SESSION_3' THEN 4
  WHEN 'SESSION_4' THEN 5
  WHEN 'POST_SESSION_4' THEN 6
END
BEGIN
  SELECT RAISE(ABORT, 'practice journey stage order mismatch');
END;
