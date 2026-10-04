import type { Job, JobStatus } from '@pixelforge/contracts';
import type { DatabaseSync } from 'node:sqlite';

interface JobRow {
  id: string;
  request_id: string;
  project_id: string;
  status: string;
  progress: number;
  provider: string | null;
  provider_job_id: string | null;
  retries: number;
  max_retries: number;
  error_code: string | null;
  error_message: string | null;
  error_retryable: number | null;
  error_suggestion: string | null;
  output_asset_variant_ids: string;
  preview_urls: string;
  metrics_queued_ms: number | null;
  metrics_provider_ms: number | null;
  metrics_post_process_ms: number | null;
  metrics_total_ms: number | null;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    requestId: row.request_id,
    projectId: row.project_id,
    status: row.status as JobStatus,
    progress: row.progress,
    ...(row.provider ? { provider: row.provider as Job['provider'] } : {}),
    ...(row.provider_job_id ? { providerJobId: row.provider_job_id } : {}),
    retries: row.retries,
    maxRetries: row.max_retries,
    ...(row.error_code
      ? {
          error: {
            code: row.error_code,
            message: row.error_message ?? '',
            retryable: row.error_retryable === 1,
            ...(row.error_suggestion ? { suggestion: row.error_suggestion } : {}),
          },
        }
      : {}),
    outputAssetVariantIds: JSON.parse(row.output_asset_variant_ids) as string[],
    previewUrls: JSON.parse(row.preview_urls) as string[],
    metrics: {
      ...(row.metrics_queued_ms != null ? { queuedMs: row.metrics_queued_ms } : {}),
      ...(row.metrics_provider_ms != null ? { providerMs: row.metrics_provider_ms } : {}),
      ...(row.metrics_post_process_ms != null ? { postProcessMs: row.metrics_post_process_ms } : {}),
      ...(row.metrics_total_ms != null ? { totalMs: row.metrics_total_ms } : {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface JobPatch {
  status?: JobStatus;
  progress?: number;
  provider?: Job['provider'];
  providerJobId?: string;
  retries?: number;
  error?: Job['error'] | null;
  outputAssetVariantIds?: string[];
  previewUrls?: string[];
  metrics?: Partial<Job['metrics']>;
}

/** Repo de jobs (spec §9: maquina de estados queued->running->awaiting_provider->post_processing->ready|failed|canceled). */
export class JobsRepo {
  constructor(private readonly db: DatabaseSync) {}

  insert(job: Job): void {
    this.db
      .prepare(
        `INSERT INTO jobs
          (id, request_id, project_id, status, progress, provider, provider_job_id, retries, max_retries,
           error_code, error_message, error_retryable, error_suggestion,
           output_asset_variant_ids, preview_urls,
           metrics_queued_ms, metrics_provider_ms, metrics_post_process_ms, metrics_total_ms,
           created_at, updated_at)
         VALUES
          (@id, @requestId, @projectId, @status, @progress, @provider, @providerJobId, @retries, @maxRetries,
           @errorCode, @errorMessage, @errorRetryable, @errorSuggestion,
           @outputAssetVariantIds, @previewUrls,
           @metricsQueuedMs, @metricsProviderMs, @metricsPostProcessMs, @metricsTotalMs,
           @createdAt, @updatedAt)`,
      )
      .run({
        id: job.id,
        requestId: job.requestId,
        projectId: job.projectId,
        status: job.status,
        progress: job.progress,
        provider: job.provider ?? null,
        providerJobId: job.providerJobId ?? null,
        retries: job.retries,
        maxRetries: job.maxRetries,
        errorCode: job.error?.code ?? null,
        errorMessage: job.error?.message ?? null,
        errorRetryable: job.error ? (job.error.retryable ? 1 : 0) : null,
        errorSuggestion: job.error?.suggestion ?? null,
        outputAssetVariantIds: JSON.stringify(job.outputAssetVariantIds),
        previewUrls: JSON.stringify(job.previewUrls),
        metricsQueuedMs: job.metrics.queuedMs ?? null,
        metricsProviderMs: job.metrics.providerMs ?? null,
        metricsPostProcessMs: job.metrics.postProcessMs ?? null,
        metricsTotalMs: job.metrics.totalMs ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
  }

  findById(id: string): Job | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? rowToJob(row) : undefined;
  }

  /** Jobs `running`/`awaiting_provider`/`post_processing` sobrevivientes de un reinicio (spec §9: re-adopcion al boot). */
  findResumable(): Job[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM jobs WHERE status IN ('running', 'awaiting_provider', 'post_processing')`,
      )
      .all() as unknown as JobRow[];
    return rows.map(rowToJob);
  }

  patch(id: string, patch: JobPatch, updatedAt: string): void {
    const current = this.findById(id);
    if (!current) throw new Error(`Job no encontrado: ${id}`);
    const next: Job = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.providerJobId !== undefined ? { providerJobId: patch.providerJobId } : {}),
      ...(patch.retries !== undefined ? { retries: patch.retries } : {}),
      ...(patch.error !== undefined ? { error: patch.error ?? undefined } : {}),
      ...(patch.outputAssetVariantIds !== undefined
        ? { outputAssetVariantIds: patch.outputAssetVariantIds }
        : {}),
      ...(patch.previewUrls !== undefined ? { previewUrls: patch.previewUrls } : {}),
      metrics: { ...current.metrics, ...patch.metrics },
      updatedAt,
    };
    this.db
      .prepare(
        `UPDATE jobs SET
          status = @status, progress = @progress, provider = @provider, provider_job_id = @providerJobId,
          retries = @retries, error_code = @errorCode, error_message = @errorMessage,
          error_retryable = @errorRetryable, error_suggestion = @errorSuggestion,
          output_asset_variant_ids = @outputAssetVariantIds, preview_urls = @previewUrls,
          metrics_queued_ms = @metricsQueuedMs, metrics_provider_ms = @metricsProviderMs,
          metrics_post_process_ms = @metricsPostProcessMs, metrics_total_ms = @metricsTotalMs,
          updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: next.id,
        status: next.status,
        progress: next.progress,
        provider: next.provider ?? null,
        providerJobId: next.providerJobId ?? null,
        retries: next.retries,
        errorCode: next.error?.code ?? null,
        errorMessage: next.error?.message ?? null,
        errorRetryable: next.error ? (next.error.retryable ? 1 : 0) : null,
        errorSuggestion: next.error?.suggestion ?? null,
        outputAssetVariantIds: JSON.stringify(next.outputAssetVariantIds),
        previewUrls: JSON.stringify(next.previewUrls),
        metricsQueuedMs: next.metrics.queuedMs ?? null,
        metricsProviderMs: next.metrics.providerMs ?? null,
        metricsPostProcessMs: next.metrics.postProcessMs ?? null,
        metricsTotalMs: next.metrics.totalMs ?? null,
        updatedAt,
      });
  }
}
