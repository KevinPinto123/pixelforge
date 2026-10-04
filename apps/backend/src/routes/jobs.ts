import { newId, nowIso } from '@pixelforge/core';
import { GenerateCharacterInputSchema, problem, type Job } from '@pixelforge/contracts';
import type { FastifyInstance } from 'fastify';
import type { GenerateCharacterRequest } from '../job-runner.js';
import type { JobsRepo } from '../jobs-repo.js';

export interface JobsRouteDeps {
  jobsRepo: JobsRepo;
  enqueueGenerateCharacter: (req: GenerateCharacterRequest) => void;
}

/** `POST /v1/jobs/generate-character` + `GET /v1/jobs/:id` (spec §9/§10, tarea 25). */
export function registerJobsRoutes(app: FastifyInstance, deps: JobsRouteDeps): void {
  app.post('/v1/jobs/generate-character', async (request, reply) => {
    const parsed = GenerateCharacterInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(problem(400, 'Input invalido', { detail: parsed.error.message, code: 'invalid_input' }));
    }

    const now = nowIso();
    const job: Job = {
      id: newId(),
      requestId: newId(),
      projectId: parsed.data.projectId,
      status: 'queued',
      progress: 0,
      retries: 0,
      maxRetries: 3,
      outputAssetVariantIds: [],
      previewUrls: [],
      metrics: {},
      createdAt: now,
      updatedAt: now,
    };
    deps.jobsRepo.insert(job);

    deps.enqueueGenerateCharacter({
      jobId: job.id,
      input: {
        prompt: parsed.data.prompt,
        size: parsed.data.size,
        directions: parsed.data.directions,
        ...(parsed.data.paletteColors ? { paletteColors: parsed.data.paletteColors } : {}),
      },
    });

    return reply.code(202).send({ jobId: job.id, status: job.status, pollWith: 'get_job_status' });
  });

  app.get<{ Params: { id: string } }>('/v1/jobs/:id', async (request, reply) => {
    const job = deps.jobsRepo.findById(request.params.id);
    if (!job) {
      return reply.code(404).send(problem(404, 'Job no encontrado', { code: 'job_not_found' }));
    }
    return reply.send(job);
  });
}
