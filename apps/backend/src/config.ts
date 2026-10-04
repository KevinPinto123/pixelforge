import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PixelForgeConfig {
  token: string;
}

/** %APPDATA%/pixelforge en Windows; ~/.config/pixelforge en otros SO (dev/CI). */
export function getConfigDir(): string {
  const base = process.env.APPDATA ?? join(homedir(), '.config');
  return join(base, 'pixelforge');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/** Blobs content-addressed (spec §8): assets generados/post-procesados. */
export function getBlobsDir(): string {
  return join(getConfigDir(), 'blobs');
}

/** undefined si no esta configurada: PixelLabApiAdapter no se registra (spec §10, secrets solo en .env del backend). */
export function getPixelLabApiKey(): string | undefined {
  return process.env.PIXELLAB_API_KEY;
}

/** Crea el token de auth interna en el primer arranque si no existe. Nunca lo loguea. */
export function ensureConfig(): PixelForgeConfig {
  const dir = getConfigDir();
  const path = getConfigPath();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PixelForgeConfig>;
    if (raw.token) return { token: raw.token };
  }
  mkdirSync(dir, { recursive: true });
  const config: PixelForgeConfig = { token: randomBytes(32).toString('hex') };
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}
