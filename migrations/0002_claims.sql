-- M3 (REQ-CLM-04, REQ-REV-01..03, REQ-REV-07): submitted claims, their files and the reviewer's decisions.
-- Review and owner links are never stored: only their SHA-256 (a database leak does not leak links).
CREATE TABLE claims (
  id               TEXT PRIMARY KEY,
  idempotency_key  TEXT NOT NULL UNIQUE,
  review_hash      TEXT NOT NULL UNIQUE,
  owner_hash       TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'submitted',
  submitted_at     TEXT NOT NULL,
  decided_at       TEXT,
  overall_comment  TEXT,
  payload          TEXT NOT NULL,   -- JSON, checked by claimPayloadSchema
  is_sample        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE claim_files (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  file_id  TEXT NOT NULL,
  mime     TEXT NOT NULL,
  size     INTEGER NOT NULL,
  sha256   TEXT NOT NULL,
  data     BLOB NOT NULL,           -- at most 1 MB (D1 allows 2 MB per row)
  PRIMARY KEY (claim_id, file_id)
);

CREATE TABLE item_reviews (
  claim_id   TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  decision   TEXT NOT NULL,
  comment    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (claim_id, item_id)
);

-- One row per client address, action and minute.
CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  window INTEGER NOT NULL,
  hits   INTEGER NOT NULL,
  PRIMARY KEY (bucket, window)
);
