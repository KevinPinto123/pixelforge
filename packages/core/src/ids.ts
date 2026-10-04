import { nanoid } from 'nanoid';
import type { Id } from '@pixelforge/contracts';

export function newId(): Id {
  return nanoid(16);
}

export function nowIso(): string {
  return new Date().toISOString();
}
