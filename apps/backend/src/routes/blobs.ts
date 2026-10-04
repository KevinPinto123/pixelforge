import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { problem } from '@pixelforge/contracts';
import type { FastifyInstance } from 'fastify';
import type { BlobStore } from '../blob-store.js';

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * `GET /v1/blobs/:hash` — sirve un blob content-addressed como PNG. Es lo que
 * resuelve los `previewUrls` `blob://<hash>` de los jobs para el editor (el
 * main process de Electron los baja por aca y se los pasa al renderer como
 * data URL; el renderer nunca ve token ni filesystem).
 */
export function registerBlobsRoute(app: FastifyInstance, blobStore: BlobStore): void {
  app.get<{ Params: { hash: string } }>('/v1/blobs/:hash', async (request, reply) => {
    const { hash } = request.params;
    if (!SHA256_RE.test(hash)) {
      return reply.code(400).send(problem(400, 'Hash invalido', { code: 'invalid_hash' }));
    }
    const path = blobStore.path(hash);
    if (!existsSync(path)) {
      return reply.code(404).send(problem(404, 'Blob no encontrado', { code: 'blob_not_found' }));
    }
    const data = await readFile(path);
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'immutable').send(data);
  });
}
