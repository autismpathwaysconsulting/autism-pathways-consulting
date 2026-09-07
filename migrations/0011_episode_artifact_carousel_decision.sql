-- D1 enforces foreign keys inside migrations. Defer validation while the
-- episode_artifacts table is rebuilt to widen its final-decision constraint.
PRAGMA defer_foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_episode_artifacts_no_update;
DROP TRIGGER IF EXISTS trg_episode_artifacts_no_delete;

CREATE TABLE episode_artifacts_next (
  artifact_id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('PROMPT', 'PRODUCTION_PACK')),
  version INTEGER NOT NULL CHECK (version >= 1),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  redteam_status TEXT NOT NULL CHECK (redteam_status IN ('NOT_APPLICABLE', 'PENDING', 'PASS', 'FAIL')),
  hook_gate_status TEXT CHECK (hook_gate_status IS NULL OR hook_gate_status IN ('PASS', 'REWORK', 'FAIL')),
  final_decision TEXT CHECK (final_decision IS NULL OR final_decision IN ('FILM', 'PRODUCE', 'REVISE')),
  created_at TEXT NOT NULL,
  UNIQUE (episode_id, artifact_type, version),
  UNIQUE (episode_id, artifact_type, payload_sha256)
);

INSERT INTO episode_artifacts_next (
  artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json,
  redteam_status, hook_gate_status, final_decision, created_at
)
SELECT
  artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json,
  redteam_status, hook_gate_status, final_decision, created_at
FROM episode_artifacts;

DROP TABLE episode_artifacts;
ALTER TABLE episode_artifacts_next RENAME TO episode_artifacts;

CREATE INDEX idx_episode_artifacts_episode
ON episode_artifacts (episode_id, artifact_type, version DESC);

CREATE TRIGGER trg_episode_artifacts_no_update
BEFORE UPDATE ON episode_artifacts
BEGIN
  SELECT RAISE(ABORT, 'episode_artifacts is append-only');
END;

CREATE TRIGGER trg_episode_artifacts_no_delete
BEFORE DELETE ON episode_artifacts
BEGIN
  SELECT RAISE(ABORT, 'episode_artifacts is append-only');
END;

-- Existing active packages predate prompt binding. Preserve every record and
-- add the current prompt hash so the stricter gate remains backward-compatible.
UPDATE episodes
SET production_pack_json = json_set(
  production_pack_json,
  '$.latestPackage.promptSha256',
  json_extract(production_pack_json, '$.prompt.sha256')
)
WHERE production_pack_json IS NOT NULL
  AND json_type(production_pack_json, '$.latestPackage') = 'object'
  AND json_type(production_pack_json, '$.prompt.sha256') = 'text'
  AND json_type(production_pack_json, '$.latestPackage.promptSha256') IS NULL;

PRAGMA defer_foreign_keys = OFF;
