import { z } from 'zod';
import { CanvasSizeSchema, EngineTargetSchema, IdSchema, TimestampsSchema } from './primitives.js';

export const ProjectSchema = TimestampsSchema.extend({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string().min(1).max(120),
  version: z.number().int().min(1),
  defaultCanvas: CanvasSizeSchema,
  engineTargets: z.array(EngineTargetSchema),
  defaultPaletteId: IdSchema.optional(),
  metadata: z.record(z.unknown()),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(120),
  canvasSize: CanvasSizeSchema.default({ w: 32, h: 32 }),
  engineTargets: z.array(EngineTargetSchema).default(['godot']),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const ProjectSummarySchema = z.object({
  project: ProjectSchema,
  counts: z.object({
    assets: z.number().int().min(0),
    activeJobs: z.number().int().min(0),
    palettes: z.number().int().min(0),
  }),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
