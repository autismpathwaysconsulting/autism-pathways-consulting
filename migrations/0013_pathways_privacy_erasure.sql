-- Permit privacy erasure of student-state history only through the explicit
-- erasure transaction. Revision rows remain database-level append-only for all
-- other application paths.

DROP TRIGGER IF EXISTS pathways_state_revisions_no_delete;

CREATE TABLE IF NOT EXISTS pathways_erasure_guard (
  student_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS pathways_state_revisions_no_delete
BEFORE DELETE ON pathways_state_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM pathways_erasure_guard g WHERE g.student_id = OLD.student_id
)
BEGIN
  SELECT RAISE(ABORT, 'pathways_state_revisions is append-only');
END;

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
