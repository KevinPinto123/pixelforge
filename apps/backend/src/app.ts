import { problem, type ProviderId } from '@pixelforge/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { BlobStore } from './blob-store.js';
import type { GenerateCharacterRequest } from './job-runner.js';
import { JobsRepo } from './jobs-repo.js';
import { ProjectsRepo } from './projects-repo.js';
import { registerBlobsRoute } from './routes/blobs.js';
import { registerHealthzRoute } from './routes/healthz.js';
import { registerJobsRoutes } from './routes/jobs.js';
import { registerProjectsRoutes } from './routes/projects.js';

const PUBLIC_PATHS = new Set(['/healthz']);

export interface BuildAppOptions {
  db: DatabaseSync;
  token: string;
  enqueueGenerateCharacter: (req: GenerateCharacterRequest) => void;
  registeredProviderIds?: ProviderId[];
  blobStore?: BlobStore;
}

/** Fastify app factory: separado de index.ts (listen) para poder testear con `inject`. */
export function buildApp({
  db,
  token,
  enqueueGenerateCharacter,
  registeredProviderIds = [],
  blobStore,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_PATHS.has(request.url)) return;
    const header = request.headers['x-pf-token'];
    if (header !== token) {
      await reply.code(401).send(problem(401, 'Token invalido o ausente', { code: 'unauthorized' }));
    }
  });

  registerHealthzRoute(app, registeredProviderIds);
  registerProjectsRoutes(app, new ProjectsRepo(db));
  registerJobsRoutes(app, { jobsRepo: new JobsRepo(db), enqueueGenerateCharacter });
  if (blobStore) registerBlobsRoute(app, blobStore);

  return app;
}
