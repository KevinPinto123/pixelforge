import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import type { GenerateCharacterRequest } from '../src/job-runner.js';

const TOKEN = 'test-token';
let db: DatabaseSync;

beforeEach(() => {
  db = openDb(':memory:');
});

afterEach(() => {
  db.close();
});

describe('POST /v1/jobs/generate-character + GET /v1/jobs/:id', () => {
  it('acepta el job en <200ms, lo persiste queued y lo encola', async () => {
    const enqueued: GenerateCharacterRequest[] = [];
    const app = buildApp({
      db,
      token: TOKEN,
      enqueueGenerateCharacter: (req) => enqueued.push(req),
    });
    // El SLA mide el handler ya listo, no el bootstrap lazy de Fastify que
    // `inject()` ejecuta solo en la primera peticion del proceso de test.
    await app.ready();

    const start = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/generate-character',
      headers: { 'x-pf-token': TOKEN },
      payload: { projectId: 'proj1', prompt: 'npc tendero pixel art', size: 48, directions: 8 },
    });
    const elapsedMs = Date.now() - start;

    expect(res.statusCode).toBe(202);
    expect(elapsedMs).toBeLessThan(200);
    const accepted = res.json();
    expect(accepted).toMatchObject({ status: 'queued', pollWith: 'get_job_status' });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.jobId).toBe(accepted.jobId);
    expect(enqueued[0]!.input.prompt).toBe('npc tendero pixel art');

    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${accepted.jobId}`,
      headers: { 'x-pf-token': TOKEN },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toMatchObject({ id: accepted.jobId, status: 'queued', projectId: 'proj1' });
  });

  it('400 con input invalido', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: () => {} });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/generate-character',
      headers: { 'x-pf-token': TOKEN },
      payload: { prompt: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid_input');
  });

  it('404 con problem+json en job inexistente', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: () => {} });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/jobs/no-existe',
      headers: { 'x-pf-token': TOKEN },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('job_not_found');
  });

  it('rechaza sin token', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: () => {} });
    const res = await app.inject({ method: 'GET', url: '/v1/jobs/whatever' });
    expect(res.statusCode).toBe(401);
  });
});
