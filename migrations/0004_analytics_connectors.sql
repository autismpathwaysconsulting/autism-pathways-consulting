CREATE TABLE IF NOT EXISTS content_analytics_connections (
  connection_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'tiktok', 'youtube')),
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_expires_at TEXT,
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  status TEXT NOT NULL CHECK (status IN ('active', 'reconnect_required', 'disconnected')),
  last_refreshed_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, account_id)
);

CREATE TABLE IF NOT EXISTS content_oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'tiktok', 'youtube')),
  pkce_verifier_ciphertext TEXT,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_oauth_states_expiry
ON content_oauth_states (expires_at, used_at);

CREATE TABLE IF NOT EXISTS content_analytics_publication_links (
  link_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES content_publications(publication_id),
  connection_id TEXT NOT NULL REFERENCES content_analytics_connections(connection_id),
  remote_media_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'disconnected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (publication_id),
  UNIQUE (connection_id, remote_media_id)
);

CREATE TABLE IF NOT EXISTS content_analytics_checkpoint_jobs (
  job_id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES content_analytics_publication_links(link_id),
  publication_id TEXT NOT NULL REFERENCES content_publications(publication_id),
  checkpoint TEXT NOT NULL CHECK (checkpoint IN ('24h', '7d', '28d')),
  due_at TEXT NOT NULL,
  window_ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'retry', 'completed', 'skipped', 'missed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  completed_at TEXT,
  snapshot_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (publication_id, checkpoint)
);

CREATE INDEX IF NOT EXISTS idx_content_checkpoint_jobs_due
ON content_analytics_checkpoint_jobs (status, due_at, next_attempt_at);

CREATE TABLE IF NOT EXISTS content_analytics_ingestion_runs (
  run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES content_analytics_checkpoint_jobs(job_id),
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'tiktok', 'youtube')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('saved', 'already_present', 'retry', 'failed', 'missed')),
  http_status INTEGER,
  error_code TEXT,
  details_json TEXT NOT NULL CHECK (json_valid(details_json))
);

CREATE INDEX IF NOT EXISTS idx_content_ingestion_runs_job
ON content_analytics_ingestion_runs (job_id, started_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_content_ingestion_runs_no_update
BEFORE UPDATE ON content_analytics_ingestion_runs
BEGIN
  SELECT RAISE(ABORT, 'content_analytics_ingestion_runs is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_ingestion_runs_no_delete
BEFORE DELETE ON content_analytics_ingestion_runs
BEGIN
  SELECT RAISE(ABORT, 'content_analytics_ingestion_runs is append-only');
END;
