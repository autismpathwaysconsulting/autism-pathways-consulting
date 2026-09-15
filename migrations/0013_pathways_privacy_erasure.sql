-- Permit privacy erasure of student-state history through ON DELETE CASCADE.
-- Revisions remain immutable while they exist, but must be removable with the
-- student's canonical record if a valid erasure request is executed.

DROP TRIGGER IF EXISTS pathways_state_revisions_no_delete;

-- Retain only pseudonymous, non-content evidence that an erasure occurred.
-- `erased_student_hash` is a one-way SHA-256 hash of the internal random student
-- id. Do not store name, school reference, year group, narrative, or student data.
CREATE TABLE IF NOT EXISTS pathways_erasure_log (
  erasure_id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT,
  erased_student_hash TEXT NOT NULL CHECK (length(erased_student_hash) = 64),
  actor_user_id TEXT REFERENCES pathways_users(user_id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS pathways_erasure_log_no_update
BEFORE UPDATE ON pathways_erasure_log
BEGIN
  SELECT RAISE(ABORT, 'pathways_erasure_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS pathways_erasure_log_no_delete
BEFORE DELETE ON pathways_erasure_log
BEGIN
  SELECT RAISE(ABORT, 'pathways_erasure_log is append-only');
END;
