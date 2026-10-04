import type { Cell, NormalizedCandidate, PixelGrid } from './types.js';
import { canonicalHex, normalizeHex } from './cell-match.js';

/**
 * pf-02-normalize (SPEC-PIXELFORGE-ORCHESTRATOR.md §3, etapa 2).
 *
 * Lleva una grilla candidata (emitida por el generador, N libre) al N del
 * objetivo y a celdas canonicas, para que el comparador (§5) opere celda a celda
 * con la misma longitud. Si la candidata ya esta en el N objetivo, solo
 * canonicaliza. Si no, remuestrea por vecino-mas-cercano en espacio de grilla
 * (sin sharp: es reindexado entero puro, DETERMINISTA, sin mezcla de color).
 */
export function normalizeGrid(grid: PixelGrid, targetN: number): NormalizedCandidate {
  if (!Number.isInteger(targetN) || targetN <= 0) {
    throw new Error(`pf-02-normalize: targetN invalido ${targetN}`);
  }
  const srcN = grid.N;
  if (!Number.isInteger(srcN) || srcN <= 0) {
    throw new Error(`pf-02-normalize: N de la candidata invalido ${srcN}`);
  }

  const cells: Cell[] = new Array<Cell>(targetN * targetN);
  for (let y = 0; y < targetN; y += 1) {
    const sy = srcN === targetN ? y : Math.min(srcN - 1, Math.floor((y * srcN) / targetN));
    for (let x = 0; x < targetN; x += 1) {
      const sx = srcN === targetN ? x : Math.min(srcN - 1, Math.floor((x * srcN) / targetN));
      cells[y * targetN + x] = normalizeHex(grid.pixels[sy * srcN + sx] ?? null);
    }
  }

  const palette: string[] = [];
  const seen = new Set<string>();
  for (const raw of grid.palette) {
    const canon = canonicalHex(raw); // junk se descarta, no se convierte en negro
    if (canon != null && !seen.has(canon)) {
      seen.add(canon);
      palette.push(canon);
    }
  }

  return { N: targetN, cells, palette };
}
