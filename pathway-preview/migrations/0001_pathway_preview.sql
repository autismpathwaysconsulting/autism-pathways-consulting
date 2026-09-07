PRAGMA foreign_keys = ON;

CREATE TABLE clients (
  client_id TEXT PRIMARY KEY CHECK (client_id GLOB 'DEMO-*'),
  preferred_name TEXT NOT NULL CHECK (length(preferred_name) BETWEEN 1 AND 80),
  service_name TEXT NOT NULL,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 8),
  portal_status TEXT NOT NULL CHECK (portal_status IN ('active','suspended','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE accounts (
  account_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  account_status TEXT NOT NULL CHECK (account_status IN ('active','suspended','revoked')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, client_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE RESTRICT
);

CREATE TABLE access_grants (
  grant_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','suspended','expired','revoked')),
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (account_id, client_id) REFERENCES accounts(account_id, client_id) ON DELETE RESTRICT
);
CREATE INDEX idx_access_grants_subject ON access_grants(client_id, account_id, status);

CREATE TABLE invitations (
  invitation_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('issued','recovered','accepted','expired','revoked')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  supersedes_invitation_id TEXT,
  FOREIGN KEY (grant_id) REFERENCES access_grants(grant_id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id, client_id) REFERENCES accounts(account_id, client_id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_invitation_id) REFERENCES invitations(invitation_id) ON DELETE RESTRICT
);
CREATE INDEX idx_invitations_subject ON invitations(client_id, account_id, status, expires_at);

CREATE TABLE portal_sessions (
  session_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (grant_id) REFERENCES access_grants(grant_id) ON DELETE RESTRICT,
  FOREIGN KEY (invitation_id) REFERENCES invitations(invitation_id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id, client_id) REFERENCES accounts(account_id, client_id) ON DELETE RESTRICT
);
CREATE INDEX idx_sessions_token_scope ON portal_sessions(token_hash, client_id, expires_at);

CREATE TABLE consent_acceptances (
  acceptance_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  notice_languages_json TEXT NOT NULL CHECK (json_valid(notice_languages_json)),
  accepted_at TEXT NOT NULL,
  evidence_method TEXT NOT NULL CHECK (evidence_method = 'authenticated-checkbox'),
  UNIQUE (client_id, account_id, notice_version, terms_version),
  FOREIGN KEY (account_id, client_id) REFERENCES accounts(account_id, client_id) ON DELETE RESTRICT
);
CREATE INDEX idx_consent_current ON consent_acceptances(client_id, account_id, notice_version, terms_version);

CREATE TABLE journals (
  journal_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  entry_time TEXT,
  title TEXT,
  entry_text TEXT NOT NULL CHECK (length(entry_text) BETWEEN 1 AND 1200),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (account_id, client_id) REFERENCES accounts(account_id, client_id) ON DELETE RESTRICT
);
CREATE INDEX idx_journals_projection ON journals(client_id, account_id, deleted_at, created_at DESC);

CREATE TABLE booking_links (
  booking_link_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  cal_url TEXT NOT NULL CHECK (cal_url LIKE 'https://cal.com/%'),
  status TEXT NOT NULL CHECK (status IN ('assigned','revoked','expired','used')),
  assigned_at TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (account_id, client_id) REFERENCES accounts(account_id, client_id) ON DELETE RESTRICT
);
CREATE INDEX idx_booking_links_projection ON booking_links(client_id, account_id, status, expires_at);

CREATE TABLE lifecycle_rehearsals (
  rehearsal_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  rehearsal_type TEXT NOT NULL CHECK (rehearsal_type IN ('retention','deletion')),
  mode TEXT NOT NULL CHECK (mode IN ('dry-run','execute-synthetic')),
  requested_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
);

CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('account','operator','system')),
  actor_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json))
);
CREATE INDEX idx_audit_client_sequence ON audit_events(client_id, sequence);

CREATE TRIGGER audit_events_append_only_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER audit_events_append_only_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;
