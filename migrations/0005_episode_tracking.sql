CREATE TABLE IF NOT EXISTS episode_artifacts (
  artifact_id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('PROMPT', 'PRODUCTION_PACK')),
  version INTEGER NOT NULL CHECK (version >= 1),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  redteam_status TEXT NOT NULL CHECK (redteam_status IN ('NOT_APPLICABLE', 'PENDING', 'PASS', 'FAIL')),
  hook_gate_status TEXT CHECK (hook_gate_status IS NULL OR hook_gate_status IN ('PASS', 'REWORK', 'FAIL')),
  final_decision TEXT CHECK (final_decision IS NULL OR final_decision IN ('FILM', 'REVISE')),
  created_at TEXT NOT NULL,
  UNIQUE (episode_id, artifact_type, version),
  UNIQUE (episode_id, artifact_type, payload_sha256)
);

CREATE TABLE IF NOT EXISTS episode_events (
  event_id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'PROMPT_BUILT', 'PACK_IMPORTED', 'SCRIPT_LOCKED', 'STATUS_CHANGED',
    'VIDEO_REVIEWED', 'PUBLICATION_LINKED'
  )),
  artifact_id TEXT REFERENCES episode_artifacts(artifact_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episode_artifacts_episode
ON episode_artifacts (episode_id, artifact_type, version DESC);

CREATE INDEX IF NOT EXISTS idx_episode_events_episode
ON episode_events (episode_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_episode_artifacts_no_update
BEFORE UPDATE ON episode_artifacts
BEGIN
  SELECT RAISE(ABORT, 'episode_artifacts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_episode_artifacts_no_delete
BEFORE DELETE ON episode_artifacts
BEGIN
  SELECT RAISE(ABORT, 'episode_artifacts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_episode_events_no_update
BEFORE UPDATE ON episode_events
BEGIN
  SELECT RAISE(ABORT, 'episode_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_episode_events_no_delete
BEFORE DELETE ON episode_events
BEGIN
  SELECT RAISE(ABORT, 'episode_events is append-only');
END;
