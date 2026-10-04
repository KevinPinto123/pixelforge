CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  canvas_w INTEGER NOT NULL,
  canvas_h INTEGER NOT NULL,
  engine_targets TEXT NOT NULL,
  default_palette_id TEXT,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_projects_workspace ON projects(workspace_id);
