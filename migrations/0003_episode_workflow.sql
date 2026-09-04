CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY CHECK (id GLOB 'EP[0-9][0-9]*' AND substr(id, 3) NOT GLOB '*[^0-9]*' AND length(id) BETWEEN 4 AND 6),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  source_research_item_id TEXT REFERENCES research_items(item_id),
  status TEXT NOT NULL CHECK (status IN ('IDEA', 'APPROVED', 'SCRIPT_LOCKED', 'FILMED', 'EDITING', 'REVIEW', 'READY', 'PUBLISHED')),
  production_pack_json TEXT CHECK (production_pack_json IS NULL OR json_valid(production_pack_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_reviews (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  version_label TEXT NOT NULL,
  video_sha256 TEXT NOT NULL CHECK (length(video_sha256) = 64),
  mode TEXT NOT NULL CHECK (mode IN ('full', 'delta', 'ready')),
  result TEXT NOT NULL CHECK (result IN ('PENDING', 'READY', 'NOT_READY')),
  score REAL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  reviewed_at TEXT NOT NULL,
  UNIQUE (episode_id, video_sha256, mode)
);

CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_research_item ON episodes(source_research_item_id) WHERE source_research_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_reviews_episode ON video_reviews(episode_id, reviewed_at DESC);
