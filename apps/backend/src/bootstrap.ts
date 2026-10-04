import {
  AnthropicGridAdapter,
  ClaudeCliAdapter,
  LocalPostProcessAdapter,
  PixelLabApiAdapter,
  ProviderRegistry,
} from '@pixelforge/providers';
import type { DatabaseSync } from 'node:sqlite';
import { BlobStore } from './blob-store.js';
import { getBlobsDir, getPixelLabApiKey } from './config.js';
import { createJobQueues } from './job-queue.js';
import { createJobRunner, type GenerateCharacterRequest } from './job-runner.js';
import { JobsRepo } from './jobs-repo.js';

export interface Bootstrap {
  registry: ProviderRegistry;
  blobStore: BlobStore;
  enqueueGenerateCharacter: (req: GenerateCharacterRequest) => void;
}

/** Arma registry + colas + job runner, y re-adopta jobs sobrevivientes de un reinicio (spec §9, tarea 19). */
export function bootstrap(db: DatabaseSync): Bootstrap {
  const registry = new ProviderRegistry();

  // Provider propio via Anthropic API (ANTHROPIC_API_KEY): tool-use FORZADO a una
  // grilla NxN indexada a color (spec §21, AnthropicGridAdapter). Opt-in por API
  // key. PF_PREFER_OWN=1 lo pone como PRIMARIO de "character" (se registra antes que
  // PixelLab/claude-cli, asi lo elige byCapability()[0]); si no, se registra abajo
  // como failover. Sin ANTHROPIC_API_KEY no se registra: el default sigue siendo
  // "con mi suscripcion de Claude" (claude-cli), sin coste de API.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const preferOwn = Boolean(anthropicKey) && process.env.PF_PREFER_OWN === '1';
  if (preferOwn) {
    registry.register(new AnthropicGridAdapter());
  }

  const apiKey = getPixelLabApiKey();
  if (apiKey) {
    registry.register(new PixelLabApiAdapter({ apiKey }));
  } else if (!preferOwn) {
    console.warn(
      'PIXELLAB_API_KEY no configurada: PixelLabApiAdapter no se registra; claude-cli queda como provider primario de "character".',
    );
  }
  // Provider sobre la suscripcion de Claude del usuario (CLI `claude -p`, sin API
  // key). Con PIXELLAB_API_KEY seteada queda como failover (routing por orden de
  // registro); sin ella es el provider por defecto. PF_DISABLE_CLAUDE=1 lo apaga.
  if (process.env.PF_DISABLE_CLAUDE !== '1') {
    registry.register(new ClaudeCliAdapter());
  }
  // `own` como failover (hay API key pero no se pidio primario): queda disponible
  // en /healthz y para el routing con prioridades de Fase 4, sin desplazar a claude-cli.
  if (anthropicKey && !preferOwn) {
    registry.register(new AnthropicGridAdapter());
  }
  registry.register(new LocalPostProcessAdapter());

  const blobStore = new BlobStore(getBlobsDir());
  const jobsRepo = new JobsRepo(db);
  const runner = createJobRunner({
    registry,
    jobsRepo,
    blobStore,
    queues: createJobQueues(),
  });

  reAdoptResumableJobs(jobsRepo);

  return { registry, blobStore, enqueueGenerateCharacter: runner.enqueueGenerateCharacter };
}

/**
 * Fase 2: la tabla `jobs` no persiste el input original (prompt/size/directions),
 * asi que un job `running/awaiting_provider/post_processing` al reiniciar no se
 * puede re-encolar de verdad (spec §9 lo asume vía provider_job_id, pero re-pollear
 * sin el resto del contexto del job no alcanza para completarlo). Simplificacion
 * documentada: se marca `failed` + `retryable` para que el cliente reintente en vez
 * de dejarlo colgado en un estado no-terminal para siempre. Persistir el input
 * (o el AcceptedJob completo) en la tabla es el siguiente paso para re-adopcion real.
 */
function reAdoptResumableJobs(jobsRepo: JobsRepo): void {
  const now = new Date().toISOString();
  for (const job of jobsRepo.findResumable()) {
    jobsRepo.patch(
      job.id,
      {
        status: 'failed',
        error: {
          code: 'interrupted_by_restart',
          message: 'Job interrumpido por reinicio del backend antes de completarse',
          retryable: true,
        },
      },
      now,
    );
  }
}
