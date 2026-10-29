CREATE TABLE scan_ci_runs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id            UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  run_id             BIGINT NOT NULL,
  workflow_name      TEXT NOT NULL,
  status             TEXT NOT NULL,
  conclusion         TEXT,
  branch             TEXT,
  actor              TEXT,
  url                TEXT,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  duration_seconds   INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, run_id)
);

CREATE INDEX idx_scan_ci_runs_scan ON scan_ci_runs(scan_id, started_at DESC);
CREATE INDEX idx_scan_ci_runs_workflow ON scan_ci_runs(scan_id, workflow_name);
CREATE INDEX idx_scan_ci_runs_branch ON scan_ci_runs(scan_id, branch);
