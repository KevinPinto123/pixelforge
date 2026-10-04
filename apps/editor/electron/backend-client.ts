import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AcceptedJobInfo,
  GenerateCharacterInput,
  HealthzInfo,
  JobStatusInfo,
} from './ipc-channels.js';

/** Espejo minimo de apps/backend/src/config.ts (misma convencion de ruta): el editor lee el token, no lo crea. */
function getConfigPath(): string {
  const base = process.env.APPDATA ?? join(homedir(), '.config');
  return join(base, 'pixelforge', 'config.json');
}

function readToken(): string | undefined {
  const path = getConfigPath();
  if (!existsSync(path)) return undefined;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { token?: string };
  return raw.token;
}

function getBackendBaseUrl(): string {
  const port = process.env.PF_PORT ?? '7710';
  return `http://127.0.0.1:${port}`;
}

/**
 * Unico punto del proceso main que habla con el backend REST (spec §7: el
 * renderer nunca ve el token ni la URL — solo llama IPC, main hace la llamada
 * de red real). Reemplaza cualquier mock: Fase 2 conecta directo al backend
 * real, no hay `mockBackend.ts` en este editor (nunca existio uno commiteado).
 */
export class PixelForgeBackendClient {
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = readToken();
    if (!token) {
      throw new Error(
        'No hay token de PixelForge (config.json ausente): arranca apps/backend al menos una vez.',
      );
    }
    const res = await fetch(`${getBackendBaseUrl()}${path}`, {
      ...init,
      headers: { 'X-PF-Token': token, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Backend PixelForge respondio ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async generateCharacter(input: GenerateCharacterInput): Promise<AcceptedJobInfo> {
    return this.request<AcceptedJobInfo>('/v1/jobs/generate-character', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getJobStatus(jobId: string): Promise<JobStatusInfo> {
    return this.request<JobStatusInfo>(`/v1/jobs/${jobId}`);
  }

  /** Resuelve los previewUrls `blob://<hash>` de un job a data URLs PNG para el renderer. */
  async getJobPreviews(jobId: string): Promise<string[]> {
    const job = await this.getJobStatus(jobId);
    const token = readToken();
    if (!token) return [];
    const out: string[] = [];
    for (const url of job.previewUrls) {
      const hash = url.replace('blob://', '');
      const res = await fetch(`${getBackendBaseUrl()}/v1/blobs/${hash}`, {
        headers: { 'X-PF-Token': token },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      out.push(`data:image/png;base64,${buf.toString('base64')}`);
    }
    return out;
  }

  /** /healthz es publico (sin token): sirve de semaforo de conexion en el status bar. */
  async healthz(): Promise<HealthzInfo> {
    try {
      const res = await fetch(`${getBackendBaseUrl()}/healthz`);
      if (!res.ok) return { ok: false };
      return (await res.json()) as HealthzInfo;
    } catch {
      return { ok: false };
    }
  }
}
