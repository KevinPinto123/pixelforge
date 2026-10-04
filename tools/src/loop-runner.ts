import type {
  CandidateEvaluation,
  FacetId,
  FacetScore,
  PixelGrid,
  RenderResult,
  TargetSpec,
} from './types.js';
import { evaluateCandidate } from './toolchain.js';
import { renderGrid } from './pf-06-render.js';

/**
 * loop-runner (SPEC-PIXELFORGE-ORCHESTRATOR.md §6).
 *
 * Bucle de refinamiento puntuado por faceta con re-cola y criterios de parada.
 * El loop es determinista dado su generador y su reloj; la unica fuente de azar
 * es el generador inyectado (el modelo), aislado tras la interfaz `generate`.
 *
 * Cada pasada: generar candidata -> evaluar con la toolchain (pf-02..pf-05) ->
 * guardar la mejor -> re-encolar una tarea de refinamiento enfocada en la faceta
 * mas debil de la mejor candidata. Para cuando se cumple el PRIMER criterio:
 *   - target-score : agregado de la mejor >= targetScore (default 9)
 *   - stalled      : `maxNoImprovement` pasadas seguidas sin mejorar (default 5)
 *   - max-passes   : se alcanzo `maxPasses` (default 7)
 *   - hard-kill    : tiempo de pared >= `hardKillMs` (default 45 min)
 */
export type StopReason = 'target-score' | 'stalled' | 'max-passes' | 'hard-kill';

/** Contexto entregado al generador en cada pasada (incluye la pista de re-cola). */
export interface GenerateContext {
  /** Numero de pasada, 1-based. */
  pass: number;
  target: TargetSpec;
  /** Mejor pasada hasta ahora (undefined en la primera). */
  best?: PassRecord;
  /** Faceta mas debil a mejorar (la re-cola la fija desde la 2a pasada). */
  focusFacet?: FacetId;
  /** Pistas legibles de mejora derivadas de la mejor pasada. */
  hints: string[];
}

export interface PassRecord {
  pass: number;
  grid: PixelGrid;
  /** Agregado 0..10. */
  score: number;
  facets: FacetScore[];
  weakest: FacetId;
  evaluation: CandidateEvaluation;
  /** ms desde el arranque del loop al cierre de esta pasada. */
  elapsedMs: number;
  /** Presente si el generador o la evaluacion fallaron (pasada de score 0). */
  error?: string;
}

export interface LoopConfig {
  /** Agregado objetivo para parar con exito. Default 9. */
  targetScore?: number;
  /** Pasadas seguidas sin mejora antes de parar. Default 5. */
  maxNoImprovement?: number;
  /** Techo de pasadas. Default 7. */
  maxPasses?: number;
  /** Hard-kill de pared en ms. Default 45*60*1000. */
  hardKillMs?: number;
  /** Mejora minima del agregado para contar como "mejora". Default 1e-6. */
  minImprovement?: number;
  /** Post-procesar el render de la ganadora (pf-06). Default true. */
  postProcessWinner?: boolean;
  /** Radio de pf-03-align. Default 1. */
  maxShift?: number;
  /** Reloj inyectable (tests). Default () => Date.now(). */
  now?: () => number;
}

export interface LoopResult {
  stopReason: StopReason;
  passes: PassRecord[];
  best: PassRecord;
  /** Render de la ganadora (pf-06). Ausente solo si no hubo ninguna pasada valida. */
  render?: RenderResult;
  elapsedMs: number;
}

const DEFAULTS = {
  targetScore: 9,
  maxNoImprovement: 5,
  maxPasses: 7,
  hardKillMs: 45 * 60 * 1000,
  minImprovement: 1e-6,
} as const;

function buildContext(pass: number, target: TargetSpec, best: PassRecord | undefined): GenerateContext {
  if (!best) return { pass, target, hints: [] };
  const focusFacet = best.weakest;
  const facet = best.facets.find((f) => f.facet === focusFacet);
  const hints = [
    `mejorar faceta "${focusFacet}" (score ${facet ? facet.score.toFixed(2) : '?'}/10)`,
    `mejor agregado hasta ahora: ${best.score.toFixed(2)}/10`,
  ];
  return { pass, target, best, focusFacet, hints };
}

/**
 * Corre el loop. `generate` es el unico punto no-determinista: recibe el contexto
 * de la pasada (incluida la pista de re-cola) y devuelve una grilla candidata.
 * Un fallo del generador NO aborta el loop: se registra como pasada de score 0
 * (sin mejora), de modo que un generador persistentemente roto termina en
 * `stalled`/`max-passes` en vez de propagar la excepcion.
 */
export async function runLoop(
  target: TargetSpec,
  generate: (ctx: GenerateContext) => Promise<PixelGrid>,
  config: LoopConfig = {},
): Promise<LoopResult> {
  const targetScore = config.targetScore ?? DEFAULTS.targetScore;
  const maxNoImprovement = config.maxNoImprovement ?? DEFAULTS.maxNoImprovement;
  const maxPasses = config.maxPasses ?? DEFAULTS.maxPasses;
  const hardKillMs = config.hardKillMs ?? DEFAULTS.hardKillMs;
  const minImprovement = config.minImprovement ?? DEFAULTS.minImprovement;
  const now = config.now ?? (() => Date.now());
  const start = now();

  const passes: PassRecord[] = [];
  let best: PassRecord | undefined;
  let noImprove = 0;
  let stopReason: StopReason | undefined;

  // Re-cola: FIFO de tareas de generacion. Arranca con la pasada 1; cada pasada
  // no-terminal re-encola exactamente una tarea de refinamiento, asi que la cola
  // nunca se vacia mientras haya pasadas disponibles.
  const queue: GenerateContext[] = [buildContext(1, target, undefined)];

  while (true) {
    if (now() - start >= hardKillMs) {
      stopReason = 'hard-kill';
      break;
    }
    if (passes.length >= maxPasses) {
      stopReason = 'max-passes';
      break;
    }
    const ctx = queue.shift();
    if (!ctx) break; // cola vacia inesperada -> salir con lo que haya

    let evaluation: CandidateEvaluation | undefined;
    let grid: PixelGrid | undefined;
    let error: string | undefined;
    try {
      grid = await generate(ctx);
      evaluation = evaluateCandidate(grid, target, { maxShift: config.maxShift ?? 1 });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const rec: PassRecord = evaluation
      ? {
          pass: ctx.pass,
          grid: grid as PixelGrid,
          score: evaluation.score.aggregate,
          facets: evaluation.score.facets,
          weakest: evaluation.score.weakest,
          evaluation,
          elapsedMs: now() - start,
        }
      : {
          pass: ctx.pass,
          grid: (grid ?? { N: target.N, pixels: [], palette: [] }) as PixelGrid,
          score: 0,
          facets: [],
          weakest: 'structure',
          evaluation: {
            normalized: { N: target.N, cells: [], palette: [] },
            align: { dx: 0, dy: 0, cells: [], pct: 0 },
            comparison: {
              N: target.N,
              total: 0,
              cellMatchPct: 0,
              matches: 0,
              diff: [],
              facets: {
                structure: { pct: 0, matched: 0, considered: 0 },
                silhouette: { pct: 0, matched: 0, considered: 0 },
                palette: { pct: 0, matched: 0, considered: 0 },
              },
            },
            score: { aggregate: 0, facets: [], weakest: 'structure' },
          },
          elapsedMs: now() - start,
          ...(error !== undefined ? { error } : {}),
        };
    passes.push(rec);

    if (!best || rec.score > best.score + minImprovement) {
      best = rec;
      noImprove = 0;
    } else {
      noImprove += 1;
    }
    const currentBest = best; // best siempre definido aqui: rec recien empujado

    // Criterios de parada, en orden de prioridad.
    if (currentBest.score >= targetScore) {
      stopReason = 'target-score';
      break;
    }
    if (now() - start >= hardKillMs) {
      stopReason = 'hard-kill';
      break;
    }
    if (noImprove >= maxNoImprovement) {
      stopReason = 'stalled';
      break;
    }
    if (passes.length >= maxPasses) {
      stopReason = 'max-passes';
      break;
    }

    // Re-cola: siguiente tarea enfocada en la faceta mas debil de la mejor.
    queue.push(buildContext(passes.length + 1, target, currentBest));
  }

  if (!best) {
    throw new Error('loop-runner: ninguna pasada produjo una candidata evaluable');
  }
  const winner = best;

  const result: LoopResult = {
    stopReason: stopReason ?? 'stalled',
    passes,
    best: winner,
    elapsedMs: now() - start,
  };

  if (config.postProcessWinner !== false) {
    result.render = await renderGrid(winner.grid, { postProcess: true });
  }
  return result;
}
