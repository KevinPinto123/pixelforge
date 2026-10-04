import { buildProject } from '@pixelforge/core';
import { CreateProjectInputSchema, problem } from '@pixelforge/contracts';
import type { FastifyInstance } from 'fastify';
import type { ProjectsRepo } from '../projects-repo.js';

export function registerProjectsRoutes(app: FastifyInstance, repo: ProjectsRepo): void {
  app.post('/v1/projects', async (request, reply) => {
    const parsed = CreateProjectInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(problem(400, 'Input invalido', { detail: parsed.error.message, code: 'invalid_input' }));
    }
    const project = buildProject(parsed.data);
    repo.insert(project);
    return reply.code(201).send(project);
  });

  app.get<{ Params: { id: string } }>('/v1/projects/:id', async (request, reply) => {
    const project = repo.findById(request.params.id);
    if (!project) {
      return reply
        .code(404)
        .send(problem(404, 'Project no encontrado', { code: 'project_not_found' }));
    }
    return reply.send(project);
  });
}
