import { cpus } from 'node:os';
import PQueue from 'p-queue';

export interface JobQueues {
  /** Llamadas a provider externo (spec §9: concurrencia 3). */
  generation: PQueue;
  /** Post-proceso local, CPU-bound (spec §9: concurrencia cpu-1). */
  postprocess: PQueue;
}

export function createJobQueues(): JobQueues {
  return {
    generation: new PQueue({ concurrency: 3 }),
    postprocess: new PQueue({ concurrency: Math.max(1, cpus().length - 1) }),
  };
}
