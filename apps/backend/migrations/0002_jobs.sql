CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  provider TEXT,
  provider_job_id TEXT,
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_code TEXT,
  error_message TEXT,
  error_retryable INTEGER,
  error_suggestion TEXT,
  output_asset_variant_ids TEXT NOT NULL DEFAULT '[]',
  preview_urls TEXT NOT NULL DEFAULT '[]',
  metrics_queued_ms REAL,
  metrics_provider_ms REAL,
  metrics_post_process_ms REAL,
  metrics_total_ms REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_project ON jobs(project_id);
CREATE INDEX idx_jobs_status ON jobs(status);
