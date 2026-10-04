import { z } from 'zod';
import { IdSchema, TimestampsSchema } from './primitives.js';

export const ProviderIdSchema = z.enum(['pixellab-api', 'fal', 'local', 'own', 'claude-cli']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting_provider',
  'post_processing',
  'ready',
  'failed',
  'canceled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  suggestion: z.string().optional(),
});
export type JobError = z.infer<typeof JobErrorSchema>;

export const JobSchema = TimestampsSchema.extend({
  id: IdSchema,
  requestId: IdSchema,
  projectId: IdSchema,
  status: JobStatusSchema,
  progress: z.number().min(0).max(1),
  provider: ProviderIdSchema.optional(),
  providerJobId: z.string().optional(),
  retries: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
  error: JobErrorSchema.optional(),
  outputAssetVariantIds: z.array(IdSchema),
  previewUrls: z.array(z.string()),
  metrics: z.object({
    queuedMs: z.number().optional(),
    providerMs: z.number().optional(),
    postProcessMs: z.number().optional(),
    totalMs: z.number().optional(),
  }),
});
export type Job = z.infer<typeof JobSchema>;

/** Respuesta estandar de toda ruta/tool asincrona: job id inmediato, <200 ms. */
export const AcceptedJobSchema = z.object({
  jobId: IdSchema,
  status: JobStatusSchema,
  pollWith: z.literal('get_job_status'),
  estimateS: z.number().optional(),
});
export type AcceptedJob = z.infer<typeof AcceptedJobSchema>;

/**
 * Input de `POST /v1/jobs/generate-character` (spec §10 tarea 25, tarea 22:
 * normalizador de prompt). Fase 2: passthrough validado, sin templates
 * institucionales todavia — eso es tarea 22 completa, no este slice.
 */
export const GenerateCharacterInputSchema = z.object({
  projectId: IdSchema,
  prompt: z.string().min(1).max(2000),
  size: z.union([z.literal(16), z.literal(32), z.literal(48), z.literal(64)]).default(48),
  directions: z.union([z.literal(1), z.literal(4), z.literal(8)]).default(8),
  paletteColors: z.array(z.string()).optional(),
});
export type GenerateCharacterInput = z.infer<typeof GenerateCharacterInputSchema>;
