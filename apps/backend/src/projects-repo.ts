import type { Project } from '@pixelforge/contracts';
import type { DatabaseSync } from 'node:sqlite';

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  version: number;
  canvas_w: number;
  canvas_h: number;
  engine_targets: string;
  default_palette_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    version: row.version,
    defaultCanvas: { w: row.canvas_w, h: row.canvas_h },
    engineTargets: JSON.parse(row.engine_targets) as Project['engineTargets'],
    ...(row.default_palette_id ? { defaultPaletteId: row.default_palette_id } : {}),
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectsRepo {
  constructor(private readonly db: DatabaseSync) {}

  insert(project: Project): void {
    this.db
      .prepare(
        `INSERT INTO projects
          (id, workspace_id, name, version, canvas_w, canvas_h, engine_targets, default_palette_id, metadata, created_at, updated_at)
         VALUES (@id, @workspaceId, @name, @version, @canvasW, @canvasH, @engineTargets, @defaultPaletteId, @metadata, @createdAt, @updatedAt)`,
      )
      .run({
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        version: project.version,
        canvasW: project.defaultCanvas.w,
        canvasH: project.defaultCanvas.h,
        engineTargets: JSON.stringify(project.engineTargets),
        defaultPaletteId: project.defaultPaletteId ?? null,
        metadata: JSON.stringify(project.metadata),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
  }

  findById(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined;
    return row ? rowToProject(row) : undefined;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as n FROM projects').get() as { n: number };
    return row.n;
  }
}
