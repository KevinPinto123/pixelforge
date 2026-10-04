import type { CreateProjectInput, Project } from '@pixelforge/contracts';

export interface PixelForgeError {
  error: { code: string; message: string; retryable: boolean; suggestion?: string };
}

export class PixelForgeRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-pf-token': this.token,
        ...init.headers,
      },
    });
    const body = (await res.json()) as unknown;
    if (!res.ok) {
      const problem = body as { title?: string; code?: string; detail?: string };
      throw new Error(
        `pixelforge backend ${res.status}: ${problem.code ?? problem.title ?? 'error'}${
          problem.detail ? ` — ${problem.detail}` : ''
        }`,
      );
    }
    return body as T;
  }

  healthz(): Promise<{ ok: boolean; version: string; providers: string[] }> {
    return this.request('/healthz');
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    return this.request('/v1/projects', { method: 'POST', body: JSON.stringify(input) });
  }

  getProject(id: string): Promise<Project> {
    return this.request(`/v1/projects/${encodeURIComponent(id)}`);
  }
}
