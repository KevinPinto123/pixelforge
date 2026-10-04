import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readToken } from './config.js';

const BACKEND_ENTRY = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'backend',
  'dist',
  'index.js',
);

async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Thin client: si el backend no responde /healthz lo levanta como daemon
 * (spec §5: "el backend se lanza como daemon si no responde healthcheck").
 * Devuelve el token de auth interna leido de config.json una vez el backend arranco.
 */
export async function ensureBackend(baseUrl: string, timeoutMs = 10_000): Promise<string> {
  if (!(await isHealthy(baseUrl))) {
    if (!existsSync(BACKEND_ENTRY)) {
      throw new Error(
        `Backend no esta corriendo y no hay build en ${BACKEND_ENTRY}. Correr "pnpm --filter @pixelforge/backend build" primero.`,
      );
    }
    spawn(process.execPath, [BACKEND_ENTRY], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await isHealthy(baseUrl)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!(await isHealthy(baseUrl))) {
      throw new Error(`Backend no respondio /healthz en ${timeoutMs}ms tras intentar levantarlo.`);
    }
  }

  const token = readToken();
  if (!token) throw new Error('Backend healthy pero config.json sin token — estado inconsistente.');
  return token;
}
