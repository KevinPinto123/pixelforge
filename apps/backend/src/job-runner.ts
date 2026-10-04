import type { Job } from '@pixelforge/contracts';
import type { NormalizedCharacterInput, ProviderRegistry } from '@pixelforge/providers';
import { LocalPostProcessAdapter } from '@pixelforge/providers';
import type { BlobStore } from './blob-store.js';
import type { JobQueues } from './job-queue.js';
import type { JobsRepo } from './jobs-repo.js';

export interface JobRunnerDeps {
  registry: ProviderRegistry;
  jobsRepo: JobsRepo;
  blobStore: BlobStore;
  queues: JobQueues;
  now?: () => string;
  pollDelayMs?: number;
  maxPollAttempts?: number;
}

export interface GenerateCharacterRequest {
  jobId: string;
  input: NormalizedCharacterInput;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pipeline de un job de generacion (spec §9): submit -> poll -> download ->
 * post-proceso local -> ready. Encolado en dos lanes p-queue (job-queue.ts):
 * `generation` para la llamada al provider externo (submit+poll+download),
 * `postprocess` para @pixelforge/postprocess (CPU-bound, via LocalPostProcessAdapter).
 *
 * Alcance de este slice (arranque de Fase 2, no las 10 tareas completas):
 * cubre tareas 19-21+23 (jobs+estados+p-queue, PixelLabApiAdapter, post-proceso).
 * NO crea entidades Asset/AssetVariant (tarea 24, blob store completo con
 * lineage) — el resultado se persiste como blob content-addressed y se referencia
 * en `job.previewUrls` como `blob://<hash>`; enlazarlo a un Asset real queda
 * para cuando exista el flujo de creacion de Asset en el editor.
 */
export function createJobRunner(deps: JobRunnerDeps): {
  enqueueGenerateCharacter: (req: GenerateCharacterRequest) => void;
} {
  const now = deps.now ?? (() => new Date().toISOString());
  const pollDelayMs = deps.pollDelayMs ?? 3000;
  const maxPollAttempts = deps.maxPollAttempts ?? 100;

  function enqueueGenerateCharacter(req: GenerateCharacterRequest): void {
    void deps.queues.generation.add(() => runGenerateCharacter(req));
  }

  async function runGenerateCharacter(req: GenerateCharacterRequest): Promise<void> {
    const { jobId } = req;
    const startedAt = Date.now();
    const adapter = deps.registry.byCapability('character')[0];

    if (!adapter) {
      failJob(jobId, {
        code: 'no_provider',
        message: 'Ningun provider registrado para capability character',
        retryable: false,
      });
      return;
    }

    deps.jobsRepo.patch(jobId, { status: 'running', provider: adapter.id }, now());
    const providerStart = Date.now();

    try {
      const accepted = await adapter.generateCharacter(req.input);
      deps.jobsRepo.patch(
        jobId,
        { status: 'awaiting_provider', providerJobId: accepted.providerJobId },
        now(),
      );

      let attempts = 0;
      let status = await adapter.getJobStatus(accepted.providerJobId);
      while (status.status !== 'succeeded' && status.status !== 'failed' && attempts < maxPollAttempts) {
        await sleep(pollDelayMs);
        status = await adapter.getJobStatus(accepted.providerJobId);
        attempts += 1;
        deps.jobsRepo.patch(jobId, { progress: status.progress ?? 0 }, now());
      }

      if (status.status !== 'succeeded') {
        failJob(
          jobId,
          {
            code: 'provider_failed',
            message: status.error ?? 'timeout esperando resultado del provider',
            retryable: true,
          },
          { providerMs: Date.now() - providerStart },
        );
        return;
      }

      const result = await adapter.downloadResult(accepted.providerJobId);
      const providerMs = Date.now() - providerStart;
      deps.jobsRepo.patch(jobId, { status: 'post_processing', metrics: { providerMs } }, now());

      void deps.queues.postprocess.add(() => runPostProcess(jobId, result.images, startedAt, providerMs));
    } catch (err) {
      failJob(jobId, {
        code: 'unexpected_error',
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      });
    }
  }

  async function runPostProcess(
    jobId: string,
    images: Array<{ buffer: Uint8Array; meta: Record<string, unknown> }>,
    startedAt: number,
    providerMs: number,
  ): Promise<void> {
    const postStart = Date.now();
    try {
      const postAdapter = deps.registry.byCapability('postprocess')[0];
      const pngs = images.map((img, i) => ({ name: `frame-${i}`, png: Buffer.from(img.buffer) }));

      let outputPngs: Array<{ name: string; png: Buffer }> = pngs;
      if (postAdapter instanceof LocalPostProcessAdapter) {
        const { pngOutputs } = await postAdapter.postProcessPng(pngs, {
          alphaCleanup: {},
          quantize: {},
          despeckle: { mode: 'conservative' },
        });
        outputPngs = pngOutputs.map((out) => ({ name: out.name, png: out.png }));
      }

      const previewUrls = outputPngs.map((out) => `blob://${deps.blobStore.put(out.png)}`);
      const postProcessMs = Date.now() - postStart;

      deps.jobsRepo.patch(
        jobId,
        {
          status: 'ready',
          progress: 1,
          previewUrls,
          metrics: { providerMs, postProcessMs, totalMs: Date.now() - startedAt },
        },
        now(),
      );
    } catch (err) {
      failJob(jobId, {
        code: 'postprocess_failed',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      });
    }
  }

  function failJob(jobId: string, error: Job['error'], metrics?: Partial<Job['metrics']>): void {
    deps.jobsRepo.patch(jobId, { status: 'failed', error, ...(metrics ? { metrics } : {}) }, now());
  }

  return { enqueueGenerateCharacter };
}
