import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    // Los tests de rutas incluyen un SLA de latencia. Correr archivos Fastify
    // en paralelo mide contencion del runner, no el handler bajo prueba.
    fileParallelism: false,
  },
});
