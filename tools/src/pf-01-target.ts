import sharp from 'sharp';
import type { Cell, TargetSpec } from './types.js';
import { normalizeHex } from './cell-match.js';

/**
 * pf-01-target (SPEC-PIXELFORGE-ORCHESTRATOR.md §3, etapa 1).
 *
 * Rasteriza una imagen de referencia (PNG/cualquier formato que lea sharp) a una
 * grilla objetivo NxN canonica, DETERMINISTA:
 *  - resize a NxN con kernel 'nearest' (sin interpolacion suave -> reproducible)
 *    y fit 'fill' (la grilla objetivo es cuadrada, se rellena exacto).
 *  - por celda: alpha < umbral -> null; si no, hex '#rrggbb' redondeado del pixel.
 * sharp es la unica frontera con bytes de imagen (igual criterio que png-codec).
 */
export interface TargetOptions {
  /** Lado de la grilla objetivo NxN. */
  N: number;
  /** Alpha (0..255) por debajo del cual la celda se considera transparente. Default 128. */
  alphaThreshold?: number;
}

export async function targetFromImage(
  image: Buffer | Uint8Array,
  opts: TargetOptions,
): Promise<TargetSpec> {
  const { N } = opts;
  const alphaThreshold = opts.alphaThreshold ?? 128;
  if (!Number.isInteger(N) || N <= 0) {
    throw new Error(`pf-01-target: N invalido ${N} (debe ser entero > 0)`);
  }

  const { data, info } = await sharp(Buffer.from(image))
    .ensureAlpha()
    .resize(N, N, { kernel: 'nearest', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const count = N * N;
  const cells: Cell[] = new Array<Cell>(count);
  const paletteSet = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const alpha = data[o + 3] ?? 0;
    if (alpha < alphaThreshold) {
      cells[i] = null;
      continue;
    }
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const canon = normalizeHex(hex) as string;
    cells[i] = canon;
    paletteSet.add(canon);
  }

  return {
    N,
    cells,
    palette: [...paletteSet].sort(),
    source: { width: info.width, height: info.height, alphaThreshold },
  };
}
