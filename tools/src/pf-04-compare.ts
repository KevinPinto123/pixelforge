import type { Cell, ComparisonReport, FacetId, FacetMetric } from './types.js';
import { cellMatchPct, normalizeHex } from './cell-match.js';

/**
 * pf-04-compare (SPEC-PIXELFORGE-ORCHESTRATOR.md §3, etapa 4).
 *
 * Descompone la comparacion grid-vs-target en facetas deterministas, todas
 * derivadas puramente de las celdas (sin modelo, sin azar):
 *  - structure : cellMatchPct modo A (§5) — igualdad exacta de celda. Headline.
 *  - silhouette: acuerdo de mascara de opacidad (opaco<->opaco, null<->null).
 *  - palette   : entre celdas opacas en AMBOS, % de color exacto igual
 *                (mide color aislado de la silueta; denominador = solapamiento).
 * Las tres son ortogonales y juntas explican por que baja `structure`.
 */
function isOpaque(c: Cell): boolean {
  return normalizeHex(c) !== null;
}

function silhouetteMetric(a: ReadonlyArray<Cell>, b: ReadonlyArray<Cell>): FacetMetric {
  const total = a.length;
  let matched = 0;
  for (let i = 0; i < total; i += 1) {
    if (isOpaque(a[i] ?? null) === isOpaque(b[i] ?? null)) matched += 1;
  }
  return { pct: total === 0 ? 100 : (matched / total) * 100, matched, considered: total };
}

function paletteMetric(a: ReadonlyArray<Cell>, b: ReadonlyArray<Cell>): FacetMetric {
  let considered = 0;
  let matched = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ca = normalizeHex(a[i] ?? null);
    const cb = normalizeHex(b[i] ?? null);
    if (ca === null || cb === null) continue; // solo donde ambos pintan
    considered += 1;
    if (ca === cb) matched += 1;
  }
  return { pct: considered === 0 ? 100 : (matched / considered) * 100, matched, considered };
}

export function compareGrid(
  candidate: ReadonlyArray<Cell>,
  target: ReadonlyArray<Cell>,
  N: number,
): ComparisonReport {
  const structure = cellMatchPct(candidate, target);
  const facets: Record<FacetId, FacetMetric> = {
    structure: {
      pct: structure.pct,
      matched: structure.matches,
      considered: structure.total,
    },
    silhouette: silhouetteMetric(candidate, target),
    palette: paletteMetric(candidate, target),
  };
  return {
    N,
    total: structure.total,
    cellMatchPct: structure.pct,
    matches: structure.matches,
    diff: structure.diff,
    facets,
  };
}
