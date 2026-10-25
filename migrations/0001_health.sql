-- M0: proves the deployed Worker can read and write D1 (used by /api/health).
CREATE TABLE health_check (
  id         INTEGER PRIMARY KEY CHECK (id = 1),  -- a single row, so the table never grows
  hits       INTEGER NOT NULL,
  checked_at TEXT    NOT NULL
);
