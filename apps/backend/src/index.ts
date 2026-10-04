import { join } from 'node:path';
import { buildApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { ensureConfig, getConfigDir } from './config.js';
import { openDb } from './db.js';

const port = Number(process.env.PF_PORT ?? 7710);
const { token } = ensureConfig();
const db = openDb(join(getConfigDir(), 'pixelforge.db'));
const { registry, blobStore, enqueueGenerateCharacter } = bootstrap(db);
const app = buildApp({
  db,
  token,
  enqueueGenerateCharacter,
  registeredProviderIds: registry.list().map((a) => a.id),
  blobStore,
});

app
  .listen({ port, host: '127.0.0.1' })
  .then(() => {
    console.log(`pixelforge backend listo en http://127.0.0.1:${port}`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
