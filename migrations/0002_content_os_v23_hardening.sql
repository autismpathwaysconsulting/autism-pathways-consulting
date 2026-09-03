ALTER TABLE content_os_state ADD COLUMN last_action TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE content_os_state ADD COLUMN last_request_id TEXT;
ALTER TABLE content_os_state ADD COLUMN state_hash TEXT;
ALTER TABLE content_os_state ADD COLUMN restored_from_revision INTEGER
  CHECK (restored_from_revision IS NULL OR restored_from_revision >= 0);

CREATE TABLE IF NOT EXISTS content_os_revisions (
  revision INTEGER PRIMARY KEY CHECK (revision >= 0),
  schema_version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  action TEXT NOT NULL,
  request_id TEXT,
  restored_from_revision INTEGER CHECK (
    restored_from_revision IS NULL OR restored_from_revision >= 0
  ),
  state_hash TEXT NOT NULL,
  state_json TEXT NOT NULL CHECK (json_valid(state_json))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_os_revisions_request_id
ON content_os_revisions (request_id)
WHERE request_id IS NOT NULL;

INSERT INTO content_os_revisions (
  revision, schema_version, updated_at, action, request_id,
  restored_from_revision, state_hash, state_json
)
SELECT revision, schema_version, COALESCE(updated_at, CURRENT_TIMESTAMP), 'legacy', NULL,
       NULL, COALESCE(state_hash, 'legacy-unhashed'), state_json
FROM content_os_state
WHERE id = 1 AND state_json IS NOT NULL
ON CONFLICT (revision) DO NOTHING;

CREATE TRIGGER IF NOT EXISTS trg_content_os_state_revision
AFTER UPDATE OF revision, state_json ON content_os_state
WHEN NEW.revision > OLD.revision AND NEW.state_json IS NOT NULL
BEGIN
  INSERT INTO content_os_revisions (
    revision, schema_version, updated_at, action, request_id,
    restored_from_revision, state_hash, state_json
  ) VALUES (
    NEW.revision, NEW.schema_version, NEW.updated_at, NEW.last_action,
    NEW.last_request_id, NEW.restored_from_revision,
    COALESCE(NEW.state_hash, 'legacy-unhashed'), NEW.state_json
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_content_os_revisions_no_update
BEFORE UPDATE ON content_os_revisions
BEGIN
  SELECT RAISE(ABORT, 'content_os_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_os_revisions_no_delete
BEFORE DELETE ON content_os_revisions
BEGIN
  SELECT RAISE(ABORT, 'content_os_revisions is append-only');
END;

CREATE TABLE IF NOT EXISTS content_publications (
  publication_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  post_ref TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  publication_json TEXT NOT NULL CHECK (json_valid(publication_json)),
  UNIQUE (platform, post_ref)
);

CREATE TABLE IF NOT EXISTS content_analytics_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES content_publications(publication_id),
  checkpoint TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  captured_at TEXT,
  created_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  payload_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  UNIQUE (publication_id, checkpoint, revision)
);

CREATE INDEX IF NOT EXISTS idx_content_analytics_publication_checkpoint
ON content_analytics_snapshots (publication_id, checkpoint, revision DESC);

CREATE INDEX IF NOT EXISTS idx_content_analytics_created_at
ON content_analytics_snapshots (created_at);

CREATE TRIGGER IF NOT EXISTS trg_content_publications_no_update
BEFORE UPDATE ON content_publications
BEGIN
  SELECT RAISE(ABORT, 'content_publications is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_publications_no_delete
BEFORE DELETE ON content_publications
BEGIN
  SELECT RAISE(ABORT, 'content_publications is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_analytics_no_update
BEFORE UPDATE ON content_analytics_snapshots
BEGIN
  SELECT RAISE(ABORT, 'content_analytics_snapshots is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_analytics_no_delete
BEFORE DELETE ON content_analytics_snapshots
BEGIN
  SELECT RAISE(ABORT, 'content_analytics_snapshots is append-only');
END;

CREATE TABLE IF NOT EXISTS automation_deliveries (
  delivery_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'duplicate', 'rejected', 'conflict')),
  error_code TEXT,
  UNIQUE (run_id, payload_hash)
);

CREATE TABLE IF NOT EXISTS research_runs (
  run_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'no_change')),
  analytics_status TEXT NOT NULL CHECK (analytics_status IN ('available', 'stale', 'unavailable')),
  payload_hash TEXT NOT NULL,
  bundle_json TEXT NOT NULL CHECK (json_valid(bundle_json))
);

CREATE TABLE IF NOT EXISTS research_items (
  item_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES research_runs(run_id),
  item_type TEXT NOT NULL CHECK (item_type IN ('finding', 'topic')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  item_json TEXT NOT NULL CHECK (json_valid(item_json))
);

CREATE TABLE IF NOT EXISTS research_decisions (
  decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES research_items(item_id),
  decision TEXT NOT NULL CHECK (decision IN ('new', 'used', 'archived')),
  decided_at TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_research_items_run_type
ON research_items (run_id, item_type);

CREATE INDEX IF NOT EXISTS idx_research_decisions_item
ON research_decisions (item_id, decision_id DESC);

CREATE TRIGGER IF NOT EXISTS trg_automation_deliveries_no_update
BEFORE UPDATE ON automation_deliveries
BEGIN
  SELECT RAISE(ABORT, 'automation_deliveries is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_automation_deliveries_no_delete
BEFORE DELETE ON automation_deliveries
BEGIN
  SELECT RAISE(ABORT, 'automation_deliveries is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_research_runs_no_update
BEFORE UPDATE ON research_runs
BEGIN
  SELECT RAISE(ABORT, 'research_runs is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_research_runs_no_delete
BEFORE DELETE ON research_runs
BEGIN
  SELECT RAISE(ABORT, 'research_runs is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_research_items_no_update
BEFORE UPDATE ON research_items
BEGIN
  SELECT RAISE(ABORT, 'research_items is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_research_items_no_delete
BEFORE DELETE ON research_items
BEGIN
  SELECT RAISE(ABORT, 'research_items is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_research_decisions_no_update
BEFORE UPDATE ON research_decisions
BEGIN
  SELECT RAISE(ABORT, 'research_decisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_research_decisions_no_delete
BEFORE DELETE ON research_decisions
BEGIN
  SELECT RAISE(ABORT, 'research_decisions is append-only');
END;
