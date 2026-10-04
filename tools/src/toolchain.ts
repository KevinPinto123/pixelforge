import type { CandidateEvaluation, PixelGrid, TargetSpec, ToolDescriptor } from './types.js';
import { normalizeGrid } from './pf-02-normalize.js';
import { alignToTarget } from './pf-03-align.js';
import { compareGrid } from './pf-04-compare.js';
import { scoreComparison } from './pf-05-score.js';

/**
 * Registro ordenado de la toolchain determinista (SPEC-PIXELFORGE-ORCHESTRATOR.md
 * §3). Solo introspeccion/documentacion: la ejecucion vive en `evaluateCandidate`
 * (pf-02..pf-05) y en pf-06-render (renderGrid), invocados por el loop-runner (§6).
 */
export const PF_TOOLCHAIN: readonly ToolDescriptor[] = [
  { id: 'pf-01-target', label: 'Imagen de referencia -> grilla objetivo NxN (sharp)', deterministic: true },
  { id: 'pf-02-normalize', label: 'Candidata -> N objetivo + celdas canonicas', deterministic: true },
  { id: 'pf-03-align', label: 'Registro entero acotado (mejor cellMatchPct)', deterministic: true },
  { id: 'pf-04-compare', label: 'cellMatchPct + facetas (structure/silhouette/palette)', deterministic: true },
  { id: 'pf-05-score', label: 'Metricas -> scores 0..10 + agregado + weakest', deterministic: true },
  { id: 'pf-06-render', label: 'Grilla ganadora -> PNG (gridToPng + post-proceso)', deterministic: true },
] as const;

export interface EvaluateOptions {
  /** Radio maximo del registro entero de pf-03-align. Default 1 (±1 px). */
  maxShift?: number;
}

/**
 * Corre la toolchain de evaluacion (pf-02 -> pf-05) sobre una grilla candidata
 * contra un objetivo ya preparado (pf-01). No renderiza: el render (pf-06) es
 * terminal y solo se aplica a la ganadora (lo hace el loop-runner). Todo aca es
 * determinista: misma candidata + mismo objetivo -> misma evaluacion.
 */
export function evaluateCandidate(
  grid: PixelGrid,
  target: TargetSpec,
  opts: EvaluateOptions = {},
): CandidateEvaluation {
  const normalized = normalizeGrid(grid, target.N);
  const align = alignToTarget(normalized.cells, target.cells, target.N, opts.maxShift ?? 1);
  const comparison = compareGrid(align.cells, target.cells, target.N);
  const score = scoreComparison(comparison);
  return { normalized, align, comparison, score };
}
