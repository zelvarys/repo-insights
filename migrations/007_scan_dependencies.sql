CREATE TABLE scan_dependencies (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id            UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  ecosystem          TEXT NOT NULL,
  package_name       TEXT NOT NULL,
  current_version    TEXT NOT NULL,
  latest_version     TEXT,
  outdated           BOOLEAN NOT NULL DEFAULT FALSE,
  advisory_count     INT NOT NULL DEFAULT 0,
  max_severity       TEXT,
  registry_url       TEXT NOT NULL,
  last_checked_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, ecosystem, package_name, current_version)
);

CREATE INDEX idx_scan_dependencies_scan ON scan_dependencies(scan_id);
CREATE INDEX idx_scan_dependencies_outdated
  ON scan_dependencies(scan_id, outdated);
CREATE INDEX idx_scan_dependencies_advisory
  ON scan_dependencies(scan_id, advisory_count);
