-- Flags from readers: a fact marked for review. Nothing personal is stored.
CREATE TABLE flags (
  id TEXT PRIMARY KEY,
  record_kind TEXT NOT NULL CHECK (record_kind IN ('node', 'edge')),
  record_id TEXT NOT NULL,
  record_label TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('incorrect', 'outdated', 'unsupported', 'duplicate', 'other')),
  note TEXT,
  source_url TEXT,
  page_url TEXT NOT NULL,
  app_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX flags_open ON flags (resolved_at, created_at);
