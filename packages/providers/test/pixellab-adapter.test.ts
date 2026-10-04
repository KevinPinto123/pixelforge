import { describe, expect, it, vi } from 'vitest';
import { PixelLabApiAdapter, PixelLabApiError, isRetryableStatus } from '../src/pixellab-adapter.js';

// Fixtures grabadas a mano contra el shape documentado en api.pixellab.ai/v2/llms.txt
// (spec §10, tarea 21: "PixelLabApiAdapter: submit character, poll, download (con
// mocks grabados para tests)"). Sin llamadas de red reales en el suite.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PixelLabApiAdapter', () => {
  it('generateCharacter hace POST y devuelve providerJobId', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ job_id: 'pj_abc123', estimate_s: 12 }));
    const adapter = new PixelLabApiAdapter({ apiKey: 'test-key', fetchImpl });

    const accepted = await adapter.generateCharacter({
      prompt: 'npc tendero pixel art 16-bit',
      size: 48,
      directions: 8,
    });

    expect(accepted).toEqual({ providerJobId: 'pj_abc123', estimateS: 12 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.pixellab.ai/v2/create-character-with-8-directions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ description: 'npc tendero pixel art 16-bit', n_directions: 8 });
  });

  it('getJobStatus mapea status del provider al contrato interno', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'processing', progress: 0.4 }));
    const adapter = new PixelLabApiAdapter({ apiKey: 'test-key', fetchImpl });

    const status = await adapter.getJobStatus('pj_abc123');

    expect(status).toEqual({ status: 'running', progress: 0.4, error: undefined });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.pixellab.ai/v2/background-jobs/pj_abc123',
      expect.anything(),
    );
  });

  it('downloadResult descarga cada imagen del job completado', async () => {
    const imageBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/background-jobs/pj_abc123')) {
        return Promise.resolve(
          jsonResponse({
            status: 'completed',
            result: { images: [{ url: 'https://cdn.pixellab.ai/out.png', meta: { frame: 'south' } }] },
          }),
        );
      }
      return Promise.resolve(new Response(imageBytes, { status: 200 }));
    });
    const adapter = new PixelLabApiAdapter({ apiKey: 'test-key', fetchImpl });

    const result = await adapter.downloadResult('pj_abc123');

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.buffer).toEqual(imageBytes);
    expect(result.images[0]!.meta).toEqual({ frame: 'south' });
  });

  it('downloadResult rechaza si el job no esta completo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'running' }));
    const adapter = new PixelLabApiAdapter({ apiKey: 'test-key', fetchImpl });

    await expect(adapter.downloadResult('pj_abc123')).rejects.toThrow(/no tiene resultado descargable/);
  });

  it('errores HTTP no-2xx se propagan como PixelLabApiError con retryable correcto', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const adapter = new PixelLabApiAdapter({ apiKey: 'test-key', fetchImpl });

    await expect(adapter.getJobStatus('pj_abc123')).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });

  it('healthcheck ok=false en fallo, sin lanzar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 500 }));
    const adapter = new PixelLabApiAdapter({ apiKey: 'test-key', fetchImpl });

    const health = await adapter.healthcheck();

    expect(health.ok).toBe(false);
  });
});

describe('isRetryableStatus', () => {
  it('429 y 5xx son retryable; 4xx de contenido no', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('PixelLabApiError', () => {
  it('trunca el body en el mensaje', () => {
    const err = new PixelLabApiError(500, 'x'.repeat(1000));
    expect(err.message.length).toBeLessThan(400);
    expect(err.retryable).toBe(true);
  });
});
