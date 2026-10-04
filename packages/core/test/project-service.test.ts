import { describe, expect, it } from 'vitest';
import { ProjectSchema, CreateProjectInputSchema } from '@pixelforge/contracts';
import { buildProject, newId } from '../src/index.js';

describe('core', () => {
  it('newId genera ids unicos', () => {
    expect(newId()).not.toBe(newId());
  });

  it('buildProject produce Project valido segun contrato', () => {
    const input = CreateProjectInputSchema.parse({ name: 'npc-pack' });
    const project = buildProject(input);
    expect(() => ProjectSchema.parse(project)).not.toThrow();
    expect(project.version).toBe(1);
    expect(project.engineTargets).toEqual(['godot']);
  });
});
