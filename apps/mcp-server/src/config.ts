import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Espejo minimo de apps/backend/src/config.ts (misma convencion de ruta, sin logica de creacion: el backend es dueno del token). */
function getConfigPath(): string {
  const base = process.env.APPDATA ?? join(homedir(), '.config');
  return join(base, 'pixelforge', 'config.json');
}

export function readToken(): string | undefined {
  const path = getConfigPath();
  if (!existsSync(path)) return undefined;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { token?: string };
  return raw.token;
}
