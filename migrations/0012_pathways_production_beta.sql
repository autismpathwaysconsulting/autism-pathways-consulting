-- Pathways production-style beta schema.
-- Uses the existing APC D1 database binding for the first design-partner beta.
-- Pathways tables are isolated by the pathways_ prefix so they can be moved to a
-- dedicated database later without changing the application data model.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pathways_organizations (
  organization_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pathways_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 160000 CHECK (password_iterations >= 100000),
  is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pathways_memberships (
  membership_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pathways_organizations(organization_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES pathways_users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','senco','support','viewer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS pathways_students (
  student_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pathways_organizations(organization_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  external_ref TEXT,
  year_group TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS pathways_student_assignments (
  assignment_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pathways_organizations(organization_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES pathways_students(student_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES pathways_users(user_id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('read','edit')),
  created_at TEXT NOT NULL,
  UNIQUE (student_id, user_id)
);

CREATE TABLE IF NOT EXISTS pathways_consents (
  consent_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pathways_organizations(organization_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES pathways_students(student_id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('pilot-use','school-record','family-sharing','research-secondary-use')),
  status TEXT NOT NULL CHECK (status IN ('granted','declined','withdrawn','expired','not-required')),
  authority_label TEXT,
  reference_note TEXT,
  granted_at TEXT,
  expires_at TEXT,
  created_by TEXT REFERENCES pathways_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pathways_student_state (
  student_id TEXT PRIMARY KEY REFERENCES pathways_students(student_id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL CHECK (length(state_hash) = 64),
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES pathways_users(user_id) ON DELETE SET NULL,
  last_action TEXT NOT NULL DEFAULT 'create',
  last_request_id TEXT
);

CREATE TABLE IF NOT EXISTS pathways_state_revisions (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL REFERENCES pathways_organizations(organization_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES pathways_students(student_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  schema_version TEXT NOT NULL,
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL CHECK (length(state_hash) = 64),
  action TEXT NOT NULL,
  request_id TEXT,
  actor_user_id TEXT REFERENCES pathways_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (student_id, revision),
  UNIQUE (student_id, request_id)
);

CREATE TABLE IF NOT EXISTS pathways_sessions (
  session_hash TEXT PRIMARY KEY CHECK (length(session_hash) = 64),
  user_id TEXT NOT NULL REFERENCES pathways_users(user_id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pathways_audit_log (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT REFERENCES pathways_organizations(organization_id) ON DELETE SET NULL,
  student_id TEXT REFERENCES pathways_students(student_id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES pathways_users(user_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pathways_memberships_user_idx
  ON pathways_memberships(user_id, is_active);
CREATE INDEX IF NOT EXISTS pathways_memberships_org_idx
  ON pathways_memberships(organization_id, role, is_active);
CREATE INDEX IF NOT EXISTS pathways_students_org_idx
  ON pathways_students(organization_id, status, display_name);
CREATE INDEX IF NOT EXISTS pathways_assignments_user_idx
  ON pathways_student_assignments(user_id, student_id);
CREATE INDEX IF NOT EXISTS pathways_consents_student_idx
  ON pathways_consents(student_id, consent_type, status);
CREATE INDEX IF NOT EXISTS pathways_revisions_student_idx
  ON pathways_state_revisions(student_id, revision DESC);
CREATE INDEX IF NOT EXISTS pathways_sessions_user_idx
  ON pathways_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS pathways_audit_org_time_idx
  ON pathways_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pathways_audit_student_time_idx
  ON pathways_audit_log(student_id, created_at DESC);

-- Revision and audit history are append-only.
CREATE TRIGGER IF NOT EXISTS pathways_state_revisions_no_update
BEFORE UPDATE ON pathways_state_revisions
BEGIN
  SELECT RAISE(ABORT, 'pathways_state_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS pathways_state_revisions_no_delete
BEFORE DELETE ON pathways_state_revisions
BEGIN
  SELECT RAISE(ABORT, 'pathways_state_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS pathways_audit_log_no_update
BEFORE UPDATE ON pathways_audit_log
BEGIN
  SELECT RAISE(ABORT, 'pathways_audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS pathways_audit_log_no_delete
BEFORE DELETE ON pathways_audit_log
BEGIN
  SELECT RAISE(ABORT, 'pathways_audit_log is append-only');
END;
