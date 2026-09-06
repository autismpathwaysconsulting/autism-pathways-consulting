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

UPDATE practice_sessions
SET journey_stage = CASE session_number
  WHEN 1 THEN 'PRE_SESSION_1'
  WHEN 2 THEN 'SESSION_1'
  ELSE NULL
END
WHERE journey_stage IS NULL;

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
