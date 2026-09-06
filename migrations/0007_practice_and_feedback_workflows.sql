CREATE TABLE IF NOT EXISTS practice_clients (
  case_id TEXT PRIMARY KEY CHECK (case_id GLOB 'CASE-[0-9][0-9][0-9][0-9]-[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  child_age INTEGER CHECK (child_age IS NULL OR child_age BETWEEN 0 AND 25),
  region TEXT NOT NULL CHECK (length(region) BETWEEN 1 AND 200),
  concern TEXT NOT NULL CHECK (length(concern) BETWEEN 1 AND 4000),
  stage TEXT NOT NULL CHECK (stage IN (
    'RECORD_REVIEW_REQUIRED', 'FIT_REVIEW', 'APPROVED_TO_PAY',
    'PAYMENT_PROOF_RECEIVED', 'PAYMENT_VERIFIED', 'BOOKED', 'PREPARATION',
    'SESSION_READY', 'IN_SESSION', 'DOCUMENTATION_DRAFT', 'CJ_APPROVED',
    'DELIVERED', 'COMPLETE', 'REFERRED', 'CANCELLED', 'PAUSED'
  )),
  service_code TEXT NOT NULL CHECK (service_code IN ('TBD', 'RM350', 'RM1800', 'CUSTOM')),
  next_action TEXT NOT NULL CHECK (length(next_action) BETWEEN 1 AND 4000),
  source_status TEXT NOT NULL CHECK (source_status IN ('UNVERIFIED', 'PARENT_REPORTED', 'CJ_VERIFIED')),
  known_facts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(known_facts_json)),
  open_questions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(open_questions_json)),
  boundary_flags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(boundary_flags_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_practice_clients_active
ON practice_clients (archived_at, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS practice_client_revisions (
  revision_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES practice_clients(case_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'ARCHIVED', 'RESTORED')),
  actor TEXT NOT NULL CHECK (actor = 'CJ'),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  UNIQUE (case_id, revision)
);

CREATE TRIGGER IF NOT EXISTS trg_practice_client_revisions_no_update
BEFORE UPDATE ON practice_client_revisions
BEGIN
  SELECT RAISE(ABORT, 'practice_client_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_practice_client_revisions_no_delete
BEFORE DELETE ON practice_client_revisions
BEGIN
  SELECT RAISE(ABORT, 'practice_client_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_practice_client_revision_matches_current
BEFORE INSERT ON practice_client_revisions
WHEN NEW.revision != (SELECT revision FROM practice_clients WHERE case_id = NEW.case_id)
BEGIN
  SELECT RAISE(ABORT, 'practice client revision conflict');
END;

CREATE TABLE IF NOT EXISTS practice_sessions (
  session_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES practice_clients(case_id),
  session_number INTEGER NOT NULL CHECK (session_number BETWEEN 1 AND 12),
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'READY', 'IN_SESSION', 'DOCUMENTATION_DRAFT', 'CJ_APPROVED', 'DELIVERED', 'COMPLETE', 'CANCELLED')),
  scheduled_at TEXT,
  occurred_at TEXT,
  preparation TEXT NOT NULL DEFAULT '' CHECK (length(preparation) <= 10000),
  private_notes TEXT NOT NULL DEFAULT '' CHECK (length(private_notes) <= 30000),
  parent_summary TEXT NOT NULL DEFAULT '' CHECK (length(parent_summary) <= 20000),
  action_plan TEXT NOT NULL DEFAULT '' CHECK (length(action_plan) <= 20000),
  document_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (document_status IN ('DRAFT', 'CJ_APPROVED', 'EXPORTED', 'DELIVERED', 'SUPERSEDED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (case_id, session_number)
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_case
ON practice_sessions (case_id, session_number);

CREATE TABLE IF NOT EXISTS practice_session_revisions (
  revision_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(session_id),
  case_id TEXT NOT NULL REFERENCES practice_clients(case_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'APPROVED', 'DELIVERED')),
  actor TEXT NOT NULL CHECK (actor = 'CJ'),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  UNIQUE (session_id, revision)
);

CREATE TRIGGER IF NOT EXISTS trg_practice_session_revisions_no_update
BEFORE UPDATE ON practice_session_revisions
BEGIN
  SELECT RAISE(ABORT, 'practice_session_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_practice_session_revisions_no_delete
BEFORE DELETE ON practice_session_revisions
BEGIN
  SELECT RAISE(ABORT, 'practice_session_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_practice_session_revision_matches_current
BEFORE INSERT ON practice_session_revisions
WHEN NEW.revision != (SELECT revision FROM practice_sessions WHERE session_id = NEW.session_id)
BEGIN
  SELECT RAISE(ABORT, 'practice session revision conflict');
END;

CREATE TABLE IF NOT EXISTS practice_exports (
  export_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES practice_clients(case_id),
  session_id TEXT NOT NULL REFERENCES practice_sessions(session_id),
  document_type TEXT NOT NULL CHECK (document_type IN ('MEETING_SUMMARY', 'ACTION_PLAN', 'FOLLOW_THROUGH_PACK')),
  document_version INTEGER NOT NULL CHECK (document_version >= 1),
  destination TEXT NOT NULL CHECK (destination IN ('LOCAL', 'PRIVATE_CLOUD', 'GOOGLE_DRIVE')),
  filename TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 240),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  provider_file_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'SAVED', 'FAILED', 'SUPERSEDED', 'DELETED')),
  created_at TEXT NOT NULL,
  UNIQUE (session_id, document_type, document_version, destination)
);

CREATE INDEX IF NOT EXISTS idx_practice_exports_case
ON practice_exports (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS calm_feedback_triage (
  feedback_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('NEW', 'REVIEWED', 'ACTION_NEEDED', 'IMPLEMENTED', 'ARCHIVED')),
  decision_note TEXT NOT NULL DEFAULT '' CHECK (length(decision_note) <= 2000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calm_feedback_triage_events (
  event_id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NEW', 'REVIEWED', 'ACTION_NEEDED', 'IMPLEMENTED', 'ARCHIVED')),
  decision_note TEXT NOT NULL DEFAULT '' CHECK (length(decision_note) <= 2000),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  actor TEXT NOT NULL CHECK (actor = 'CJ'),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calm_feedback_triage_events
ON calm_feedback_triage_events (feedback_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_calm_feedback_triage_events_no_update
BEFORE UPDATE ON calm_feedback_triage_events
BEGIN
  SELECT RAISE(ABORT, 'calm_feedback_triage_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_calm_feedback_triage_events_no_delete
BEFORE DELETE ON calm_feedback_triage_events
BEGIN
  SELECT RAISE(ABORT, 'calm_feedback_triage_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_calm_feedback_triage_event_matches_current
BEFORE INSERT ON calm_feedback_triage_events
WHEN NEW.revision != (SELECT revision FROM calm_feedback_triage WHERE feedback_id = NEW.feedback_id)
BEGIN
  SELECT RAISE(ABORT, 'calm feedback triage revision conflict');
END;
