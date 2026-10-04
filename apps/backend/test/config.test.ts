import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;
let originalAppData: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pixelforge-config-'));
  originalAppData = process.env.APPDATA;
  process.env.APPDATA = tmpDir;
});

afterEach(() => {
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('config', () => {
  it('crea token en el primer arranque y lo reutiliza despues', async () => {
    const { ensureConfig, getConfigPath } = await import('../src/config.js');
    const first = ensureConfig();
    expect(first.token).toHaveLength(64);
    expect(existsSync(getConfigPath())).toBe(true);

    const second = ensureConfig();
    expect(second.token).toBe(first.token);
  });
});
