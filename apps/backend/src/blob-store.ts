import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Blobs content-addressed (spec §8): `blobs/<sha256[0:2]>/<sha256>`. Dedup gratis. */
export class BlobStore {
  constructor(private readonly dir: string) {}

  put(data: Buffer): string {
    const hash = createHash('sha256').update(data).digest('hex');
    const subDir = join(this.dir, hash.slice(0, 2));
    if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true });
    const path = join(subDir, hash);
    if (!existsSync(path)) writeFileSync(path, data);
    return hash;
  }

  path(hash: string): string {
    return join(this.dir, hash.slice(0, 2), hash);
  }
}
