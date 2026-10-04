import type { ProviderId } from '@pixelforge/contracts';
import type {
  NormalizedAnimationInput,
  NormalizedCharacterInput,
  NormalizedTilesetInput,
  PixelProviderAdapter,
  ProviderAcceptedJob,
  ProviderCapability,
  ProviderHealth,
  ProviderJobStatus,
  ProviderResult,
} from './adapter.js';

export interface PixelLabApiAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.pixellab.ai/v2';

/** Statuses HTTP que ameritan retry (spec §9: timeout, 429, 5xx). */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class PixelLabApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, body: string) {
    super(`PixelLab API error ${status}: ${body.slice(0, 300)}`);
    this.name = 'PixelLabApiError';
    this.status = status;
    this.retryable = isRetryableStatus(status);
  }
}

interface PixelLabJobAccepted {
  job_id: string;
  estimate_s?: number;
}

interface PixelLabBackgroundJob {
  status: string;
  progress?: number;
  error?: string;
  result?: {
    images: Array<{ url: string; meta?: Record<string, unknown> }>;
  };
}

/**
 * PixelLabApiAdapter (spec §10, Fase 2, tarea 21). Cliente REST de la API v2 de
 * PixelLab (https://api.pixellab.ai/v2/llms.txt) — NO su MCP: decision documentada
 * en la spec (mismo backend detras, doble mantenimiento sin valor).
 *
 * Endpoints (doc publica al momento de escribir esto — si PixelLab los cambia,
 * solo este archivo se toca, el resto del orchestrator no conoce la API concreta):
 *   POST /create-character-with-8-directions  -> job_id
 *   POST /animate-character                   -> job_id
 *   POST /create-tileset[-sidescroller]        -> job_id
 *   GET  /background-jobs/{job_id}             -> status + result.images[].url
 *   GET  /balance                              -> usado solo como healthcheck barato
 */
export class PixelLabApiAdapter implements PixelProviderAdapter {
  readonly id: ProviderId = 'pixellab-api';
  readonly capabilities: ProviderCapability[] = ['character', 'animation', 'tileset'];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PixelLabApiAdapterOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new PixelLabApiError(res.status, body);
    }
    return (await res.json()) as T;
  }

  async generateCharacter(input: NormalizedCharacterInput): Promise<ProviderAcceptedJob> {
    const res = await this.request<PixelLabJobAccepted>('/create-character-with-8-directions', {
      method: 'POST',
      body: JSON.stringify({
        description: input.prompt,
        image_size: { width: input.size, height: input.size },
        n_directions: input.directions,
        ...(input.paletteColors ? { palette: input.paletteColors } : {}),
      }),
    });
    return { providerJobId: res.job_id, estimateS: res.estimate_s };
  }

  async generateAnimation(input: NormalizedAnimationInput): Promise<ProviderAcceptedJob> {
    const res = await this.request<PixelLabJobAccepted>('/animate-character', {
      method: 'POST',
      body: JSON.stringify({
        image: Buffer.from(input.sourceImage).toString('base64'),
        action: input.action,
        n_directions: input.directions,
        fps: input.fps,
      }),
    });
    return { providerJobId: res.job_id, estimateS: res.estimate_s };
  }

  async generateTileset(input: NormalizedTilesetInput): Promise<ProviderAcceptedJob> {
    const path = input.mode === 'sidescroller' ? '/create-tileset-sidescroller' : '/create-tileset';
    const res = await this.request<PixelLabJobAccepted>(path, {
      method: 'POST',
      body: JSON.stringify({ theme: input.theme, tile_size: input.tileSize, mode: input.mode }),
    });
    return { providerJobId: res.job_id, estimateS: res.estimate_s };
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    const job = await this.request<PixelLabBackgroundJob>(`/background-jobs/${providerJobId}`);
    return { status: mapStatus(job.status), progress: job.progress, error: job.error };
  }

  async downloadResult(providerJobId: string): Promise<ProviderResult> {
    const job = await this.request<PixelLabBackgroundJob>(`/background-jobs/${providerJobId}`);
    if (mapStatus(job.status) !== 'succeeded' || !job.result) {
      throw new Error(`Job ${providerJobId} no tiene resultado descargable (status=${job.status})`);
    }
    const images = await Promise.all(
      job.result.images.map(async (img) => {
        const res = await this.fetchImpl(img.url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!res.ok) throw new PixelLabApiError(res.status, await res.text().catch(() => ''));
        return { buffer: new Uint8Array(await res.arrayBuffer()), meta: img.meta ?? {} };
      }),
    );
    return { images, raw: job };
  }

  async cancel(providerJobId: string): Promise<void> {
    await this.request(`/background-jobs/${providerJobId}/cancel`, { method: 'POST' });
  }

  async healthcheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.request('/balance');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, detail: (err as Error).message };
    }
  }
}

function mapStatus(raw: string): ProviderJobStatus['status'] {
  switch (raw) {
    case 'queued':
    case 'pending':
      return 'pending';
    case 'completed':
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'running';
  }
}
