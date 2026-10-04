import { z } from 'zod';
import {
  AnimationActionSchema,
  CanvasSizeSchema,
  DirectionSchema,
  IdSchema,
  TimestampsSchema,
} from './primitives.js';

export const AssetKindSchema = z.enum([
  'character',
  'animation',
  'tileset_topdown',
  'tileset_side',
  'tileset_iso',
  'spritesheet',
  'misc',
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = TimestampsSchema.extend({
  id: IdSchema,
  projectId: IdSchema,
  kind: AssetKindSchema,
  name: z.string().min(1).max(120),
  currentVariantId: IdSchema,
  tags: z.array(z.string()),
  metadata: z
    .object({
      size: CanvasSizeSchema.optional(),
      directions: z.array(DirectionSchema).optional(),
      actions: z.array(AnimationActionSchema).optional(),
    })
    .catchall(z.unknown()),
});
export type Asset = z.infer<typeof AssetSchema>;

export const AssetVariantSchema = TimestampsSchema.extend({
  id: IdSchema,
  assetId: IdSchema,
  version: z.number().int().min(1),
  blobHash: z.string().length(64),
  previewHashes: z.object({ x1: z.string().length(64), x4: z.string().length(64) }),
  origin: z.enum(['generated', 'edited', 'imported']),
  jobId: IdSchema.optional(),
  sourceDocumentId: IdSchema.optional(),
  humanEdited: z.boolean(),
  metadata: z.record(z.unknown()),
});
export type AssetVariant = z.infer<typeof AssetVariantSchema>;
