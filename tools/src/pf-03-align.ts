import type { Cell } from './types.js';
import { cellMatchPct } from './cell-match.js';

/**
 * pf-03-align (SPEC-PIXELFORGE-ORCHESTRATOR.md §3, etapa 3).
 *
 * Registro determinista: la candidata puede estar desplazada 1-2 px respecto al
 * objetivo (silueta correcta, mala posicion). Prueba un conjunto FIJO y acotado
 * de traslaciones enteras (dx,dy en [-maxShift..maxShift]) y elige la que
 * maximiza cellMatchPct modo A. Costo O((2r+1)^2) comparaciones — con r=1 son 9.
 * No busca escala ni rotacion: el pixel-art no las tolera bien y romperia el
 * caracter determinista/barato de la toolchain.
 *
 * Desempate determinista: menor |dx|+|dy|, luego menor dx, luego menor dy
 * (favorece la identidad y desplazamientos minimos).
 */
export interface AlignResult {
  dx: number;
  dy: number;
  /** Celdas de la candidata trasladadas (huecos rellenos con null). */
  cells: Cell[];
  /** cellMatchPct modo A del mejor desplazamiento. */
  pct: number;
}

/** Traslada la grilla NxN por (dx,dy); celdas que salen del marco -> null. */
function shift(cells: ReadonlyArray<Cell>, N: number, dx: number, dy: number): Cell[] {
  if (dx === 0 && dy === 0) return cells.slice();
  const out: Cell[] = new Array<Cell>(N * N).fill(null);
  for (let y = 0; y < N; y += 1) {
    const sy = y - dy;
    if (sy < 0 || sy >= N) continue;
    for (let x = 0; x < N; x += 1) {
      const sx = x - dx;
      if (sx < 0 || sx >= N) continue;
      out[y * N + x] = cells[sy * N + sx] ?? null;
    }
  }
  return out;
}

export function alignToTarget(
  candidate: ReadonlyArray<Cell>,
  target: ReadonlyArray<Cell>,
  N: number,
  maxShift = 1,
): AlignResult {
  if (candidate.length !== N * N || target.length !== N * N) {
    throw new Error(
      `pf-03-align: se esperaban ${N * N} celdas (candidate=${candidate.length}, target=${target.length})`,
    );
  }
  const r = Math.max(0, Math.floor(maxShift));
  let best: AlignResult = { dx: 0, dy: 0, cells: candidate.slice(), pct: -1 };
  // Orden de barrido por |dx|+|dy| creciente garantiza el desempate deseado.
  const offsets: Array<[number, number]> = [];
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) offsets.push([dx, dy]);
  }
  offsets.sort((p, q) => {
    const mp = Math.abs(p[0]) + Math.abs(p[1]);
    const mq = Math.abs(q[0]) + Math.abs(q[1]);
    return mp - mq || p[0] - q[0] || p[1] - q[1];
  });

  for (const [dx, dy] of offsets) {
    const shifted = shift(candidate, N, dx, dy);
    const { pct } = cellMatchPct(shifted, target);
    if (pct > best.pct) best = { dx, dy, cells: shifted, pct };
  }
  return best;
}
