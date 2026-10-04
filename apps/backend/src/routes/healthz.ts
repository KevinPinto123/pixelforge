import type { ProviderId } from '@pixelforge/contracts';
import type { FastifyInstance } from 'fastify';

const VERSION = '0.1.0';

export function registerHealthzRoute(app: FastifyInstance, providerIds: ProviderId[] = []): void {
  app.get('/healthz', async () => ({
    ok: true,
    version: VERSION,
    providers: providerIds,
  }));
}
