CREATE UNIQUE INDEX IF NOT EXISTS scans_one_active_per_repo
  ON scans (repo_id)
  WHERE status IN ('pending', 'running');
