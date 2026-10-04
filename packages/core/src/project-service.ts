import type { CreateProjectInput, Project } from '@pixelforge/contracts';
import { newId, nowIso } from './ids.js';

export const DEFAULT_WORKSPACE_ID = 'ws-default';

/** Construye la entidad Project a partir del input validado. Puro: sin IO. */
export function buildProject(input: CreateProjectInput, workspaceId = DEFAULT_WORKSPACE_ID): Project {
  const now = nowIso();
  return {
    id: newId(),
    workspaceId,
    name: input.name,
    version: 1,
    defaultCanvas: input.canvasSize,
    engineTargets: input.engineTargets,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
}
