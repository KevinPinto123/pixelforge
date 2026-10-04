import type { PixelGrid } from '@pixelforge/providers';

/**
 * Tipos compartidos de la toolchain determinista (SPEC-PIXELFORGE-ORCHESTRATOR.md
 * §3 toolchain, §5 comparador, §6 loop-runner). Todo lo de este paquete opera
 * sobre celdas canonicas: hex '#rrggbb' en minusculas, o null = celda transparente.
 */

/** Celda canonica: hex '#rrggbb' minusculas, o null (transparente). */
export type Cell = string | null;

/**
 * Objetivo de referencia ya rasterizado a grilla NxN (salida de pf-01-target).
 * Es la verdad contra la que el comparador mide (celda a celda, modo A).
 */
export interface TargetSpec {
  N: number;
  /** N*N celdas row-major, canonicas ('#rrggbb' | null). */
  cells: Cell[];
  /** Paleta observada en el objetivo (canonica, ordenada — determinista). */
  palette: string[];
  source: { width: number; height: number; alphaThreshold: number };
}

/** Grilla candidata normalizada al N del objetivo (salida de pf-02-normalize). */
export interface NormalizedCandidate {
  N: number;
  cells: Cell[];
  palette: string[];
}

/** Facetas puntuables. El agregado (0..10) es la media ponderada de estas. */
export type FacetId = 'structure' | 'silhouette' | 'palette';

/** Metrica cruda de una faceta (salida de pf-04-compare). */
export interface FacetMetric {
  /** Porcentaje 0..100 de acierto de la faceta. */
  pct: number;
  /** Celdas que cuentan como acierto. */
  matched: number;
  /** Celdas consideradas por la faceta (denominador). */
  considered: number;
}

/** Informe de comparacion determinista grid-vs-target (salida de pf-04-compare). */
export interface ComparisonReport {
  N: number;
  total: number;
  /** Headline: cellMatchPct modo A sobre las celdas alineadas. */
  cellMatchPct: number;
  matches: number;
  /** Mascara de diferencia por celda (true = distinta), longitud `total`. */
  diff: boolean[];
  facets: Record<FacetId, FacetMetric>;
}

/** Puntuacion 0..10 de una faceta (salida de pf-05-score). */
export interface FacetScore {
  facet: FacetId;
  /** 0..10. */
  score: number;
  /** Metrica cruda 0..100 de la que sale. */
  pct: number;
  weight: number;
}

/** Informe de puntuacion determinista (salida de pf-05-score). */
export interface ScoreReport {
  /** Agregado 0..10 (media ponderada de las facetas). */
  aggregate: number;
  facets: FacetScore[];
  /** Faceta con menor score — objetivo de la re-cola del loop-runner. */
  weakest: FacetId;
}

/** Resultado de renderizar la grilla a PNG final (salida de pf-06-render). */
export interface RenderResult {
  png: Buffer;
  postProcessed: boolean;
  /** Hash content-addressed del post-proceso, si se aplico. */
  hash?: string;
}

/** Evaluacion completa de una candidata: pf-02 -> pf-05 (sin render). */
export interface CandidateEvaluation {
  normalized: NormalizedCandidate;
  /** Desplazamiento entero elegido por pf-03-align y celdas ya alineadas. */
  align: { dx: number; dy: number; cells: Cell[]; pct: number };
  comparison: ComparisonReport;
  score: ScoreReport;
}

/** Descriptor de una etapa de la toolchain (para introspeccion/registro). */
export interface ToolDescriptor {
  id:
    | 'pf-01-target'
    | 'pf-02-normalize'
    | 'pf-03-align'
    | 'pf-04-compare'
    | 'pf-05-score'
    | 'pf-06-render';
  label: string;
  /** Toda la toolchain es determinista por contrato. */
  deterministic: true;
}

/** Re-export por conveniencia: la grilla candidata la emite un generador externo. */
export type { PixelGrid };
