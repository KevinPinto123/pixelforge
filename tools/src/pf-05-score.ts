import type { ComparisonReport, FacetId, FacetScore, ScoreReport } from './types.js';

/**
 * pf-05-score (SPEC-PIXELFORGE-ORCHESTRATOR.md §3, etapa 5).
 *
 * Convierte el informe de comparacion (§3 etapa 4) en scores 0..10 por faceta y
 * un agregado 0..10, DETERMINISTA. score_faceta = pct/10. El agregado es la media
 * ponderada; los pesos priorizan la fidelidad estructural sobre el color:
 *   structure 0.5, silhouette 0.3, palette 0.2  (suman 1.0 -> agregado en 0..10).
 * `weakest` = faceta de menor score; es el objetivo de la re-cola del loop-runner
 * (§6). Desempate determinista por prioridad structure > silhouette > palette.
 */
export const DEFAULT_FACET_WEIGHTS: Readonly<Record<FacetId, number>> = {
  structure: 0.5,
  silhouette: 0.3,
  palette: 0.2,
};

/** Orden de prioridad para desempatar `weakest` (el primero gana el empate). */
const FACET_ORDER: readonly FacetId[] = ['structure', 'silhouette', 'palette'];

function clamp10(v: number): number {
  if (v < 0) return 0;
  if (v > 10) return 10;
  return v;
}

export function scoreComparison(
  comparison: ComparisonReport,
  weights: Readonly<Record<FacetId, number>> = DEFAULT_FACET_WEIGHTS,
): ScoreReport {
  const facets: FacetScore[] = FACET_ORDER.map((facet) => {
    const pct = comparison.facets[facet].pct;
    return { facet, score: clamp10(pct / 10), pct, weight: weights[facet] };
  });

  const totalWeight = facets.reduce((s, f) => s + f.weight, 0) || 1;
  const aggregate = facets.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;

  let weakest: FacetScore = facets[0]!;
  for (const f of facets) {
    if (f.score < weakest.score) weakest = f; // '<' estricto -> primer minimo por FACET_ORDER
  }

  return { aggregate, facets, weakest: weakest.facet };
}
