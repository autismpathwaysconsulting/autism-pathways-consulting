CREATE TABLE IF NOT EXISTS content_os_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  updated_at TEXT,
  state_json TEXT CHECK (state_json IS NULL OR json_valid(state_json))
);

INSERT INTO content_os_state (id, schema_version, revision, updated_at, state_json)
VALUES (1, '2.1', 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
