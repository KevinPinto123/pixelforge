import { describe, expect, it } from 'vitest';
import {
  CreateProjectInputSchema,
  ProjectSchema,
  JobSchema,
  problem,
  ProblemDetailsSchema,
  exportJsonSchemas,
} from '../src/index.js';

describe('contracts', () => {
  it('CreateProjectInput aplica defaults', () => {
    const parsed = CreateProjectInputSchema.parse({ name: 'vibecoder-assets' });
    expect(parsed.canvasSize).toEqual({ w: 32, h: 32 });
    expect(parsed.engineTargets).toEqual(['godot']);
  });

  it('Project valida shape completo', () => {
    const now = new Date().toISOString();
    const project = ProjectSchema.parse({
      id: 'p1',
      workspaceId: 'w1',
      name: 'demo',
      version: 1,
      defaultCanvas: { w: 16, h: 16 },
      engineTargets: ['godot'],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(project.name).toBe('demo');
  });

  it('Job rechaza estado invalido', () => {
    expect(() => JobSchema.parse({ status: 'exploded' })).toThrow();
  });

  it('problem() produce RFC7807 valido', () => {
    const p = problem(404, 'Project not found', {
      code: 'PROJECT_NOT_FOUND',
      retryable: false,
      suggestion: 'Usa list de proyectos para obtener un id valido',
    });
    expect(ProblemDetailsSchema.parse(p).status).toBe(404);
  });

  it('exporta JSON Schema de todos los contratos', () => {
    const schemas = exportJsonSchemas();
    for (const name of [
      'Project',
      'CreateProjectInput',
      'ProjectSummary',
      'Asset',
      'AssetVariant',
      'Job',
      'AcceptedJob',
      'ProblemDetails',
    ]) {
      expect(schemas[name], name).toBeDefined();
    }
  });
});
