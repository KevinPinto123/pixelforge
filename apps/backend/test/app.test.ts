import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db.js';

const TOKEN = 'test-token';
const noopEnqueue = (): void => {};
let db: DatabaseSync;

beforeEach(() => {
  db = openDb(':memory:');
});

afterEach(() => {
  db.close();
});

describe('backend app', () => {
  it('GET /healthz responde ok sin token (publico)', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: noopEnqueue });
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('rechaza rutas protegidas sin X-PF-Token', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: noopEnqueue });
    const res = await app.inject({ method: 'GET', url: '/v1/projects/whatever' });
    expect(res.statusCode).toBe(401);
  });

  it('crea y lee un project con token valido', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: noopEnqueue });
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { 'x-pf-token': TOKEN },
      payload: { name: 'npc-pack' },
    });
    expect(createRes.statusCode).toBe(201);
    const project = createRes.json();
    expect(project.name).toBe('npc-pack');

    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}`,
      headers: { 'x-pf-token': TOKEN },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(project.id);
  });

  it('404 con problem+json en project inexistente', async () => {
    const app = buildApp({ db, token: TOKEN, enqueueGenerateCharacter: noopEnqueue });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/projects/no-existe',
      headers: { 'x-pf-token': TOKEN },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('project_not_found');
  });
});
